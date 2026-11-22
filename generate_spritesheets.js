const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

// ── Frame Configuration ─────────────────────────────────────────
const FRAME_W = 140;
const FRAME_H = 200;
const COLS = 7;
const ROWS = 4;
const SHEET_W = COLS * FRAME_W; // 980
const SHEET_H = ROWS * FRAME_H; // 800

// ── Canvas Buffer with Full RGBA Antialiasing ────────────────────
class CanvasBuffer {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = Buffer.alloc(w * h * 4); // All zeros = fully transparent
  }

  setPixel(x, y, r, g, b, a = 255) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || x >= this.w || y < 0 || y >= this.h || a <= 0) return;
    const idx = (y * this.w + x) * 4;
    const srcA = a / 255;
    const dstA = this.data[idx + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);

    if (outA > 0) {
      this.data[idx] = Math.round((r * srcA + this.data[idx] * dstA * (1 - srcA)) / outA);
      this.data[idx + 1] = Math.round((g * srcA + this.data[idx + 1] * dstA * (1 - srcA)) / outA);
      this.data[idx + 2] = Math.round((b * srcA + this.data[idx + 2] * dstA * (1 - srcA)) / outA);
      this.data[idx + 3] = Math.round(outA * 255);
    }
  }

  fillCircle(cx, cy, r, color, alpha = 255) {
    const minX = Math.max(0, Math.floor(cx - r - 1));
    const maxX = Math.min(this.w - 1, Math.ceil(cx + r + 1));
    const minY = Math.max(0, Math.floor(cy - r - 1));
    const maxY = Math.min(this.h - 1, Math.ceil(cy + r + 1));
    const rSq = r * r;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dSq = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (dSq <= rSq) {
          const dist = Math.sqrt(dSq);
          const edge = Math.max(0, Math.min(1, r - dist + 0.6)) * alpha;
          this.setPixel(x, y, color[0], color[1], color[2], edge);
        }
      }
    }
  }

  // Smooth anatomically shaded capsule between two joints
  fillLimb(x1, y1, x2, y2, r1, r2, baseCol, highCol, shadowCol) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(4, Math.ceil(len * 1.5));

    // Shadow pass
    if (shadowCol) {
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const curX = x1 + dx * t;
        const curY = y1 + dy * t + 1.5;
        const curR = r1 + (r2 - r1) * t + 0.5;
        this.fillCircle(curX, curY, curR, shadowCol, 120);
      }
    }

    // Main base pass
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const curX = x1 + dx * t;
      const curY = y1 + dy * t;
      const curR = r1 + (r2 - r1) * t;
      this.fillCircle(curX, curY, curR, baseCol);
    }

    // Muscle highlight pass
    if (highCol) {
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const curX = x1 + dx * t - 1.2;
        const curY = y1 + dy * t - 1.2;
        const curR = (r1 + (r2 - r1) * t) * 0.55;
        this.fillCircle(curX, curY, curR, highCol, 150);
      }
    }
  }

  fillPolygon(pts, color, alpha = 255) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(this.h - 1, Math.ceil(maxY));

    for (let y = minY; y <= maxY; y++) {
      const nodes = [];
      let j = pts.length - 1;
      for (let i = 0; i < pts.length; i++) {
        if ((pts[i].y < y && pts[j].y >= y) || (pts[j].y < y && pts[i].y >= y)) {
          nodes.push(pts[i].x + (y - pts[i].y) / (pts[j].y - pts[i].y) * (pts[j].x - pts[i].x));
        }
        j = i;
      }
      nodes.sort((a, b) => a - b);
      for (let k = 0; k < nodes.length; k += 2) {
        if (nodes[k + 1] === undefined) break;
        const xStart = Math.max(0, Math.floor(nodes[k]));
        const xEnd = Math.min(this.w - 1, Math.ceil(nodes[k + 1]));
        for (let x = xStart; x <= xEnd; x++) {
          this.setPixel(x, y, color[0], color[1], color[2], alpha);
        }
      }
    }
  }

  fillRect(x, y, w, h, color, alpha = 255) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w - 1, Math.ceil(x + w));
    const y1 = Math.min(this.h - 1, Math.ceil(y + h));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        this.setPixel(cx, cy, color[0], color[1], color[2], alpha);
      }
    }
  }
}

// ── Color Utilities ─────────────────────────────────────────────
function lighten(c, amt) {
  return [Math.min(255, c[0] + amt), Math.min(255, c[1] + amt), Math.min(255, c[2] + amt)];
}
function darken(c, amt) {
  return [Math.max(0, c[0] - amt), Math.max(0, c[1] - amt), Math.max(0, c[2] - amt)];
}

// ── 8 Fighters Data ─────────────────────────────────────────────
const CHARACTERS = [
  {
    name: 'abilash',
    displayName: 'Abilash',
    style: 'Inferno Fist',
    skin: [215, 155, 115],
    hairColor: [35, 30, 30],
    hairType: 'wild_spikes',
    eyes: [255, 150, 20],
    facialHair: 'none',
    specialFeature: null,
    costume: 'open_karate_gi',
    torsoR: 17,
    hipR: 15,
    limbScale: 1.0,
    specialType: 'fire_dragon',
    primary: [240, 190, 20],   // Gold Gi
    secondary: [200, 30, 30],  // Crimson flame borders
    belt: [20, 20, 20],        // Black master belt
    pants: [30, 30, 35],       // Charcoal Gi pants with gold stripe
    boots: [190, 25, 25],      // Red fighting boots
    wraps: [220, 40, 20],      // Red flame hand wraps
    specialColor: [255, 90, 10], // Inferno blast
  },
  {
    name: 'anas',
    displayName: 'Anas',
    style: 'Iron Guard',
    skin: [220, 175, 135],
    hairColor: [25, 25, 25],
    hairType: 'side_part',
    eyes: [40, 35, 30],
    facialHair: 'full_beard',
    specialFeature: null,
    costume: 'kungfu_master',
    torsoR: 18,
    hipR: 16,
    limbScale: 1.05,
    specialType: 'iron_shockwave',
    primary: [245, 245, 250],  // Silk White Master Jacket
    secondary: [120, 130, 140], // Steel trim
    belt: [70, 75, 85],        // Iron Sash
    pants: [45, 48, 55],       // Charcoal Kung Fu pants
    boots: [25, 25, 30],       // Black slippers with white socks
    wraps: [150, 160, 175],    // Steel iron vambraces
    specialColor: [180, 220, 255], // Metallic Iron Shockwave
  },
  {
    name: 'dhinesh',
    displayName: 'Dhinesh',
    style: 'Shadow Strike',
    skin: [210, 160, 120],
    hairColor: [40, 35, 35],
    hairType: 'curls',
    eyes: [40, 35, 30],
    facialHair: 'stubble',
    specialFeature: 'flaming_eye', // CYAN FLAMING EYE!
    costume: 'shinobi_tunic',
    torsoR: 14,
    hipR: 13,
    limbScale: 0.88,
    specialType: 'cyan_phantom',
    primary: [80, 60, 120],    // Midnight Slate
    secondary: [160, 140, 210], // Lavender accents
    belt: [45, 35, 65],        // Dark Shinobi sash
    pants: [35, 30, 50],       // Assassin trousers with straps
    boots: [25, 20, 35],       // Black split-toe Tabi boots
    wraps: [0, 210, 255],      // Glowing cyan arm wraps
    specialColor: [0, 230, 255], // Soul flame blast
  },
  {
    name: 'farook',
    displayName: 'Farook',
    style: 'Thunder Claw',
    skin: [205, 150, 110],
    hairColor: [30, 25, 25],
    hairType: 'curly_top',
    eyes: [255, 205, 50],
    facialHair: 'goatee',
    specialFeature: null,
    costume: 'changshan_tunic',
    torsoR: 18,
    hipR: 16,
    limbScale: 1.05,
    specialType: 'thunder_claw',
    primary: [35, 95, 190],    // Royal Blue
    secondary: [240, 195, 30], // Pure Gold embroidery
    belt: [230, 180, 20],      // Gold sash
    pants: [25, 50, 95],       // Dark navy trousers
    boots: [30, 35, 50],       // Blue fighting boots
    wraps: [240, 190, 30],     // Spiked gold claw gauntlets
    specialColor: [70, 170, 255], // Crackling Lightning
  },
  {
    name: 'kiran',
    displayName: 'Kiran',
    style: 'Storm Blade',
    skin: [215, 160, 120],
    hairColor: [30, 30, 30],
    hairType: 'layered_shag',
    eyes: [40, 35, 30],
    facialHair: 'stubble',
    specialFeature: 'silver_chain',
    costume: 'brawler_vest',
    torsoR: 19,
    hipR: 17,
    limbScale: 1.1,
    specialType: 'storm_blade',
    primary: [190, 40, 40],    // Crimson Vest
    secondary: [30, 30, 30],   // Black leather trim
    belt: [40, 40, 45],        // Heavy utility belt
    pants: [50, 50, 55],       // Cargo combat pants
    boots: [30, 30, 35],       // Laced combat boots
    wraps: [180, 30, 30],      // Crimson hand wraps
    specialColor: [255, 60, 60], // Crimson energy blade
  },
  {
    name: 'nawin',
    displayName: 'Nawin',
    style: 'Venom Fury',
    skin: [200, 145, 105],
    hairColor: [25, 25, 25],
    hairType: 'dense_curls',
    eyes: [90, 255, 110],
    facialHair: 'heavy_beard',
    specialFeature: null,
    costume: 'venom_hood',
    torsoR: 15,
    hipR: 14,
    limbScale: 0.92,
    specialType: 'venom_acid',
    primary: [40, 145, 65],    // Toxic Green
    secondary: [20, 75, 35],   // Dark Serpent green
    belt: [160, 100, 30],      // Bronze studded belt
    pants: [35, 55, 40],       // Olive combat pants
    boots: [30, 40, 32],       // Combat boots
    wraps: [50, 170, 75],      // Spiked venom wraps
    specialColor: [60, 255, 90], // Toxic acid burst
  },
  {
    name: 'rafeek',
    displayName: 'Rafeek',
    style: 'Titan Grip',
    skin: [210, 155, 115],
    hairColor: [30, 30, 30],
    hairType: 'pompadour',
    eyes: [45, 35, 30],
    facialHair: 'thick_beard',
    specialFeature: 'gold_chain',
    costume: 'wrestler_jacket',
    torsoR: 24,
    hipR: 20,
    limbScale: 1.28,
    specialType: 'titan_earth',
    primary: [225, 115, 20],   // Rust Orange
    secondary: [85, 45, 20],   // Dark leather harness
    belt: [65, 35, 15],        // Heavy leather belt
    pants: [65, 45, 35],       // Brown grappler pants
    boots: [45, 30, 20],       // Heavy wrestling boots
    wraps: [210, 105, 20],     // Heavy leather bracers
    specialColor: [255, 160, 30], // Seismic ground shatter
  },
  {
    name: 'tharun',
    displayName: 'Tharun',
    style: 'Divine Wrath',
    skin: [215, 165, 125],
    hairColor: [25, 25, 25],
    hairType: 'sleek_pomp',
    eyes: [255, 220, 60],
    facialHair: 'trimmed_beard',
    specialFeature: 'vibhuti_tilak', // SACRED VIBHUTI + KUMKUMA TILAK!
    costume: 'divine_robes',
    torsoR: 17,
    hipR: 15,
    limbScale: 1.0,
    specialType: 'divine_trident',
    primary: [250, 245, 225],  // Cream Silk Angavastram
    secondary: [225, 180, 40], // Pure Gold Zari embroidery
    belt: [180, 30, 50],       // Crimson sash
    pants: [175, 25, 45],      // Royal Crimson pleated dhoti
    boots: [215, 165, 125],    // Barefoot with red alta & gold anklets
    wraps: [230, 190, 45],     // Sacred gold kadas/bangles
    specialColor: [255, 225, 80], // Radiant Divine Trident
  },
  {
    name: 'dharsan',
    displayName: 'Dharsan',
    style: 'Azure Flame',
    skin: [210, 155, 120],
    hairColor: [26, 22, 20],
    hairType: 'dense_curls',
    eyes: [255, 170, 0], // Golden amber eyes
    facialHair: 'stubble',
    specialFeature: 'amber_flame',
    costume: 'open_karate_gi',
    torsoR: 17,
    hipR: 15,
    limbScale: 1.01,
    specialType: 'azure_dragon',
    primary: [0, 180, 216],     // Azure Cyan
    secondary: [255, 111, 0],   // Amber flame trim
    belt: [20, 20, 20],
    pants: [25, 35, 45],
    boots: [0, 119, 182],
    wraps: [0, 229, 255],       // Cyan flame gauntlets
    specialColor: [0, 229, 255]
  },
  {
    name: 'yuga',
    displayName: 'Yuga',
    style: 'Ignite Horizon',
    skin: [200, 142, 112],
    hairColor: [24, 21, 19],
    hairType: 'curls',
    eyes: [255, 140, 0],
    facialHair: 'trimmed_beard',
    specialFeature: 'aviator_glasses',
    costume: 'changshan_tunic',
    torsoR: 17,
    hipR: 15,
    limbScale: 1.02,
    specialType: 'infernal_blast',
    primary: [255, 61, 0],      // Blazing Crimson
    secondary: [55, 71, 79],    // Charcoal Titanium
    belt: [38, 50, 56],
    pants: [33, 33, 33],
    boots: [45, 45, 45],
    wraps: [255, 69, 0],        // Crimson flame fist
    specialColor: [255, 69, 0]
  }
];

// ── Realistic Joint-Based Fighting Stance Renderer ──────────────
function renderFighter(buf, ox, oy, char, pose) {
  // Center: 70 inside 140 width, Ground baseline: 184 inside 200 height
  const cx = ox + 70 + (pose.offsetX || 0);
  const by = oy + 184 + (pose.offsetY || 0);

  const skin = char.skin;
  const skinHigh = lighten(skin, 35);
  const skinShadow = darken(skin, 45);

  const pants = char.pants;
  const pantsHigh = lighten(pants, 25);
  const pantsShadow = darken(pants, 35);

  const boots = char.boots;
  const bootsHigh = lighten(boots, 30);
  const bootsShadow = darken(boots, 35);

  const wraps = char.wraps;
  const wrapsHigh = lighten(wraps, 35);
  const wrapsShadow = darken(wraps, 35);

  // 1. Ground Shadow
  if (!pose.airborne) {
    const sw = pose.shadowW || 42;
    for (let r = sw; r > 0; r -= 3) {
      buf.fillCircle(cx, by - 1, r, [0, 0, 0], 8);
    }
  }

  // Core Body Joint Positions
  const hipX = cx + (pose.hipX || 0);
  const hipY = by - 76 + (pose.crouch || 0);

  const torsoX = hipX + (pose.torsoTiltX || 0);
  const torsoY = hipY - 42;

  const headX = torsoX + (pose.headTiltX || 0);
  const headY = torsoY - 26;

  const torsoR = char.torsoR || 17;
  const hipR = char.hipR || 15;
  const ls = char.limbScale || 1.0;

  // --- 2. BACK LEG ---
  const bHipX = hipX - 10 * ls;
  const bHipY = hipY;
  const bKneeX = bHipX + pose.bKneeDX * ls;
  const bKneeY = bHipY + pose.bKneeDY;
  const bFootX = bKneeX + pose.bFootDX * ls;
  const bFootY = bKneeY + pose.bFootDY;

  buf.fillLimb(bHipX, bHipY, bKneeX, bKneeY, 11 * ls, 8.5 * ls, darken(pants, 25), pants, pantsShadow);
  buf.fillLimb(bKneeX, bKneeY, bFootX, bFootY, 8.5 * ls, 7.5 * ls, darken(pants, 25), pants, pantsShadow);
  buf.fillCircle(bKneeX, bKneeY, 8 * ls, darken(pants, 35));

  // Back Foot
  buf.fillLimb(bFootX - 1, bFootY - 12, bFootX, bFootY, 7 * ls, 6 * ls, darken(boots, 20), boots, bootsShadow);
  buf.fillLimb(bFootX - 3, bFootY, bFootX + 11 * ls, bFootY, 5.5 * ls, 4.5 * ls, darken(boots, 20), boots, bootsShadow);

  // --- 3. BACK ARM (Guarding Chest/Solar Plexus) ---
  const bShX = torsoX - 8 * ls;
  const bShY = torsoY - 8;
  const bElbX = bShX + pose.bElbDX * ls;
  const bElbY = bShY + pose.bElbDY;
  const bFistX = bElbX + pose.bFistDX * ls;
  const bFistY = bElbY + pose.bFistDY;

  buf.fillCircle(bShX, bShY, 8 * ls, darken(skin, 25));
  buf.fillLimb(bShX, bShY, bElbX, bElbY, 8 * ls, 6.5 * ls, darken(skin, 25), skin, skinShadow);
  buf.fillLimb(bElbX, bElbY, bFistX, bFistY, 6.5 * ls, 6 * ls, darken(wraps, 20), wraps, wrapsShadow);
  buf.fillCircle(bFistX, bFistY, 6.5 * ls, darken(wraps, 20));

  // --- 4. TORSO & WAIST ---
  buf.fillCircle(hipX, hipY, hipR, darken(pants, 15));
  buf.fillLimb(hipX, hipY, torsoX, torsoY, hipR, torsoR, skin, skinHigh, skinShadow);

  // Six-pack abdominal muscles
  const midX = (hipX + torsoX) / 2;
  const midY = (hipY + torsoY) / 2;
  buf.fillRect(midX - 5, midY - 6, 10, 2, skinShadow, 160);
  buf.fillRect(midX - 6, midY + 2, 12, 2, skinShadow, 160);
  buf.fillRect(midX - 5, midY + 10, 10, 2, skinShadow, 160);
  buf.fillRect(midX, midY - 10, 1.5, 24, skinShadow, 180);

  // Pectoral muscles (Chests)
  buf.fillCircle(torsoX - 7, torsoY - 2, 8, skin, 255);
  buf.fillCircle(torsoX + 7, torsoY - 2, 8, skin, 255);
  buf.fillCircle(torsoX - 7, torsoY - 3, 5, skinHigh, 180);
  buf.fillCircle(torsoX + 7, torsoY - 3, 5, skinHigh, 180);

  // --- 5. MARTIAL ARTS COSTUME TOP ---
  const prim = char.primary;
  const primHigh = lighten(prim, 35);
  const primShadow = darken(prim, 40);
  const sec = char.secondary;

  if (char.costume === 'open_karate_gi') {
    // Abilash: Golden Karate Gi with Red flame lapels
    buf.fillPolygon([
      { x: torsoX - 19, y: torsoY - 14 },
      { x: torsoX - 7, y: torsoY - 14 },
      { x: hipX - 12, y: hipY + 4 },
      { x: hipX - 22, y: hipY + 2 }
    ], prim);
    buf.fillPolygon([
      { x: torsoX + 7, y: torsoY - 14 },
      { x: torsoX + 19, y: torsoY - 14 },
      { x: hipX + 22, y: hipY + 2 },
      { x: hipX + 12, y: hipY + 4 }
    ], prim);
    buf.fillLimb(torsoX - 19, torsoY - 14, hipX - 12, hipY + 4, 3, 3, sec, lighten(sec, 30));
    buf.fillLimb(torsoX + 19, torsoY - 14, hipX + 12, hipY + 4, 3, 3, sec, lighten(sec, 30));
  } else if (char.costume === 'kungfu_master') {
    // Anas: Pristine White Kung Fu master jacket with traditional buttons
    buf.fillLimb(hipX, hipY + 2, torsoX, torsoY - 6, 17, 19, prim, primHigh, primShadow);
    buf.fillLimb(torsoX, torsoY - 14, hipX, hipY + 4, 2, 2, sec);
    for (let fy = torsoY - 8; fy <= hipY; fy += 9) {
      buf.fillLimb(torsoX - 5, fy, torsoX + 5, fy, 1.5, 1.5, sec);
      buf.fillCircle(torsoX, fy, 2.5, [30, 30, 35]);
    }
  } else if (char.costume === 'shinobi_tunic') {
    // Dhinesh: Midnight Slate Shinobi Assassin tunic with cross harness
    buf.fillLimb(hipX, hipY + 2, torsoX, torsoY - 6, 16, 18, prim, primHigh, primShadow);
    buf.fillLimb(torsoX - 14, torsoY - 12, hipX + 12, hipY, 2.5, 2.5, sec);
    buf.fillLimb(torsoX + 14, torsoY - 12, hipX - 12, hipY, 2.5, 2.5, sec);
  } else if (char.costume === 'changshan_tunic') {
    // Farook: Royal Blue Changshan tunic with gold diagonal lapel
    buf.fillLimb(hipX, hipY + 2, torsoX, torsoY - 6, 17, 19, prim, primHigh, primShadow);
    buf.fillLimb(torsoX - 14, torsoY - 12, torsoX + 6, torsoY + 12, 3, 3, sec, lighten(sec, 30));
    buf.fillLimb(hipX - 16, hipY - 4, hipX + 16, hipY - 4, 2, 2, sec);
  } else if (char.costume === 'brawler_vest') {
    // Kiran: Crimson sleeveless open brawler vest
    buf.fillPolygon([
      { x: torsoX - 20, y: torsoY - 12 },
      { x: torsoX - 8, y: torsoY - 10 },
      { x: hipX - 12, y: hipY + 2 },
      { x: hipX - 20, y: hipY + 1 }
    ], prim);
    buf.fillPolygon([
      { x: torsoX + 8, y: torsoY - 10 },
      { x: torsoX + 20, y: torsoY - 12 },
      { x: hipX + 20, y: hipY + 1 },
      { x: hipX + 12, y: hipY + 2 }
    ], prim);
  } else if (char.costume === 'venom_hood') {
    // Nawin: Emerald venom combat tunic with serpent accents
    buf.fillLimb(hipX, hipY + 2, torsoX, torsoY - 6, 17, 19, prim, primHigh, primShadow);
    buf.fillLimb(torsoX - 12, torsoY - 14, torsoX + 12, torsoY - 14, 4, 4, sec);
    buf.fillCircle(torsoX, torsoY + 4, 5, sec);
  } else if (char.costume === 'wrestler_jacket') {
    // Rafeek: Titan orange padded jacket with heavy leather harness
    buf.fillLimb(hipX, hipY + 2, torsoX, torsoY - 6, 18, 20, prim, primHigh, primShadow);
    buf.fillLimb(torsoX - 14, torsoY - 12, hipX - 6, hipY + 2, 3.5, 3.5, sec);
    buf.fillLimb(torsoX + 14, torsoY - 12, hipX + 6, hipY + 2, 3.5, 3.5, sec);
  } else if (char.costume === 'divine_robes') {
    // Tharun: Cream silk Angavastram draped across left shoulder with gold zari border
    buf.fillLimb(hipX, hipY + 2, torsoX, torsoY - 6, 16, 18, [175, 25, 45], [210, 40, 60]); // Inner Crimson
    buf.fillPolygon([
      { x: torsoX - 18, y: torsoY - 14 },
      { x: torsoX - 5, y: torsoY - 14 },
      { x: hipX + 18, y: hipY + 4 },
      { x: hipX + 6, y: hipY + 6 }
    ], prim);
    buf.fillLimb(torsoX - 18, torsoY - 14, hipX + 18, hipY + 4, 3, 3, sec, lighten(sec, 30));
  }

  // Belt / Master Sash
  buf.fillLimb(hipX - 17, hipY - 2, hipX + 17, hipY - 2, 5, 5, char.belt, lighten(char.belt, 25), darken(char.belt, 20));
  buf.fillLimb(hipX + 2, hipY - 2, hipX + 6, hipY + 18, 3, 2, char.belt);
  buf.fillLimb(hipX - 2, hipY - 2, hipX - 5, hipY + 16, 3, 2, char.belt);

  // Accessories
  if (char.specialFeature === 'silver_chain') {
    buf.fillLimb(torsoX - 7, torsoY - 12, torsoX + 7, torsoY - 4, 1.8, 1.8, [220, 225, 235]);
    buf.fillCircle(torsoX, torsoY - 3, 3, [240, 245, 255]);
  } else if (char.specialFeature === 'gold_chain') {
    buf.fillLimb(torsoX - 8, torsoY - 12, torsoX + 8, torsoY - 4, 2.2, 2.2, [245, 195, 30]);
    buf.fillCircle(torsoX, torsoY - 3, 3.5, [255, 220, 40]);
  }

  // --- 6. FRONT LEG ---
  const fHipX = hipX + 8 * ls;
  const fHipY = hipY;
  const fKneeX = fHipX + pose.fKneeDX * ls;
  const fKneeY = fHipY + pose.fKneeDY;
  const fFootX = fKneeX + pose.fFootDX * ls;
  const fFootY = fKneeY + pose.fFootDY;

  buf.fillLimb(fHipX, fHipY, fKneeX, fKneeY, 12 * ls, 9 * ls, pants, pantsHigh, pantsShadow);
  buf.fillLimb(fKneeX, fKneeY, fFootX, fFootY, 9 * ls, 8 * ls, pants, pantsHigh, pantsShadow);
  buf.fillCircle(fKneeX, fKneeY, 8.5 * ls, darken(pants, 20));

  // Front Foot
  buf.fillLimb(fFootX - 1, fFootY - 13, fFootX, fFootY, 7.5 * ls, 6.5 * ls, boots, bootsHigh, bootsShadow);
  const toeExtend = (pose.kickExtend ? 24 : 14) * ls;
  buf.fillLimb(fFootX - 4, fFootY, fFootX + toeExtend, fFootY, 6 * ls, 4.5 * ls, boots, bootsHigh, bootsShadow);

  // Tharun sacred Alta & anklet
  if (char.name === 'tharun') {
    buf.fillCircle(fFootX, fFootY - 7, 6, [230, 190, 45]);
    buf.fillCircle(fFootX + 5, fFootY, 4.5, [190, 20, 30]);
  }

  // --- 7. NECK & HEAD ---
  buf.fillLimb(torsoX, torsoY - 12, headX, headY + 8, 8, 7.5, skin, skinHigh, skinShadow);

  // Head base with jawline
  buf.fillCircle(headX, headY, 15, skin);
  buf.fillCircle(headX - 1, headY - 1, 13, skinHigh, 160);
  buf.fillLimb(headX - 6, headY + 4, headX + 3, headY + 16, 6, 4.5, skin);
  buf.fillLimb(headX + 6, headY + 4, headX + 3, headY + 16, 6, 4.5, skin);

  // Eyebrows
  buf.fillLimb(headX - 8, headY - 4, headX - 1, headY - 3, 2, 1.5, [30, 25, 25]);
  buf.fillLimb(headX + 3, headY - 4, headX + 10, headY - 3, 2, 1.5, [30, 25, 25]);

  // Eyes
  if (char.eyes) {
    buf.fillCircle(headX - 4, headY + 1, 3, char.eyes);
    buf.fillCircle(headX + 6, headY + 1, 3, char.eyes);
    buf.fillCircle(headX - 3.5, headY + 1, 1.5, [255, 255, 255]);
    buf.fillCircle(headX + 6.5, headY + 1, 1.5, [255, 255, 255]);
  }

  // DHINESH SIGNATURE: Radiant Cyan Eye Flame bursting from right eye!
  if (char.specialFeature === 'flaming_eye') {
    const efX = headX + 7;
    const efY = headY;
    for (let fl = 1; fl <= 6; fl++) {
      buf.fillCircle(efX + Math.sin(fl * 0.8) * 4, efY - fl * 4.5, 4.5 + fl * 0.8, [0, 230, 255], 170 - fl * 24);
      buf.fillCircle(efX + Math.sin(fl * 0.8) * 2, efY - fl * 3.5, 2.5 + fl * 0.5, [255, 255, 255], 210 - fl * 30);
    }
  }

  // THARUN SIGNATURE: Sacred 3 White Vibhuti Stripes + Red Kumkuma Tilak!
  if (char.specialFeature === 'vibhuti_tilak') {
    buf.fillRect(headX - 8, headY - 11, 16, 1.6, [255, 255, 255]);
    buf.fillRect(headX - 8, headY - 9, 16, 1.6, [255, 255, 255]);
    buf.fillRect(headX - 8, headY - 7, 16, 1.6, [255, 255, 255]);
    buf.fillCircle(headX, headY - 9, 2.2, [210, 20, 30]);
  }

  // YUGA SIGNATURE: Aviator Glasses with Fiery Reflection!
  if (char.specialFeature === 'aviator_glasses') {
    // Metal brow bar
    buf.fillRect(headX - 9, headY - 4, 19, 1.5, [180, 170, 160]);
    // Left lens frame & fiery glass
    buf.fillRect(headX - 9, headY - 2, 8, 8, [200, 180, 70]);
    buf.fillRect(headX - 8, headY - 1, 6, 6, [255, 85, 0], 190);
    buf.fillRect(headX - 7, headY, 3, 3, [255, 200, 50], 220);
    // Right lens frame & fiery glass
    buf.fillRect(headX + 2, headY - 2, 8, 8, [200, 180, 70]);
    buf.fillRect(headX + 3, headY - 1, 6, 6, [255, 85, 0], 190);
    buf.fillRect(headX + 4, headY, 3, 3, [255, 200, 50], 220);
    // Bridge
    buf.fillRect(headX - 1, headY, 3, 1.5, [180, 170, 160]);
  }

  // Nose bridge & mouth
  buf.fillLimb(headX + 1, headY, headX + 2, headY + 6, 1.8, 1.5, skinShadow);
  if (pose.battleRoar) {
    buf.fillCircle(headX + 1, headY + 10, 4, [60, 20, 20]);
    buf.fillRect(headX - 2, headY + 8, 6, 2, [255, 255, 255]);
  } else {
    buf.fillLimb(headX - 4, headY + 10, headX + 6, headY + 10, 1.5, 1.5, [60, 25, 25]);
    buf.fillRect(headX - 3, headY + 9, 6, 1.5, [255, 255, 255]);
  }

  // Facial Hair
  const hc = char.hairColor;
  const hcHigh = lighten(hc, 30);

  if (char.facialHair === 'full_beard' || char.facialHair === 'heavy_beard' || char.facialHair === 'thick_beard') {
    const bRad = char.facialHair === 'heavy_beard' ? 12 : 10;
    buf.fillCircle(headX + 1, headY + 13, bRad, hc);
    buf.fillLimb(headX - 10, headY + 7, headX + 10, headY + 7, 3, 3, hc);
  } else if (char.facialHair === 'goatee') {
    buf.fillLimb(headX + 1, headY + 10, headX + 1, headY + 17, 3.5, 3.5, hc);
    buf.fillLimb(headX - 5, headY + 8, headX + 7, headY + 8, 2, 2, hc);
  } else if (char.facialHair === 'trimmed_beard') {
    buf.fillLimb(headX - 9, headY + 6, headX + 1, headY + 15, 3, 3, hc);
    buf.fillLimb(headX + 9, headY + 6, headX + 1, headY + 15, 3, 3, hc);
  }

  // Hair Styles
  if (char.hairType === 'wild_spikes') {
    buf.fillCircle(headX, headY - 8, 15, hc);
    for (let sp = -4; sp <= 4; sp++) {
      const a = (sp * 22) * (Math.PI / 180);
      buf.fillLimb(headX, headY - 6, headX + Math.sin(a) * 18, headY - 8 - Math.cos(a) * 18, 5, 2, hc, hcHigh);
    }
  } else if (char.hairType === 'side_part') {
    buf.fillLimb(headX - 14, headY - 14, headX + 14, headY - 12, 10, 10, hc, hcHigh);
    buf.fillCircle(headX - 2, headY - 12, 14, hc, hcHigh);
  } else if (char.hairType === 'curls' || char.hairType === 'dense_curls') {
    buf.fillCircle(headX, headY - 8, 16, hc);
    for (let c = 0; c < 9; c++) {
      const a = (c * 40) * (Math.PI / 180);
      buf.fillCircle(headX + Math.sin(a) * 14, headY - 10 + Math.cos(a) * 8, 7, hc, hcHigh);
    }
  } else if (char.hairType === 'curly_top') {
    buf.fillLimb(headX - 10, headY - 12, headX + 10, headY - 12, 11, 11, hc, hcHigh);
    for (let c = -3; c <= 3; c++) {
      buf.fillCircle(headX + c * 4, headY - 18, 5, hc, hcHigh);
    }
  } else if (char.hairType === 'layered_shag') {
    buf.fillCircle(headX, headY - 8, 16, hc);
    buf.fillLimb(headX - 12, headY - 12, headX - 16, headY + 4, 4, 3, hc);
    buf.fillLimb(headX + 12, headY - 12, headX + 16, headY + 4, 4, 3, hc);
  } else if (char.hairType === 'pompadour' || char.hairType === 'sleek_pomp') {
    buf.fillLimb(headX - 10, headY - 16, headX + 12, headY - 16, 12, 12, hc, hcHigh);
    buf.fillLimb(headX - 6, headY - 20, headX + 8, headY - 12, 9, 9, hc, hcHigh);
  }

  // --- 8. FRONT ARM (Raised in Front Guard / Attacking) ---
  const fShX = torsoX + 12 * ls;
  const fShY = torsoY - 8;
  const fElbX = fShX + pose.fElbDX * ls;
  const fElbY = fShY + pose.fElbDY;
  const fFistX = fElbX + pose.fFistDX * ls;
  const fFistY = fElbY + pose.fFistDY;

  buf.fillCircle(fShX, fShY, 9 * ls, skin, skinHigh);
  buf.fillLimb(fShX, fShY, fElbX, fElbY, 9 * ls, 7.5 * ls, skin, skinHigh, skinShadow);
  buf.fillLimb(fElbX, fElbY, fFistX, fFistY, 7.5 * ls, 7 * ls, wraps, wrapsHigh, wrapsShadow);
  buf.fillCircle(fFistX, fFistY, 7.5 * ls, wraps, wrapsHigh);

  // Punch Impact Effect
  if (pose.punchImpact) {
    for (let s = 1; s <= 4; s++) {
      buf.fillCircle(fFistX + s * 11, fFistY, 5 + s * 4, [255, 255, 255], 160 - s * 35);
      buf.fillCircle(fFistX + s * 11, fFistY, 3 + s * 2, char.specialColor, 180 - s * 30);
    }
  }

  // --- 9. SPECIAL ATTACK SIGNATURE ENERGY BURST ---
  if (pose.specialFX) {
    const sc = char.specialColor;
    const fxX = torsoX + 50;
    const fxY = torsoY - 4;
    const sType = char.specialType || 'fire_dragon';

    if (sType === 'fire_dragon') {
      // Abilash: Blazing Dragon Flame Vortex
      for (let r = 42; r > 0; r -= 4) {
        buf.fillCircle(fxX, fxY, r, [255, 60, 10], 80);
      }
      for (let f = 0; f < 10; f++) {
        const a = (f * 36) * (Math.PI / 180);
        buf.fillCircle(fxX + Math.cos(a) * 32, fxY + Math.sin(a) * 20, 10, [255, 200, 20], 190);
        buf.fillCircle(fxX + Math.cos(a) * 20, fxY + Math.sin(a) * 12, 6, [255, 255, 255], 240);
      }
    } else if (sType === 'iron_shockwave') {
      // Anas: Metallic Sonic Palm Shockwaves
      for (let sw = 15; sw <= 45; sw += 10) {
        buf.fillCircle(fxX, fxY, sw, [180, 220, 255], 85);
        buf.fillCircle(fxX, fxY, sw - 3, [0, 0, 0], 0);
      }
      buf.fillCircle(fxX, fxY, 18, [255, 255, 255], 255);
    } else if (sType === 'cyan_phantom') {
      // Dhinesh: Void Blade Arc / Soul Phantom Wave
      for (let r = 38; r > 0; r -= 5) {
        buf.fillCircle(fxX, fxY, r, [0, 230, 255], 100);
      }
      buf.fillLimb(fxX - 10, fxY - 35, fxX + 25, fxY, 6, 2, [0, 255, 255], [255, 255, 255]);
      buf.fillLimb(fxX - 10, fxY + 35, fxX + 25, fxY, 6, 2, [0, 255, 255], [255, 255, 255]);
    } else if (sType === 'thunder_claw') {
      // Farook: Crackling Golden Thunder Bolts
      for (let r = 36; r > 0; r -= 4) {
        buf.fillCircle(fxX, fxY, r, [70, 170, 255], 90);
      }
      buf.fillLimb(fxX - 25, fxY - 20, fxX + 10, fxY - 5, 3, 3, [255, 230, 50], [255, 255, 255]);
      buf.fillLimb(fxX + 10, fxY - 5, fxX - 5, fxY + 12, 3, 3, [255, 230, 50], [255, 255, 255]);
      buf.fillLimb(fxX - 5, fxY + 12, fxX + 30, fxY + 25, 3.5, 1.5, [255, 230, 50], [255, 255, 255]);
    } else if (sType === 'storm_blade') {
      // Kiran: Crimson Cross Energy Blade
      for (let r = 38; r > 0; r -= 4) {
        buf.fillCircle(fxX, fxY, r, [255, 40, 40], 85);
      }
      buf.fillLimb(fxX - 20, fxY - 30, fxX + 25, fxY + 30, 5, 2, [255, 60, 60], [255, 255, 255]);
      buf.fillLimb(fxX - 20, fxY + 30, fxX + 25, fxY - 30, 5, 2, [255, 60, 60], [255, 255, 255]);
    } else if (sType === 'venom_acid') {
      // Nawin: Toxic Serpent Acid Burst
      for (let r = 38; r > 0; r -= 4) {
        buf.fillCircle(fxX, fxY, r, [50, 220, 80], 90);
      }
      for (let b = 0; b < 7; b++) {
        const ba = (b * 51) * (Math.PI / 180);
        buf.fillCircle(fxX + Math.cos(ba) * 26, fxY + Math.sin(ba) * 22, 7, [70, 255, 100], 210);
        buf.fillCircle(fxX + Math.cos(ba) * 26, fxY + Math.sin(ba) * 22, 3.5, [220, 255, 230], 255);
      }
    } else if (sType === 'titan_earth') {
      // Rafeek: Massive Molten Seismic Boulder Burst
      for (let r = 46; r > 0; r -= 4) {
        buf.fillCircle(fxX, fxY, r, [255, 140, 20], 90);
      }
      for (let rk = 0; rk < 6; rk++) {
        const ra = (rk * 60) * (Math.PI / 180);
        buf.fillCircle(fxX + Math.cos(ra) * 30, fxY + Math.sin(ra) * 26, 11, [85, 45, 20], 230);
        buf.fillCircle(fxX + Math.cos(ra) * 30, fxY + Math.sin(ra) * 26, 7, [255, 160, 30], 255);
      }
    } else if (sType === 'divine_trident') {
      // Tharun: Sacred Golden Surya Trident Burst
      for (let r = 42; r > 0; r -= 4) {
        buf.fillCircle(fxX, fxY, r, [255, 220, 60], 90);
      }
      buf.fillLimb(fxX - 25, fxY, fxX + 35, fxY, 4, 3, [255, 215, 0], [255, 255, 255]);
      buf.fillLimb(fxX + 15, fxY - 22, fxX + 35, fxY - 22, 3, 2, [255, 215, 0], [255, 255, 255]);
      buf.fillLimb(fxX + 15, fxY + 22, fxX + 35, fxY + 22, 3, 2, [255, 215, 0], [255, 255, 255]);
    } else if (sType === 'azure_dragon') {
      // Dharsan: Roaring Azure Celestial Meteor Burst
      for (let r = 42; r > 0; r -= 4) {
        buf.fillCircle(fxX, fxY, r, [0, 180, 216], 90);
      }
      for (let f = 0; f < 8; f++) {
        const a = (f * 45) * (Math.PI / 180);
        buf.fillCircle(fxX + Math.cos(a) * 28, fxY + Math.sin(a) * 20, 9, [0, 229, 255], 200);
        buf.fillCircle(fxX + Math.cos(a) * 28, fxY + Math.sin(a) * 20, 5, [255, 255, 255], 255);
      }
    } else if (sType === 'infernal_blast') {
      // Yuga: Blazing Infernal Horizon Concussive Wave
      for (let sw = 14; sw <= 44; sw += 10) {
        buf.fillCircle(fxX, fxY, sw, [255, 61, 0], 90);
      }
      for (let b = 0; b < 8; b++) {
        const ba = (b * 45) * (Math.PI / 180);
        buf.fillCircle(fxX + Math.cos(ba) * 30, fxY + Math.sin(ba) * 24, 8, [255, 140, 0], 210);
        buf.fillCircle(fxX + Math.cos(ba) * 30, fxY + Math.sin(ba) * 24, 4, [255, 255, 255], 255);
      }
    }
  }

  // --- 10. VICTORY RADIANT AURA ---
  if (pose.victoryFX) {
    const vc = char.specialColor;
    for (let va = 0; va < 8; va++) {
      const vAng = (va * 45) * (Math.PI / 180);
      const vx = headX + Math.sin(vAng) * 38;
      const vy = headY - 14 + Math.cos(vAng) * 38;
      buf.fillCircle(vx, vy, 6, vc, 150);
      buf.fillCircle(vx, vy, 3, [255, 255, 255], 220);
    }
  }
}

// ── Joint-Based Kinematics for All 28 Animation Frames ──────────
function getFrameKinematics(frameIndex) {
  // Base 3/4 Fighting Stance Joint Displacements:
  // Back leg goes down and backward: bKneeDX = -12, bKneeDY = 36; bFootDX = -8, bFootDY = 38
  // Front leg goes down and forward: fKneeDX = 14, fKneeDY = 35; fFootDX = 8, fFootDY = 38
  // Back arm guards ribs/chest: bElbDX = 4, bElbDY = 22; bFistDX = 8, bFistDY = -14
  // Front arm raised guarding face: fElbDX = 12, fElbDY = 20; fFistDX = 10, fFistDY = -18
  const base = {
    crouch: 0,
    offsetX: 0,
    offsetY: 0,
    torsoTiltX: 2,
    headTiltX: 1,
    bKneeDX: -12,
    bKneeDY: 36,
    bFootDX: -8,
    bFootDY: 38,
    fKneeDX: 14,
    fKneeDY: 35,
    fFootDX: 8,
    fFootDY: 38,
    bElbDX: 4,
    bElbDY: 22,
    bFistDX: 8,
    bFistDY: -14,
    fElbDX: 12,
    fElbDY: 20,
    fFistDX: 10,
    fFistDY: -18,
    airborne: false
  };

  // 1. Idle (Frames 0, 1, 2, 3) - Authentic Mortal Kombat Stance Bobbing
  if (frameIndex >= 0 && frameIndex <= 3) {
    const t = (frameIndex / 4) * Math.PI * 2;
    const bob = Math.sin(t);
    return {
      ...base,
      crouch: bob * 4,
      fElbDY: 20 + bob * 2,
      bElbDY: 22 + bob * 2,
      fKneeDY: 35 + bob * 2,
      bKneeDY: 36 + bob * 2
    };
  }

  // 2. Walk Cycle (Frames 4, 5, 6, 7) - Martial arts footwork advance
  if (frameIndex >= 4 && frameIndex <= 7) {
    const step = frameIndex - 4;
    const stride = Math.sin((step / 4) * Math.PI * 2);
    return {
      ...base,
      crouch: Math.abs(stride) * 3,
      torsoTiltX: 5,
      fKneeDX: 14 + stride * 14,
      fFootDX: 8 + stride * 10,
      bKneeDX: -12 - stride * 14,
      bFootDX: -8 - stride * 10,
      fElbDX: 12 - stride * 6,
      bElbDX: 4 + stride * 6
    };
  }

  // 3. Jump (Frames 8, 9, 10)
  if (frameIndex === 8) {
    // Jump crouch preparation
    return {
      ...base,
      crouch: 18,
      torsoTiltX: 6,
      fKneeDX: 18,
      fKneeDY: 28,
      fFootDX: 12,
      fFootDY: 28,
      bKneeDX: -18,
      bKneeDY: 28,
      bFootDX: -12,
      bFootDY: 28,
      fElbDY: 24,
      bElbDY: 24
    };
  }
  if (frameIndex === 9) {
    // Airborne apex tuck
    return {
      ...base,
      offsetY: -36,
      airborne: true,
      shadowW: 24,
      fKneeDX: 16,
      fKneeDY: 16, // Tucked high
      fFootDX: 10,
      fFootDY: 18,
      bKneeDX: -16,
      bKneeDY: 16,
      bFootDX: -10,
      bFootDY: 18,
      fElbDY: 12,
      bElbDY: 12
    };
  }
  if (frameIndex === 10) {
    // Airborne descent extension
    return {
      ...base,
      offsetY: -16,
      airborne: true,
      shadowW: 32,
      fKneeDX: 14,
      fKneeDY: 28,
      fFootDX: 8,
      fFootDY: 32,
      bKneeDX: -12,
      bKneeDY: 28,
      bFootDX: -8,
      bFootDY: 32
    };
  }

  // 4. Punch (Frames 11, 12, 13)
  if (frameIndex === 11) {
    // Chamber back fist
    return {
      ...base,
      torsoTiltX: -6,
      fElbDX: 6,
      fElbDY: 16,
      fFistDX: 4,
      fFistDY: -10, // pulled back tight
      bElbDX: 2,
      bElbDY: 22
    };
  }
  if (frameIndex === 12) {
    // Full extension thrust cross punch!
    return {
      ...base,
      offsetX: 12,
      torsoTiltX: 14,
      // Front arm extends horizontally straight out
      fElbDX: 26,
      fElbDY: 2,
      fFistDX: 28,
      fFistDY: 0,
      punchImpact: true,
      battleRoar: true,
      bElbDX: -4,
      bElbDY: 18,
      bFistDX: 6,
      bFistDY: -10
    };
  }
  if (frameIndex === 13) {
    // Punch recoil
    return {
      ...base,
      offsetX: 4,
      torsoTiltX: 6,
      fElbDX: 16,
      fElbDY: 12,
      fFistDX: 16,
      fFistDY: -8
    };
  }

  // 5. Kick (Frames 14, 15, 16)
  if (frameIndex === 14) {
    // Chamber front knee high
    return {
      ...base,
      torsoTiltX: -8,
      fKneeDX: 20,
      fKneeDY: 6, // Knee pulled up to chest!
      fFootDX: -4,
      fFootDY: 22,
      bKneeDX: -6,
      bKneeDY: 36,
      bFootDX: -4,
      bFootDY: 38
    };
  }
  if (frameIndex === 15) {
    // Explosive high side / roundhouse kick!
    return {
      ...base,
      offsetX: 16,
      torsoTiltX: -18, // Lean back for full extension
      fKneeDX: 26,
      fKneeDY: -2,
      fFootDX: 30, // Straight out horizontal!
      fFootDY: 0,
      kickExtend: true,
      battleRoar: true,
      bKneeDX: -8,
      bKneeDY: 36,
      bFootDX: -4,
      bFootDY: 38,
      fElbDX: 10,
      fElbDY: 14,
      bElbDX: -8,
      bElbDY: 16
    };
  }
  if (frameIndex === 16) {
    // Kick recoil
    return {
      ...base,
      torsoTiltX: -6,
      fKneeDX: 18,
      fKneeDY: 18,
      fFootDX: 6,
      fFootDY: 26
    };
  }

  // 6. Block (Frames 17, 18)
  if (frameIndex === 17 || frameIndex === 18) {
    // Solid cross-arm defensive guard
    return {
      ...base,
      crouch: 6,
      torsoTiltX: -4,
      fElbDX: 8,
      fElbDY: 12,
      fFistDX: -2,
      fFistDY: -22, // Guarding face
      bElbDX: 2,
      bElbDY: 14,
      bFistDX: 6,
      bFistDY: -20  // Guarding chest
    };
  }

  // 7. Special Attack (Frames 19, 20, 21, 22)
  if (frameIndex === 19) {
    // Energy gather
    return {
      ...base,
      crouch: 10,
      torsoTiltX: -10,
      fElbDX: 8,
      fElbDY: 14,
      fFistDX: -2,
      fFistDY: -10,
      bElbDX: 0,
      bElbDY: 16,
      bFistDX: 2,
      bFistDY: -10,
      battleRoar: true
    };
  }
  if (frameIndex === 20 || frameIndex === 21) {
    // Explosive forward elemental release!
    return {
      ...base,
      offsetX: 16,
      crouch: 4,
      torsoTiltX: 16,
      fElbDX: 24,
      fElbDY: 4,
      fFistDX: 26,
      fFistDY: 0,
      bElbDX: 20,
      bElbDY: 8,
      bFistDX: 24,
      bFistDY: 2,
      specialFX: true,
      battleRoar: true
    };
  }
  if (frameIndex === 22) {
    // Special recovery
    return {
      ...base,
      offsetX: 8,
      torsoTiltX: 8,
      fElbDX: 18,
      fElbDY: 10,
      fFistDX: 16,
      fFistDY: -4
    };
  }

  // 8. Hit Reaction (Frames 23, 24)
  if (frameIndex === 23) {
    // Stagger back violently from impact
    return {
      ...base,
      offsetX: -16,
      headTiltX: -14,
      torsoTiltX: -18,
      crouch: 4,
      fElbDX: 6,
      fElbDY: 24,
      fFistDX: 12,
      fFistDY: 14,
      bElbDX: -8,
      bElbDY: 24,
      bFistDX: -10,
      bFistDY: 14,
      battleRoar: true
    };
  }
  if (frameIndex === 24) {
    // Stagger recovery
    return {
      ...base,
      offsetX: -8,
      headTiltX: -6,
      torsoTiltX: -8,
      crouch: 2,
      fElbDX: 8,
      fElbDY: 20,
      fFistDX: 10,
      fFistDY: -8
    };
  }

  // 9. Victory (Frames 25, 26, 27)
  if (frameIndex >= 25) {
    const vStep = frameIndex - 25;
    return {
      ...base,
      torsoTiltX: 0,
      crouch: 0,
      fKneeDX: 8,
      fKneeDY: 36,
      fFootDX: 4,
      fFootDY: 38,
      bKneeDX: -8,
      bKneeDY: 36,
      bFootDX: -4,
      bFootDY: 38,
      // Arms raised high to sky!
      fElbDX: 14,
      fElbDY: -18,
      fFistDX: 6,
      fFistDY: -22 - vStep * 2,
      bElbDX: -14,
      bElbDY: -18,
      bFistDX: -6,
      bFistDY: -22 - vStep * 2,
      victoryFX: vStep === 2,
      battleRoar: true
    };
  }

  return base;
}

// ── Main Generation Routine ────────────────────────────────────
async function generateAllSpriteSheets() {
  const outputDir = path.join(__dirname, '..', 'client', 'assets', 'sprites');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Generating 8 full-body 2D fighting sprite sheets in ${outputDir}...`);

  for (const char of CHARACTERS) {
    console.log(`Rendering full-body sprite sheet for: ${char.displayName} (${char.style})...`);
    const canvas = new CanvasBuffer(SHEET_W, SHEET_H);

    for (let frameIdx = 0; frameIdx < 28; frameIdx++) {
      const col = frameIdx % COLS;
      const row = Math.floor(frameIdx / COLS);
      const ox = col * FRAME_W;
      const oy = row * FRAME_H;

      const pose = getFrameKinematics(frameIdx);
      renderFighter(canvas, ox, oy, char, pose);
    }

    const png = new PNG({ width: SHEET_W, height: SHEET_H });
    canvas.data.copy(png.data);

    const filePath = path.join(outputDir, `${char.name}_sheet.png`);
    await new Promise((resolve, reject) => {
      png.pack().pipe(fs.createWriteStream(filePath))
        .on('finish', () => {
          console.log(`  ✓ Saved ${filePath} (${fs.statSync(filePath).size} bytes)`);
          resolve();
        })
        .on('error', reject);
    });
  }

  console.log('All 8 full-body fighting sprite sheets successfully created!');
}

generateAllSpriteSheets().catch(err => {
  console.error('Sprite generation error:', err);
  process.exit(1);
});

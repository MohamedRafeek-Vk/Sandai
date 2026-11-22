// ============================================================
// SANDAI — renderer3d.js
// Next-Generation True 3D Fighting Game Rendering Engine
// Full Rigged Humanoid 3D Fighters, Motion-Captured Skeletal Animations,
// Tekken-Inspired Dynamic Combat Camera, 5 Realistic PBR Battle Arenas,
// Real-Time Directional Soft Shadows, Cinematic Hit Sparks & Slow-Mo
// ============================================================

(function () {
  'use strict';

  window.SANDAI = window.SANDAI || {};

  if (typeof THREE === 'undefined') {
    console.warn('[SANDAI 3D] Three.js not found in global scope. Falling back to 2D.');
    return;
  }

  // ------------------------------------------------------------
  // Shared GLTF Model Cache & Background Preloader
  // ------------------------------------------------------------
  var GLTFCache = {
    fighterGLTF: null,
    templeGLTF: null,
    isLoading: false,
    callbacks: []
  };

  function getGLTFLoader() {
    var LoaderClass = (typeof THREE !== 'undefined' && THREE.GLTFLoader) ||
                      (typeof window !== 'undefined' && window.GLTFLoader) ||
                      (typeof global !== 'undefined' && global.GLTFLoader);
    if (LoaderClass) return new LoaderClass();
    return null;
  }

  function getSkeletonUtils() {
    return (typeof THREE !== 'undefined' && THREE.SkeletonUtils) ||
           (typeof window !== 'undefined' && window.SkeletonUtils) ||
           (typeof global !== 'undefined' && global.SkeletonUtils);
  }

  function preloadAssets(callback) {
    if (GLTFCache.fighterGLTF) {
      if (callback) callback();
      return;
    }
    if (callback) GLTFCache.callbacks.push(callback);
    if (GLTFCache.isLoading) return;
    GLTFCache.isLoading = true;

    var loader = getGLTFLoader();
    if (!loader) {
      console.warn('[SANDAI 3D] GLTFLoader unavailable for preloading.');
      return;
    }

    loader.load('/assets/models/fighter_base.glb', function (gltf) {
      GLTFCache.fighterGLTF = gltf;
      console.log('[SANDAI 3D] fighter_base.glb preloaded (' + gltf.animations.length + ' animations).');

      // Preload Temple Arena in background
      loader.load('/assets/models/temple_arena.glb', function (temple) {
        GLTFCache.templeGLTF = temple;
        console.log('[SANDAI 3D] temple_arena.glb preloaded.');
      }, undefined, function () {});

      GLTFCache.isLoading = false;
      var cbs = GLTFCache.callbacks.slice();
      GLTFCache.callbacks = [];
      cbs.forEach(function (cb) { try { cb(); } catch (e) {} });
    }, undefined, function (err) {
      console.warn('[SANDAI 3D] fighter_base.glb load error, will use fallback:', err);
      GLTFCache.isLoading = false;
    });
  }

  // Start preloading immediately in background
  if (typeof window !== 'undefined') {
    setTimeout(preloadAssets, 100);
  }

  // ------------------------------------------------------------
  // Renderer3D Engine Class
  // ------------------------------------------------------------
  function Renderer3D(containerId, options) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error('[SANDAI 3D] Container element not found:', containerId);
      return;
    }

    this.options = options || {};
    this.qualitySetting = localStorage.getItem('sandai_graphics_quality') || 'auto';
    this.quality = this.resolveQuality();
    this.cameraShakeEnabled = localStorage.getItem('sandai_camera_shake') !== 'false';
    this.reducedVFX = localStorage.getItem('sandai_reduced_vfx') === 'true';
    this.isPaused = false;
    this.isDestroyed = false;

    this.clock = new THREE.Clock();
    this.animationFrameId = null;

    // Tekken-inspired Dynamic Combat Camera tracking
    this.cameraTargetX = 0;
    this.cameraTargetY = 1.35;
    this.cameraDistance = 6.8;
    this.shakeIntensity = 0;
    this.shakeDecay = 0.88;
    this.isCinematicCloseUp = false;
    this.cinematicTimer = 0;

    // Active Arena State
    this.currentArena = window.SANDAI.selectedArena || 'mountain';
    this.arenaGroup = null;
    this.envParticles = null;
    this.envVelocities = null;
    this.lightningTimer = 0;
    this.lightningFlashLight = null;

    // Fighters references & active animation mixers
    this.fighter1Mesh = null;
    this.fighter2Mesh = null;
    this.mixers = [];

    // Particle & VFX systems
    this.hitSparks = [];
    this.specialProjectiles = [];

    this.init();
  }

  Renderer3D.preloadAssets = preloadAssets;

  Renderer3D.prototype.isMobileDevice = function () {
    return (window.SANDAI && window.SANDAI.deviceType === 'mobile') ||
      /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (window.matchMedia && window.matchMedia('(hover: none) and (pointer: coarse)').matches) ||
      (window.innerWidth <= 900);
  };

  Renderer3D.prototype.resolveQuality = function () {
    var pref = localStorage.getItem('sandai_graphics_quality') || 'auto';
    if (pref !== 'auto') return pref;
    var isMobile = this.isMobileDevice();
    var cores = navigator.hardwareConcurrency || 4;
    if (isMobile) return cores <= 4 ? 'low' : 'medium';
    return 'high';
  };

  Renderer3D.prototype.init = function () {
    var width = this.container.clientWidth || 1280;
    var height = this.container.clientHeight || 720;
    window.SANDAI.activeRenderer3D = this;

    // 1. Scene setup
    this.scene = new THREE.Scene();

    // 2. Camera: Dynamic Tekken 3D perspective camera (looking at fighting plane Z=0)
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 150);
    this.camera.position.set(0, 1.8, 7.2);
    this.camera.lookAt(0, 1.35, 0);

    // 3. WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.quality !== 'low' && !this.isMobileDevice(),
      powerPreference: 'high-performance',
      alpha: false
    });
    this.renderer.setSize(width, height);
    var dpr = this.quality === 'high' ? Math.min(window.devicePixelRatio || 1, 2) :
              (this.quality === 'medium' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1);
    this.renderer.setPixelRatio(dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    if (this.quality !== 'low') {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = this.isMobileDevice() ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    }

    // Append canvas to container without wiping Phaser DOM HUD
    this.renderer.domElement.className = 'sandai-3d-canvas';
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.zIndex = '0';

    if (this.container.firstChild) {
      this.container.insertBefore(this.renderer.domElement, this.container.firstChild);
    } else {
      this.container.appendChild(this.renderer.domElement);
    }

    // 4. Load initial arena
    this.loadArena(this.currentArena);

    // 5. Start RAF loop
    this.startLoop();

    // 6. Handle viewport resize
    var self = this;
    this.onResize = function () {
      if (!self.container || self.isDestroyed) return;
      var w = self.container.clientWidth || 1280;
      var h = self.container.clientHeight || 720;
      self.camera.aspect = w / h;
      self.camera.updateProjectionMatrix();
      self.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this.onResize);

    // 7. WebGL context loss & restoration handling
    this.renderer.domElement.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      self.isPaused = true;
      console.warn('[SANDAI 3D] webglcontextlost event triggered.');
    }, false);

    this.renderer.domElement.addEventListener('webglcontextrestored', function () {
      console.log('[SANDAI 3D] webglcontextrestored event triggered.');
      self.isPaused = false;
    }, false);

    // 8. Inactive background tab throttling
    document.addEventListener('visibilitychange', function () {
      self.isPaused = document.hidden;
    });
  };

  // ------------------------------------------------------------
  // Realistic 3D Battle Stages (Bamboo Sanctuary, Temple, Mountain, Volcanic, Neon City)
  // ------------------------------------------------------------
  Renderer3D.prototype.loadArena = function (arenaType) {
    this.currentArena = arenaType || 'mountain';

    if (this.arenaGroup) {
      this.scene.remove(this.arenaGroup);
      this.arenaGroup = null;
    }
    if (this.envParticles) {
      this.scene.remove(this.envParticles);
      this.envParticles = null;
    }
    if (this.ambientLight) this.scene.remove(this.ambientLight);
    if (this.dirLight) this.scene.remove(this.dirLight);
    if (this.rimLight) this.scene.remove(this.rimLight);
    if (this.lightningFlashLight) this.scene.remove(this.lightningFlashLight);

    this.arenaGroup = new THREE.Group();
    this.scene.add(this.arenaGroup);

    switch (this.currentArena) {
      case 'forest':
        this.setupForestArena();
        break;
      case 'rainy':
      case 'temple':
        this.setupRainyArena();
        break;
      case 'volcanic':
        this.setupVolcanicArena();
        break;
      case 'nightcity':
        this.setupNightCityArena();
        break;
      case 'mountain':
      default:
        this.setupMountainArena();
        break;
    }
  };

  Renderer3D.prototype.setupShadows = function (light) {
    if (this.quality === 'low') return;
    light.castShadow = true;
    var size = (this.quality === 'medium' || this.isMobileDevice()) ? 512 : 1024;
    light.shadow.mapSize.width = size;
    light.shadow.mapSize.height = size;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = 30;
    light.shadow.camera.left = -10;
    light.shadow.camera.right = 10;
    light.shadow.camera.top = 10;
    light.shadow.camera.bottom = -2;
    light.shadow.bias = -0.0006;
  };

  // ── Arena 1: Frozen Mountain Shrine ───────────────────────────
  Renderer3D.prototype.setupMountainArena = function () {
    this.scene.fog = new THREE.FogExp2(0x0c1322, 0.02);

    this.ambientLight = new THREE.AmbientLight(0x203048, 1.1);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xa5d0ff, 2.0);
    this.dirLight.position.set(6, 14, 6);
    this.setupShadows(this.dirLight);
    this.scene.add(this.dirLight);

    this.rimLight = new THREE.DirectionalLight(0xff6a00, 1.3);
    this.rimLight.position.set(-8, 6, -4);
    this.scene.add(this.rimLight);

    // Stone Platform Floor
    var floorGeo = new THREE.BoxGeometry(18, 0.8, 5.5);
    var floorMat = new THREE.MeshStandardMaterial({ color: 0x18202c, roughness: 0.65, metalness: 0.25 });
    var floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, -0.4, 0);
    floor.receiveShadow = true;
    this.arenaGroup.add(floor);

    // Frosted Snow Platform Surface
    var snowGeo = new THREE.BoxGeometry(18.05, 0.05, 5.55);
    var snowMat = new THREE.MeshStandardMaterial({ color: 0xd8e6f4, roughness: 0.85, metalness: 0.05 });
    var snow = new THREE.Mesh(snowGeo, snowMat);
    snow.position.set(0, 0.02, 0);
    snow.receiveShadow = true;
    this.arenaGroup.add(snow);

    // Lacquered Vermilion Torii Gate Archway
    this.createToriiGate(-7.8);
    this.createToriiGate(7.8);

    // Traditional Pagoda Stone Lanterns with flickering flame
    this.createStoneLantern(-6.8, 0, 1.4, 0xff7711);
    this.createStoneLantern(6.8, 0, 1.4, 0xff7711);
    this.createStoneLantern(-6.8, 0, -1.4, 0xff7711);
    this.createStoneLantern(6.8, 0, -1.4, 0xff7711);

    // Natural Multi-layered Mountain Ridges in Distance
    this.createMountainRidges();

    // Snow particle storm
    this.setupParticleSystem('snow', 0xe6f2ff, 0.07, 700);
  };

  Renderer3D.prototype.createToriiGate = function (x) {
    var pillarMat = new THREE.MeshStandardMaterial({ color: 0xa01a24, roughness: 0.45, metalness: 0.2 });
    var beamMat = new THREE.MeshStandardMaterial({ color: 0x16161c, roughness: 0.35, metalness: 0.7 });

    var col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 6.8, 16), pillarMat);
    col.position.set(x, 3.4, -0.8);
    col.castShadow = true;
    this.arenaGroup.add(col);

    var crossbeam = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.6), beamMat);
    crossbeam.position.set(x, 6.4, -0.8);
    crossbeam.castShadow = true;
    this.arenaGroup.add(crossbeam);
  };

  Renderer3D.prototype.createStoneLantern = function (x, y, z, flameColor) {
    var lantern = new THREE.Group();
    lantern.position.set(x, y, z);
    var stoneMat = new THREE.MeshStandardMaterial({ color: 0x2b323d, roughness: 0.85 });

    var base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.34, 0.6, 8), stoneMat);
    base.position.y = 0.3;
    base.castShadow = true;
    lantern.add(base);

    var flame = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.28, 0.22), new THREE.MeshBasicMaterial({ color: flameColor }));
    flame.position.y = 0.74;
    lantern.add(flame);

    var roof = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.36, 8), stoneMat);
    roof.position.y = 1.05;
    roof.castShadow = true;
    lantern.add(roof);

    var light = new THREE.PointLight(flameColor, 1.8, 5.0);
    light.position.set(0, 0.75, 0);
    lantern.add(light);

    this.arenaGroup.add(lantern);
  };

  Renderer3D.prototype.createMountainRidges = function () {
    var ridgeGroup = new THREE.Group();
    ridgeGroup.position.set(0, 0, -18);

    // Deep Alpine Sky Gradient & Distant Misty Backdrop
    var skyPlaneGeo = new THREE.PlaneGeometry(64, 26);
    var skyPlaneMat = new THREE.MeshBasicMaterial({
      color: 0x080e1c,
      side: THREE.DoubleSide
    });
    var skyPlane = new THREE.Mesh(skyPlaneGeo, skyPlaneMat);
    skyPlane.position.set(0, 8, -2);
    ridgeGroup.add(skyPlane);

    // Glowing Distant Cold Dusk Moon
    var moonGeo = new THREE.CircleGeometry(2.4, 32);
    var moonMat = new THREE.MeshBasicMaterial({ color: 0xd6eaff, transparent: true, opacity: 0.85 });
    var moon = new THREE.Mesh(moonGeo, moonMat);
    moon.position.set(8.5, 9.5, -1.8);
    ridgeGroup.add(moon);

    // Multi-layered realistic misty mountain ridges
    var ridgeMat1 = new THREE.MeshStandardMaterial({ color: 0x0f1624, roughness: 0.95 });
    var ridgeMat2 = new THREE.MeshStandardMaterial({ color: 0x141f32, roughness: 0.95 });

    for (var i = -4; i <= 4; i++) {
      var w = 8.0 + Math.random() * 3.0;
      var h = 6.0 + Math.random() * 2.5;
      var ridgeGeo = new THREE.CylinderGeometry(0.2, w * 0.5, h, 8);
      var rMesh = new THREE.Mesh(ridgeGeo, i % 2 === 0 ? ridgeMat1 : ridgeMat2);
      rMesh.position.set(i * 5.2, h * 0.45 - 0.5, -0.5 + (Math.random() - 0.5) * 2);
      ridgeGroup.add(rMesh);
    }
    this.arenaGroup.add(ridgeGroup);
  };

  // ── Arena 2: Bamboo Sanctuary ─────────────────────────────────
  Renderer3D.prototype.setupForestArena = function () {
    this.scene.fog = new THREE.FogExp2(0x081c10, 0.022);

    this.ambientLight = new THREE.AmbientLight(0x10301a, 1.2);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xfff5b8, 2.2);
    this.dirLight.position.set(7, 15, 6);
    this.setupShadows(this.dirLight);
    this.scene.add(this.dirLight);

    this.rimLight = new THREE.DirectionalLight(0x00e676, 1.0);
    this.rimLight.position.set(-8, 7, -4);
    this.scene.add(this.rimLight);

    // Stone pathway with mossy trim
    var floorGeo = new THREE.BoxGeometry(18, 0.8, 5.5);
    var floorMat = new THREE.MeshStandardMaterial({ color: 0x1c1713, roughness: 0.85, metalness: 0.1 });
    var floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, -0.4, 0);
    floor.receiveShadow = true;
    this.arenaGroup.add(floor);

    var mossGeo = new THREE.BoxGeometry(18.05, 0.05, 5.55);
    var mossMat = new THREE.MeshStandardMaterial({ color: 0x2e6933, roughness: 0.95 });
    var moss = new THREE.Mesh(mossGeo, mossMat);
    moss.position.set(0, 0.02, 0);
    moss.receiveShadow = true;
    this.arenaGroup.add(moss);

    // Dense organic bamboo trees with culm nodes and leaf clusters
    var bambooMat = new THREE.MeshStandardMaterial({ color: 0x1b4a29, roughness: 0.65 });
    var leafMat = new THREE.MeshStandardMaterial({ color: 0x3d8b48, roughness: 0.8, side: THREE.DoubleSide });

    for (var bx = -9.5; bx <= 9.5; bx += 0.8) {
      var stalkH = 9.0 + Math.sin(bx * 2) * 1.8;
      var stalkGeo = new THREE.CylinderGeometry(0.12, 0.15, stalkH, 10);
      var stalk = new THREE.Mesh(stalkGeo, bambooMat);
      stalk.position.set(bx + (Math.random() - 0.5) * 0.4, stalkH * 0.5, -4.5 + (Math.random() - 0.5) * 3);
      stalk.castShadow = true;
      this.arenaGroup.add(stalk);

      // Bamboo leaf canopy cluster
      var canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 6, 6), leafMat);
      canopy.position.set(stalk.position.x, stalkH - 0.4, stalk.position.z);
      canopy.scale.set(1.4, 0.6, 1.4);
      this.arenaGroup.add(canopy);
    }

    // Volumetric Sunlight God-Rays
    var rayGeo = new THREE.CylinderGeometry(0.8, 2.2, 12, 8, 1, true);
    var rayMat = new THREE.MeshBasicMaterial({ color: 0xfff3a8, transparent: true, opacity: 0.08, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    for (var r = -6; r <= 6; r += 4) {
      var ray = new THREE.Mesh(rayGeo, rayMat);
      ray.position.set(r, 6, -3);
      ray.rotation.z = -0.22;
      this.arenaGroup.add(ray);
    }

    this.createStoneLantern(-7.0, 0, 1.4, 0xffa022);
    this.createStoneLantern(7.0, 0, 1.4, 0xffa022);

    // Falling Leaves Particles
    this.setupParticleSystem('leaves', 0x5cb85c, 0.12, 500);
  };

  // ── Arena 3: Ancient Storm Temple (Storm Pagoda) ──────────────
  Renderer3D.prototype.setupRainyArena = function () {
    this.scene.fog = new THREE.FogExp2(0x070b14, 0.024);

    this.ambientLight = new THREE.AmbientLight(0x182238, 0.85);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0x5c88c0, 1.6);
    this.dirLight.position.set(5, 12, 5);
    this.setupShadows(this.dirLight);
    this.scene.add(this.dirLight);

    this.rimLight = new THREE.DirectionalLight(0x284888, 1.2);
    this.rimLight.position.set(-7, 6, -4);
    this.scene.add(this.rimLight);

    this.lightningFlashLight = new THREE.DirectionalLight(0xdff0ff, 0.0);
    this.lightningFlashLight.position.set(0, 16, 2);
    this.scene.add(this.lightningFlashLight);

    // If temple_arena.glb is preloaded, instantiate real 3D temple meshes
    var self = this;
    function addTempleModel() {
      if (!GLTFCache.templeGLTF || !self.arenaGroup) return;
      var SkelUtils = THREE.SkeletonUtils || window.SkeletonUtils;
      if (!SkelUtils) return;
      var templeClone = SkelUtils.clone(GLTFCache.templeGLTF.scene);
      templeClone.position.set(0, 0, -3.5);
      templeClone.scale.set(0.65, 0.65, 0.65);
      templeClone.traverse(function (child) {
        if (child.isMesh) {
          child.receiveShadow = true;
          child.castShadow = true;
        }
      });
      self.arenaGroup.add(templeClone);
    }

    if (GLTFCache.templeGLTF) {
      addTempleModel();
    } else {
      preloadAssets(function () {
        if (self.currentArena === 'rainy' || self.currentArena === 'temple') {
          addTempleModel();
        }
      });
    }

    // Glossy Wet Reflective Stone Floor
    var floorGeo = new THREE.BoxGeometry(18, 0.8, 5.5);
    var floorMat = new THREE.MeshStandardMaterial({
      color: 0x0c111a,
      roughness: 0.12, // Wet glossy surface
      metalness: 0.75
    });
    var floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, -0.4, 0);
    floor.receiveShadow = true;
    this.arenaGroup.add(floor);

    // High-speed Torrential Rain Particles
    this.setupParticleSystem('rain', 0xaed8f2, 0.07, 900);
  };

  // ── Arena 4: Molten Core ──────────────────────────────────────
  Renderer3D.prototype.setupVolcanicArena = function () {
    this.scene.fog = new THREE.FogExp2(0x1e0705, 0.024);

    this.ambientLight = new THREE.AmbientLight(0x38120b, 1.0);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xff4400, 2.4);
    this.dirLight.position.set(5, 14, 5);
    this.setupShadows(this.dirLight);
    this.scene.add(this.dirLight);

    this.rimLight = new THREE.DirectionalLight(0xffa200, 1.8);
    this.rimLight.position.set(-7, 6, -4);
    this.scene.add(this.rimLight);

    // Basalt Platform Floor
    var floorGeo = new THREE.BoxGeometry(18, 0.8, 5.5);
    var floorMat = new THREE.MeshStandardMaterial({ color: 0x161212, roughness: 0.85, metalness: 0.3 });
    var floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, -0.4, 0);
    floor.receiveShadow = true;
    this.arenaGroup.add(floor);

    // Glowing Lava Abyss beneath the stage
    var lavaGeo = new THREE.BoxGeometry(24, 0.4, 10);
    var lavaMat = new THREE.MeshBasicMaterial({ color: 0xff3300 });
    var lava = new THREE.Mesh(lavaGeo, lavaMat);
    lava.position.set(0, -1.2, 0);
    this.arenaGroup.add(lava);

    // Basalt volcanic spires & jagged rocks
    var rockMat = new THREE.MeshStandardMaterial({ color: 0x1f1616, roughness: 0.9 });
    for (var rx = -10; rx <= 10; rx += 2.5) {
      var spireH = 5 + Math.random() * 4;
      var spire = new THREE.Mesh(new THREE.ConeGeometry(1.4, spireH, 5), rockMat);
      spire.position.set(rx, spireH * 0.4, -6.0 + (Math.random() - 0.5) * 2.5);
      this.arenaGroup.add(spire);
    }

    // Floating Incandescent Fire Embers
    this.setupParticleSystem('embers', 0xff7700, 0.11, 600);
  };

  // ── Arena 5: Neon City Rooftop ────────────────────────────────
  Renderer3D.prototype.setupNightCityArena = function () {
    this.scene.fog = new THREE.FogExp2(0x060814, 0.022);

    this.ambientLight = new THREE.AmbientLight(0x0e1830, 0.9);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0x00e5ff, 2.0); // Cyan key
    this.dirLight.position.set(6, 14, 5);
    this.setupShadows(this.dirLight);
    this.scene.add(this.dirLight);

    this.rimLight = new THREE.DirectionalLight(0xff007f, 1.6); // Magenta rim
    this.rimLight.position.set(-7, 6, -4);
    this.scene.add(this.rimLight);

    // Helipad / Rooftop Asphalt Floor with Wet Reflections
    var floorGeo = new THREE.BoxGeometry(18, 0.8, 5.5);
    var floorMat = new THREE.MeshStandardMaterial({ color: 0x0c0f18, roughness: 0.28, metalness: 0.65 });
    var floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, -0.4, 0);
    floor.receiveShadow = true;
    this.arenaGroup.add(floor);

    // Glowing Neon Edge Chevrons (Cyan & Magenta)
    var cyanLineMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    var magentaLineMat = new THREE.MeshBasicMaterial({ color: 0xff007f });

    var edgeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 5.5), cyanLineMat);
    edgeLeft.position.set(-8.9, 0.02, 0);
    this.arenaGroup.add(edgeLeft);

    var edgeRight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 5.5), magentaLineMat);
    edgeRight.position.set(8.9, 0.02, 0);
    this.arenaGroup.add(edgeRight);

    // 3D Cyberpunk Skyscraper Skyline in Distance
    this.createCyberSkyscrapers();

    // Rising Steam / Mist
    this.setupParticleSystem('steam', 0x00e5ff, 0.08, 450);
  };

  Renderer3D.prototype.createCyberSkyscrapers = function () {
    var skyGroup = new THREE.Group();
    skyGroup.position.set(0, 0, -18);
    var buildingMat = new THREE.MeshStandardMaterial({ color: 0x060914, roughness: 0.5, metalness: 0.8 });
    var windowGlowMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff });

    for (var b = -4; b <= 4; b++) {
      var h = 12 + Math.abs(b) * 2 + Math.random() * 5;
      var w = 3.5 + Math.random() * 1.5;
      var tower = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), buildingMat);
      tower.position.set(b * 5.2, h * 0.45, -Math.abs(b) * 2);
      skyGroup.add(tower);

      // Glowing Neon Roof Antenna
      var antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6), windowGlowMat);
      antenna.position.set(tower.position.x, h * 0.95 + 1.25, tower.position.z);
      skyGroup.add(antenna);
    }
    this.arenaGroup.add(skyGroup);
  };

  // ------------------------------------------------------------
  // Particle Systems (Snow, Leaves, Rain, Embers, Steam)
  // ------------------------------------------------------------
  Renderer3D.prototype.setupParticleSystem = function (type, colorHex, size, count) {
    if (this.quality === 'low') count = Math.floor(count * 0.35);
    else if (this.quality === 'medium') count = Math.floor(count * 0.65);

    var geo = new THREE.BufferGeometry();
    var positions = new Float32Array(count * 3);
    var velocities = new Float32Array(count * 3);

    for (var i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 24;
      positions[i * 3 + 1] = Math.random() * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 12;

      if (type === 'snow') {
        velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.8;
        velocities[i * 3 + 1] = -(1.2 + Math.random() * 1.4);
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
      } else if (type === 'rain') {
        velocities[i * 3 + 0] = -1.2;
        velocities[i * 3 + 1] = -(16.0 + Math.random() * 6.0);
        velocities[i * 3 + 2] = 0;
      } else if (type === 'leaves') {
        velocities[i * 3 + 0] = 1.2 + Math.random() * 1.5;
        velocities[i * 3 + 1] = -(1.0 + Math.random() * 1.2);
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
      } else if (type === 'embers') {
        velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.9;
        velocities[i * 3 + 1] = 1.8 + Math.random() * 2.2;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.9;
      } else { // steam
        velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.6;
        velocities[i * 3 + 1] = 1.2 + Math.random() * 1.6;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var mat = new THREE.PointsMaterial({
      color: colorHex,
      size: size,
      transparent: true,
      opacity: type === 'rain' ? 0.75 : 0.85,
      blending: THREE.AdditiveBlending
    });

    this.envParticles = new THREE.Points(geo, mat);
    this.envVelocities = velocities;
    this.scene.add(this.envParticles);
  };

  // ------------------------------------------------------------
  // Realistic Full-Body 3D Human Fighter Generator
  // Uses Motion-Captured Rigged GLTF Model with AnimationMixer
  // Custom PBR Materials, Costumes, Hair, Accessories for all 8 Fighters
  // ------------------------------------------------------------
  Renderer3D.prototype.createFighterModel = function (charData, playerIndex) {
    var group = new THREE.Group();
    group.name = 'fighter_' + playerIndex + '_' + charData.name;

    var id = charData.id !== undefined ? charData.id : 0;
    var primaryColor = new THREE.Color(charData.color || (playerIndex === 0 ? 0xd50000 : 0x00e5ff));
    var secondaryColor = new THREE.Color(charData.secondaryColor || 0x1a237e);

    // Character-calibrated skin tones matching authentic portraits
    var skinColors = [
      0xd59b78, // 0: Abilash - Sun-kissed brawler
      0xc88e72, // 1: Anas - Warm olive warrior
      0xcfa085, // 2: Dhinesh - Dusky shadow assassin
      0xd89f80, // 3: Farook - Athletic tanned striker
      0xdfa88d, // 4: Kiran - Fair duelist
      0xc48c6e, // 5: Nawin - Dusky acrobat
      0xba8264, // 6: Rafeek - Deep bronze colossus
      0xdfa58a  // 7: Tharun - Radiant golden sage
    ];
    var skinColor = new THREE.Color(skinColors[id] || 0xd59b78);
    var hairColor = new THREE.Color(charData.hairColor || 0x15161c);

    var skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.55, metalness: 0.05 });
    var giMat = new THREE.MeshStandardMaterial({ color: primaryColor, roughness: 0.65, metalness: 0.15 });
    var trimMat = new THREE.MeshStandardMaterial({ color: secondaryColor, roughness: 0.5, metalness: 0.3 });
    var hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.85, metalness: 0.1 });
    var goldMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.3, metalness: 0.85 });
    var armorMat = new THREE.MeshStandardMaterial({ color: 0x222630, roughness: 0.35, metalness: 0.8 });

    var mixer = null;
    var actions = {};
    var bones = {};

    var SkelUtils = getSkeletonUtils();
    var self = this;

    function buildMartialArtsKickClips() {
      var qPelvisRest = new THREE.Quaternion(0.75593, -0.0883, -0.07526, 0.64429);
      var qSpine1Rest = new THREE.Quaternion(-0.0647, 0, 0, 0.9979);
      var qSpine2Rest = new THREE.Quaternion(0.0154, 0.0001, 0.0002, 0.9999);
      var qThighRRest = new THREE.Quaternion(0.99326, -0.11445, 0.01411, 0.01156);
      var qCalfRRest  = new THREE.Quaternion(0.11464, 0.35841, -0.04441, 0.92543);
      var qFootRRest  = new THREE.Quaternion(-0.57771, -0.04967, -0.16396, 0.79806);
      var qThighLRest = new THREE.Quaternion(0.9639, 0.1104, -0.0136, 0.2419);
      var qCalfLRest  = new THREE.Quaternion(0.1849, -0.1121, 0.0212, 0.9761);
      var qFootLRest  = new THREE.Quaternion(-0.52907, -0.00033, 0.00034, 0.84858);
      var qArmLRest   = new THREE.Quaternion(-0.2865, 0.6735, -0.4958, 0.4674);
      var qArmRRest   = new THREE.Quaternion(-0.2942, -0.6807, 0.4693, 0.4795);
      var qNeckRest   = new THREE.Quaternion(0.015, 0, 0, 0.999);

      function rotQuat(qBase, xDeg, yDeg, zDeg) {
        var q = qBase.clone();
        var e = new THREE.Euler((xDeg || 0) * Math.PI / 180, (yDeg || 0) * Math.PI / 180, (zDeg || 0) * Math.PI / 180, 'XYZ');
        var qDiff = new THREE.Quaternion().setFromEuler(e);
        q.multiply(qDiff);
        q.normalize();
        return q;
      }

      function flattenQuats(arr) {
        var res = [];
        for (var i = 0; i < arr.length; i++) {
          res.push(arr[i].x, arr[i].y, arr[i].z, arr[i].w);
        }
        return res;
      }

      // 1. Ground Martial Arts Front Snap/Thrust Kick (6 Biomechanical Phases, 0.58s = 35 frames)
      // Phase 1 (0.00 - 0.08s): Preparation (stance, weight shift to left leg, foot_l pivot 15 deg, defensive guard)
      // Phase 2 (0.08 - 0.18s): Chamber (high knee lift to chest, tight calf tuck against hamstring, hip rotation, foot_l pivot 35 deg)
      // Phase 3 (0.18 - 0.26s): Kick Extension (explosive uncoiling, forward pelvic thrust, full knee extension, foot flexed)
      // Phase 4 (0.26 - 0.32s): Impact & Apex Hold (60ms strike hold window, active hitbox synchronization)
      // Phase 5 (0.32 - 0.42s): Retraction (fast snap recoil to chamber pose, pelvis de-rotates, foot_l begins un-pivoting)
      // Phase 6 (0.42 - 0.58s): Recovery (controlled foot descent and plant, foot_l un-pivots to neutral, seamless blend to idle)
      var times = [0.0, 0.08, 0.18, 0.26, 0.32, 0.42, 0.58];

      var thighR = [
        qThighRRest,
        rotQuat(qThighRRest, -35, 6, 8),
        rotQuat(qThighRRest, -68, 10, 14),
        rotQuat(qThighRRest, -88, 12, 14),
        rotQuat(qThighRRest, -88, 12, 14),
        rotQuat(qThighRRest, -60, 8, 10),
        qThighRRest
      ];

      var calfR = [
        qCalfRRest,
        rotQuat(qCalfRRest, 65, 0, 0),
        rotQuat(qCalfRRest, 105, 0, 0),
        rotQuat(qCalfRRest, -12, 0, 0),
        rotQuat(qCalfRRest, -12, 0, 0),
        rotQuat(qCalfRRest, 75, 0, 0),
        qCalfRRest
      ];

      var footR = [
        qFootRRest,
        rotQuat(qFootRRest, -15, 0, 0),
        rotQuat(qFootRRest, -25, 0, 0),
        rotQuat(qFootRRest, -38, 0, 0),
        rotQuat(qFootRRest, -38, 0, 0),
        rotQuat(qFootRRest, -20, 0, 0),
        qFootRRest
      ];

      var thighL = [
        qThighLRest,
        rotQuat(qThighLRest, 8, -4, 0),
        rotQuat(qThighLRest, 14, -8, 0),
        rotQuat(qThighLRest, 12, -6, 0),
        rotQuat(qThighLRest, 12, -6, 0),
        rotQuat(qThighLRest, 8, -4, 0),
        qThighLRest
      ];

      var calfL = [
        qCalfLRest,
        rotQuat(qCalfLRest, 12, 0, 0),
        rotQuat(qCalfLRest, 20, 0, 0),
        rotQuat(qCalfLRest, 16, 0, 0),
        rotQuat(qCalfLRest, 16, 0, 0),
        rotQuat(qCalfLRest, 10, 0, 0),
        qCalfLRest
      ];

      // Supporting Left Foot Pivots for Biomechanically Realistic Hip Clearance
      var footL = [
        qFootLRest,
        rotQuat(qFootLRest, 0, 15, 0),
        rotQuat(qFootLRest, 0, 35, 0),
        rotQuat(qFootLRest, 0, 35, 0),
        rotQuat(qFootLRest, 0, 35, 0),
        rotQuat(qFootLRest, 0, 18, 0),
        qFootLRest
      ];

      var spine1 = [
        qSpine1Rest,
        rotQuat(qSpine1Rest, -6, 0, -4),
        rotQuat(qSpine1Rest, -16, 0, -10),
        rotQuat(qSpine1Rest, -18, 0, -10),
        rotQuat(qSpine1Rest, -18, 0, -10),
        rotQuat(qSpine1Rest, -8, 0, -5),
        qSpine1Rest
      ];

      var spine2 = [
        qSpine2Rest,
        rotQuat(qSpine2Rest, -4, 0, -3),
        rotQuat(qSpine2Rest, -12, 0, -8),
        rotQuat(qSpine2Rest, -14, 0, -8),
        rotQuat(qSpine2Rest, -14, 0, -8),
        rotQuat(qSpine2Rest, -6, 0, -4),
        qSpine2Rest
      ];

      var neck1 = [
        qNeckRest,
        rotQuat(qNeckRest, 4, 0, 0),
        rotQuat(qNeckRest, 8, 0, 0),
        rotQuat(qNeckRest, 10, 0, 0),
        rotQuat(qNeckRest, 10, 0, 0),
        rotQuat(qNeckRest, 5, 0, 0),
        qNeckRest
      ];

      var pelvis = [
        qPelvisRest,
        rotQuat(qPelvisRest, 2, 8, -2),
        rotQuat(qPelvisRest, 8, 22, -4),
        rotQuat(qPelvisRest, 10, 24, -4),
        rotQuat(qPelvisRest, 10, 24, -4),
        rotQuat(qPelvisRest, 5, 12, -2),
        qPelvisRest
      ];

      var p0 = [0.005, 0.086, 0.877];
      var pelvisPos = [
        p0[0], p0[1], p0[2],
        p0[0] - 0.02, p0[1] - 0.02, p0[2] - 0.01,
        p0[0] + 0.02, p0[1] - 0.02, p0[2] + 0.05,
        p0[0] + 0.05, p0[1] - 0.02, p0[2] + 0.10,
        p0[0] + 0.05, p0[1] - 0.02, p0[2] + 0.10,
        p0[0] + 0.02, p0[1] - 0.01, p0[2] + 0.04,
        p0[0], p0[1], p0[2]
      ];

      var armL = [
        qArmLRest,
        rotQuat(qArmLRest, 8, 0, 12),
        rotQuat(qArmLRest, 12, 0, 16),
        rotQuat(qArmLRest, 14, 0, 18),
        rotQuat(qArmLRest, 14, 0, 18),
        rotQuat(qArmLRest, 8, 0, 12),
        qArmLRest
      ];

      var armR = [
        qArmRRest,
        rotQuat(qArmRRest, -10, 0, -12),
        rotQuat(qArmRRest, -16, 0, -16),
        rotQuat(qArmRRest, -22, 0, -24),
        rotQuat(qArmRRest, -22, 0, -24),
        rotQuat(qArmRRest, -12, 0, -14),
        qArmRRest
      ];

      var groundTracks = [
        new THREE.QuaternionKeyframeTrack('thigh_r.quaternion', times, flattenQuats(thighR)),
        new THREE.QuaternionKeyframeTrack('calf_r.quaternion', times, flattenQuats(calfR)),
        new THREE.QuaternionKeyframeTrack('foot_r.quaternion', times, flattenQuats(footR)),
        new THREE.QuaternionKeyframeTrack('thigh_l.quaternion', times, flattenQuats(thighL)),
        new THREE.QuaternionKeyframeTrack('calf_l.quaternion', times, flattenQuats(calfL)),
        new THREE.QuaternionKeyframeTrack('foot_l.quaternion', times, flattenQuats(footL)),
        new THREE.QuaternionKeyframeTrack('spine_01.quaternion', times, flattenQuats(spine1)),
        new THREE.QuaternionKeyframeTrack('spine_02.quaternion', times, flattenQuats(spine2)),
        new THREE.QuaternionKeyframeTrack('neck_01.quaternion', times, flattenQuats(neck1)),
        new THREE.QuaternionKeyframeTrack('pelvis.quaternion', times, flattenQuats(pelvis)),
        new THREE.VectorKeyframeTrack('pelvis.position', times, pelvisPos),
        new THREE.QuaternionKeyframeTrack('upperarm_l.quaternion', times, flattenQuats(armL)),
        new THREE.QuaternionKeyframeTrack('upperarm_r.quaternion', times, flattenQuats(armR))
      ];

      var groundClip = new THREE.AnimationClip('Kick_Martial_Arts', 0.58, groundTracks);

      // 2. Aerial Flying Jump Kick
      var jumpTimes = [0.0, 0.08, 0.16, 0.28, 0.42, 0.55];
      var jumpThighR = [
        qThighRRest,
        rotQuat(qThighRRest, -45, 6, 8),
        rotQuat(qThighRRest, -75, 12, 10),
        rotQuat(qThighRRest, -75, 12, 10),
        rotQuat(qThighRRest, -40, 6, 6),
        qThighRRest
      ];
      var jumpCalfR = [
        qCalfRRest,
        rotQuat(qCalfRRest, 70, 0, 0),
        rotQuat(qCalfRRest, -20, 0, 0),
        rotQuat(qCalfRRest, -20, 0, 0),
        rotQuat(qCalfRRest, 50, 0, 0),
        qCalfRRest
      ];
      var jumpFootR = [
        qFootRRest,
        rotQuat(qFootRRest, -15, 0, 0),
        rotQuat(qFootRRest, -30, 0, 0),
        rotQuat(qFootRRest, -30, 0, 0),
        rotQuat(qFootRRest, -15, 0, 0),
        qFootRRest
      ];
      var jumpThighL = [
        qThighLRest,
        rotQuat(qThighLRest, -35, -10, 0),
        rotQuat(qThighLRest, -60, -15, 0),
        rotQuat(qThighLRest, -60, -15, 0),
        rotQuat(qThighLRest, -30, -8, 0),
        qThighLRest
      ];
      var jumpCalfL = [
        qCalfLRest,
        rotQuat(qCalfLRest, 65, 0, 0),
        rotQuat(qCalfLRest, 90, 0, 0),
        rotQuat(qCalfLRest, 90, 0, 0),
        rotQuat(qCalfLRest, 45, 0, 0),
        qCalfLRest
      ];

      var jumpTracks = [
        new THREE.QuaternionKeyframeTrack('thigh_r.quaternion', jumpTimes, flattenQuats(jumpThighR)),
        new THREE.QuaternionKeyframeTrack('calf_r.quaternion', jumpTimes, flattenQuats(jumpCalfR)),
        new THREE.QuaternionKeyframeTrack('foot_r.quaternion', jumpTimes, flattenQuats(jumpFootR)),
        new THREE.QuaternionKeyframeTrack('thigh_l.quaternion', jumpTimes, flattenQuats(jumpThighL)),
        new THREE.QuaternionKeyframeTrack('calf_l.quaternion', jumpTimes, flattenQuats(jumpCalfL))
      ];

      var jumpClip = new THREE.AnimationClip('Kick_Jump_Martial', 0.55, jumpTracks);

      return { groundClip: groundClip, jumpClip: jumpClip };
    }

    function setupRiggedModel(clonedScene, animations) {
      clonedScene.traverse(function (child) {
        if (child.isSkinnedMesh || child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          // Apply custom PBR martial arts material with skeletal skinning enabled
          var mat = giMat.clone();
          mat.skinning = true;
          child.material = mat;
        }
        if (child.isBone) {
          bones[child.name] = child;
        }
      });

      // Find Head bone and attach hair, accessories, and facial details
      var headBone = bones['Head'] || bones['head_01'] || bones['neck_01'];
      if (headBone) {
        self.attachCharacterAccessories(headBone, id, hairMat, goldMat, armorMat, skinMat);
      }

      // Find Hand bones and attach combat gauntlets/flames
      var handL = bones['hand_l'];
      var handR = bones['hand_r'];
      if (handL && handR) {
        self.attachHandVFX(handL, handR, id);
      }

      // Attach floating energy barrier on chest
      var chestBone = bones['spine_03'] || bones['spine_02'];
      var shieldMesh = null;
      if (chestBone) {
        var shieldGeo = new THREE.SphereGeometry(1.1, 16, 16);
        var shieldMat = new THREE.MeshBasicMaterial({
          color: primaryColor,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.0,
          blending: THREE.AdditiveBlending
        });
        shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
        shieldMesh.position.set(0, 0, 0);
        chestBone.add(shieldMesh);
      }

      // Setup AnimationMixer
      mixer = new THREE.AnimationMixer(clonedScene);
      self.mixers.push(mixer);

      animations.forEach(function (clip) {
        var act = mixer.clipAction(clip);
        actions[clip.name] = act;
      });

      // Convenience aliases
      actions['idle'] = actions['Idle_Loop'];
      actions['walk'] = actions['Walk_Loop'];
      actions['walk_fwd'] = actions['Walk_Loop'];
      actions['walk_back'] = actions['Walk_Loop'];
      actions['dash'] = actions['Jog_Fwd_Loop'];
      actions['jump'] = actions['Jump_Loop'];
      actions['punch'] = actions['Punch_Jab'];
      actions['heavy_punch'] = actions['Punch_Cross'];

      // Dedicated Martial Arts Kick Animations (Front Snap/Thrust Kick & Flying Jump Kick)
      var kickClips = buildMartialArtsKickClips();
      actions['Kick_Martial_Arts'] = mixer.clipAction(kickClips.groundClip);
      actions['Kick_Jump_Martial'] = mixer.clipAction(kickClips.jumpClip);
      actions['kick'] = actions['Kick_Martial_Arts'];
      actions['kick_jump'] = actions['Kick_Jump_Martial'];

      actions['special'] = actions['Spell_Simple_Shoot'];
      actions['block'] = actions['Crouch_Idle_Loop'];
      actions['crouch'] = actions['Crouch_Idle_Loop'];
      actions['dodge'] = actions['Roll'];
      actions['hit'] = actions['Hit_Chest'];
      actions['hit_head'] = actions['Hit_Head'];
      actions['ko'] = actions['Death01'];
      actions['victory'] = actions['Dance_Loop'];

      // Configure One-Shot attacks
      var oneShots = ['punch', 'heavy_punch', 'kick', 'kick_jump', 'special', 'dodge', 'hit', 'hit_head', 'ko'];
      oneShots.forEach(function (key) {
        if (actions[key]) {
          actions[key].setLoop(THREE.LoopOnce);
          actions[key].clampWhenFinished = true;
        }
      });

      if (actions['idle']) {
        actions['idle'].reset().setEffectiveWeight(1.0).play();
      }

      group.add(clonedScene);

      group.userData.mixer = mixer;
      group.userData.actions = actions;
      group.userData.shieldMesh = shieldMesh;
      group.userData.currentAnim = 'idle';
    }

    if (GLTFCache.fighterGLTF && SkelUtils) {
      var cloned = SkelUtils.clone(GLTFCache.fighterGLTF.scene);
      setupRiggedModel(cloned, GLTFCache.fighterGLTF.animations);
    } else {
      // Async preload hook if GLTF is currently loading
      preloadAssets(function () {
        if (GLTFCache.fighterGLTF && SkelUtils && !group.userData.mixer) {
          var cl = SkelUtils.clone(GLTFCache.fighterGLTF.scene);
          setupRiggedModel(cl, GLTFCache.fighterGLTF.animations);
        }
      });
    }

    group.userData = group.userData || {};
    group.userData.charData = charData;
    group.userData.charId = id;
    group.userData.playerIndex = playerIndex;
    group.userData.facing = playerIndex === 0 ? 1 : -1;
    group.userData.targetFacing = playerIndex === 0 ? 1 : -1;

    this.scene.add(group);
    return group;
  };

  // ------------------------------------------------------------
  // Character-Specific Hairstyles, Armor, Halos & Accessories
  // Attached directly to Skeleton Bones for Natural Physical Articulation
  // ------------------------------------------------------------
  Renderer3D.prototype.attachCharacterAccessories = function (headBone, charId, hairMat, goldMat, armorMat, skinMat) {
    if (!headBone) return;

    if (charId === 0) {
      // Abilash: Spiked Layered Dark Hair + Crimson Martial Arts Headband with dynamic tails
      var hairCluster = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.32, 6), hairMat);
      hairCluster.position.set(0, 0.16, -0.02);
      hairCluster.rotation.x = -0.2;
      headBone.add(hairCluster);

      var headband = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 16), new THREE.MeshBasicMaterial({ color: 0xd50000 }));
      headband.position.set(0, 0.08, 0.02);
      headband.rotation.x = Math.PI / 2;
      headBone.add(headband);

      var tail1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.01), new THREE.MeshBasicMaterial({ color: 0xd50000 }));
      tail1.position.set(-0.06, 0.02, -0.14);
      tail1.rotation.x = 0.45;
      headBone.add(tail1);

    } else if (charId === 1) {
      // Anas: Formidable Trimmed Dark Beard, Mustache & Side-parted Hair
      var hair = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.26), hairMat);
      hair.position.set(0, 0.14, 0);
      headBone.add(hair);

      var beard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.14), hairMat);
      beard.position.set(0, -0.06, 0.10);
      headBone.add(beard);

    } else if (charId === 2) {
      // Dhinesh: Shadow Assassin Wild Hair + Glowing Cyan Eye Light
      var wildHair = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.35, 6), hairMat);
      wildHair.position.set(0, 0.18, -0.04);
      wildHair.rotation.x = -0.3;
      headBone.add(wildHair);

      var eyeOrb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00e5ff }));
      eyeOrb.position.set(-0.05, 0.05, 0.12);
      headBone.add(eyeOrb);

      var eyeLight = new THREE.PointLight(0x00e5ff, 1.4, 2.5);
      eyeLight.position.set(-0.05, 0.05, 0.14);
      headBone.add(eyeLight);

    } else if (charId === 3) {
      // Farook: Slick Textured Dark Hair + Lightning Brow Crown
      var slickHair = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.14, 0.28), hairMat);
      slickHair.position.set(0, 0.14, -0.02);
      headBone.add(slickHair);

    } else if (charId === 4) {
      // Kiran: Master Wind Duelist Long Hair with Low Samurai Ponytail
      var topHair = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.26), hairMat);
      topHair.position.set(0, 0.14, 0);
      headBone.add(topHair);

      var ponytail = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.02, 0.38, 6), hairMat);
      ponytail.position.set(0, 0.02, -0.18);
      ponytail.rotation.x = -0.55;
      headBone.add(ponytail);

    } else if (charId === 5) {
      // Nawin: Curly Dark Hair with Full Textured Beard
      var curlyHair = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), hairMat);
      curlyHair.position.set(0, 0.14, -0.02);
      curlyHair.scale.set(1.2, 0.8, 1.2);
      headBone.add(curlyHair);

      var fullBeard = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.16, 0.14), hairMat);
      fullBeard.position.set(0, -0.07, 0.10);
      headBone.add(fullBeard);

    } else if (charId === 6) {
      // Rafeek: Titan Colossus Buzzcut, Bronze Torque Collar & Metallic Spectacles
      var buzzcut = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.10, 0.26), hairMat);
      buzzcut.position.set(0, 0.13, 0);
      headBone.add(buzzcut);

      var glasses = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.02), goldMat);
      glasses.position.set(0, 0.04, 0.13);
      headBone.add(glasses);

      var collar = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 8, 16), goldMat);
      collar.position.set(0, -0.12, 0);
      collar.rotation.x = Math.PI / 2;
      headBone.add(collar);

    } else if (charId === 7) {
      // Tharun: Radiant Golden Solar Aureole (Halo) with 8 Radiant Sun Rays
      var sageHair = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.26), hairMat);
      sageHair.position.set(0, 0.14, 0);
      headBone.add(sageHair);

      var haloGroup = new THREE.Group();
      haloGroup.position.set(0, 0.18, -0.22);

      var haloRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.36, 0.03, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xffd700 })
      );
      haloGroup.add(haloRing);

      for (var r = 0; r < 8; r++) {
        var ray = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.14, 4), new THREE.MeshBasicMaterial({ color: 0xffd700 }));
        var angle = (r / 8) * Math.PI * 2;
        ray.position.set(Math.cos(angle) * 0.44, Math.sin(angle) * 0.44, 0);
        ray.rotation.z = angle - Math.PI / 2;
        haloGroup.add(ray);
      }
      headBone.add(haloGroup);
    }
  };

  Renderer3D.prototype.attachHandVFX = function (handL, handR, charId) {
    if (charId === 0) {
      // Abilash: Flaming Dragon Fist Auras
      var flameMat = new THREE.MeshBasicMaterial({ color: 0xff4500, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
      var f1 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), flameMat);
      handL.add(f1);
      var f2 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), flameMat);
      handR.add(f2);
    } else if (charId === 3) {
      // Farook: High-Voltage Lightning Gauntlet Auras
      var sparkMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
      var s1 = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), sparkMat);
      handL.add(s1);
      var s2 = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), sparkMat);
      handR.add(s2);
    }
  };

  // ------------------------------------------------------------
  // Animation Controller: Maps Phaser 2.5D States to 3D Skeletal AnimationMixer
  // Organic Idle Breathing, Weight Shift, Realistic Attacks, Clean Knockout
  // ------------------------------------------------------------
  Renderer3D.prototype.updateFighterAnimation = function (fighterMesh, fighterState, delta) {
    if (!fighterMesh || !fighterMesh.userData) return;
    var data = fighterMesh.userData;

    // 1. Sync World Position (Translate Phaser 2D coords to 3D stage)
    var posX = (fighterState.x - 640) * 0.0125;
    var posY = Math.max(0, (520 - fighterState.y) * 0.012);
    fighterMesh.position.set(posX, posY, 0);

    // 2. Smooth Facing Turn (Locked during attack to prevent mid-strike snapping)
    if (fighterState.facing !== undefined) {
      if (!fighterState.isAttacking || !data.targetFacing) {
        data.targetFacing = fighterState.facing;
      }
    }
    var targetRotY = data.targetFacing > 0 ? Math.PI / 2 : -Math.PI / 2;
    fighterMesh.rotation.y = THREE.MathUtils.lerp(fighterMesh.rotation.y, targetRotY, 0.28);

    // 3. Update AnimationMixer if rigged GLTF is active
    if (data.mixer && data.actions) {
      var actions = data.actions;
      var targetAnim = 'idle';

      if (fighterState.health <= 0 || fighterState.state === 'ko' || fighterState.state === 'defeat' || fighterState.isDead) {
        targetAnim = 'ko';
      } else if (fighterState.state === 'victory' || fighterState.isVictory) {
        targetAnim = 'victory';
      } else if (fighterState.state === 'hit' || fighterState.hitStunTimer > 0) {
        targetAnim = 'hit';
      } else if (fighterState.isBlocking || fighterState.state === 'block') {
        targetAnim = 'block';
      } else if (fighterState.isCrouching || fighterState.state === 'crouch') {
        targetAnim = 'crouch';
      } else if (fighterState.state === 'punch') {
        targetAnim = 'punch';
      } else if (fighterState.state === 'heavy_punch') {
        targetAnim = 'heavy_punch';
      } else if (fighterState.state === 'kick') {
        targetAnim = (fighterState.isJumping || fighterState.y < 380) ? 'kick_jump' : 'kick';
      } else if (fighterState.state === 'special') {
        targetAnim = 'special';
      } else if (fighterState.state === 'dodge' || fighterState.state === 'roll') {
        targetAnim = 'dodge';
      } else if (fighterState.isJumping || fighterState.state === 'jump') {
        targetAnim = 'jump';
      } else if (fighterState.state === 'walk_fwd' || fighterState.state === 'walk') {
        targetAnim = 'walk';
      } else if (fighterState.state === 'walk_back') {
        targetAnim = 'walk_back';
      } else if (fighterState.state === 'dash') {
        targetAnim = 'dash';
      }

      // Smooth crossfade between animation states
      if (data.currentAnim !== targetAnim) {
        var prevAction = actions[data.currentAnim];
        var nextAction = actions[targetAnim] || actions['idle'];
        if (nextAction) {
          var isAttack = (targetAnim === 'kick' || targetAnim === 'kick_jump' || targetAnim === 'punch' || targetAnim === 'heavy_punch' || targetAnim === 'special');
          var fadeTime = isAttack ? 0.06 : 0.12;
          if (prevAction && prevAction !== nextAction) {
            prevAction.fadeOut(fadeTime);
          }
          nextAction.reset().fadeIn(fadeTime).play();
          data.currentAnim = targetAnim;
        }
      }

      // Guard barrier opacity fade
      if (data.shieldMesh) {
        var targetShieldOp = (targetAnim === 'block') ? 0.65 : 0.0;
        data.shieldMesh.material.opacity = THREE.MathUtils.lerp(data.shieldMesh.material.opacity, targetShieldOp, 0.2);
      }
    }
  };

  // ------------------------------------------------------------
  // Tekken-Inspired Dynamic Combat Camera
  // Midpoint Tracking, Distance Zoom, Spring-Damper Smoothing, Shake
  // ------------------------------------------------------------
  Renderer3D.prototype.updateCamera = function (delta) {
    var p1Pos = this.fighter1Mesh ? this.fighter1Mesh.position : new THREE.Vector3(-2.5, 0, 0);
    var p2Pos = this.fighter2Mesh ? this.fighter2Mesh.position : new THREE.Vector3(2.5, 0, 0);

    var midX = (p1Pos.x + p2Pos.x) / 2;
    var isMobile = this.isMobileDevice();
    var aspect = (this.container && this.container.clientHeight > 0) ?
      (this.container.clientWidth / this.container.clientHeight) : 1.77;

    // Mobile camera elevation: centered on fighter mid-torso for natural framing
    var elev = isMobile ? 1.05 : 1.35;
    var midY = (p1Pos.y + p2Pos.y) / 2 + elev;
    var dist = Math.abs(p1Pos.x - p2Pos.x);

    // Dynamic zoom based on combat range & screen aspect ratio
    // Authentic fighting game ratio: fighters occupy ~26-30% of screen height
    var minD = isMobile ? 8.2 : 5.4;
    var maxD = isMobile ? 12.8 : 8.6;
    var targetDist = isMobile ?
      Math.max(minD, Math.min(maxD, dist * 1.05 + 4.8)) :
      Math.max(minD, Math.min(maxD, dist * 1.35 + 2.9));

    // Dynamic aspect ratio compensation: widen distance if aspect ratio is narrower (< 1.75)
    if (aspect < 1.75) {
      targetDist *= Math.sqrt(1.75 / Math.max(0.65, aspect));
    }

    if (this.isCinematicCloseUp) {
      targetDist = isMobile ? 6.2 : 4.2;
      midY = isMobile ? 1.0 : 1.15;
      this.cinematicTimer -= delta;
      if (this.cinematicTimer <= 0) this.isCinematicCloseUp = false;
    }

    // Spring-damper smooth tracking
    var camYOffset = isMobile ? 0.28 : 0.35;
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, midX, 6.0, delta);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, midY + camYOffset, 6.0, delta);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetDist, 5.0, delta);

    // Multi-axis Camera Shake
    if (this.cameraShakeEnabled && this.shakeIntensity > 0.002) {
      var sx = (Math.random() - 0.5) * this.shakeIntensity;
      var sy = (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.x += sx;
      this.camera.position.y += sy;
      this.shakeIntensity *= Math.pow(this.shakeDecay, delta * 60);
    } else {
      this.shakeIntensity = 0;
    }

    this.camera.lookAt(midX, midY, 0);
  };

  Renderer3D.prototype.triggerCameraShake = function (intensity) {
    if (!this.cameraShakeEnabled) return;
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity || 0.35);
  };

  Renderer3D.prototype.triggerKOSlowMo = function () {
    this.isCinematicCloseUp = true;
    this.cinematicTimer = 1.6;
    this.triggerCameraShake(0.65);
  };

  // ------------------------------------------------------------
  // Cinematic Combat Visual Effects (Sparks, Hit Flash, Specials)
  // ------------------------------------------------------------
  Renderer3D.prototype.triggerHitVFX = function (impactX, impactY, isHeavy, isCounter) {
    var posX = (impactX - 640) * 0.0125;
    var posY = Math.max(0, (520 - impactY) * 0.012);

    this.triggerCameraShake(isHeavy ? 0.42 : (isCounter ? 0.38 : 0.18));

    // Directional Spark Burst
    var sparkCount = isHeavy ? 45 : (isCounter ? 35 : 22);
    var color = isCounter ? 0x00e5ff : (isHeavy ? 0xffaa00 : 0xff3d00);

    var geo = new THREE.BufferGeometry();
    var positions = new Float32Array(sparkCount * 3);
    var velocities = [];

    for (var i = 0; i < sparkCount; i++) {
      positions[i * 3 + 0] = posX;
      positions[i * 3 + 1] = posY;
      positions[i * 3 + 2] = 0;

      var angle = Math.random() * Math.PI * 2;
      var spd = 3.5 + Math.random() * 5.0;
      velocities.push(Math.cos(angle) * spd, Math.sin(angle) * spd, (Math.random() - 0.5) * 3);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    var mat = new THREE.PointsMaterial({
      color: color,
      size: 0.14,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending
    });

    var pts = new THREE.Points(geo, mat);
    this.scene.add(pts);

    this.hitSparks.push({
      mesh: pts,
      velocities: velocities,
      life: 0.35,
      maxLife: 0.35
    });
  };

  Renderer3D.prototype.triggerSpecialVFX = function (charId, impactX, impactY, facing) {
    this.isCinematicCloseUp = true;
    this.cinematicTimer = 0.65;
    this.triggerCameraShake(0.5);

    var posX = (impactX - 640) * 0.0125;
    var posY = Math.max(0, (520 - impactY) * 0.012);

    var colors = [0xff3d00, 0x90a4ae, 0x7c4dff, 0x00e5ff, 0x00b4d8, 0x00c853, 0xffaa00, 0xffd700];
    var col = colors[charId] || 0xff3d00;

    // Glowing Elemental Blast Sphere
    var blastGeo = new THREE.SphereGeometry(0.8, 16, 16);
    var blastMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending });
    var blast = new THREE.Mesh(blastGeo, blastMat);
    blast.position.set(posX, posY, 0);
    this.scene.add(blast);

    var light = new THREE.PointLight(col, 3.5, 7.0);
    light.position.set(posX, posY, 0.5);
    this.scene.add(light);

    var self = this;
    var startTime = performance.now();

    function animateBlast() {
      var elapsed = (performance.now() - startTime) / 1000;
      if (elapsed > 0.45) {
        self.scene.remove(blast);
        self.scene.remove(light);
        return;
      }
      var scale = 1.0 + elapsed * 3.5;
      blast.scale.set(scale, scale, scale);
      blast.material.opacity = 0.85 * (1.0 - elapsed / 0.45);
      requestAnimationFrame(animateBlast);
    }
    animateBlast();
  };

  // ------------------------------------------------------------
  // Main Render Loop
  // ------------------------------------------------------------
  Renderer3D.prototype.startLoop = function () {
    var self = this;

    function renderFrame() {
      if (self.isDestroyed) return;
      self.animationFrameId = requestAnimationFrame(renderFrame);

      if (self.isPaused) return;

      var delta = self.clock.getDelta();
      if (delta > 0.1) delta = 0.1; // Clamp large hitch deltas

      // 1. Tekken Dynamic Camera Tracking
      self.updateCamera(delta);

      // 2. Environmental Particles Animation
      if (self.envParticles && self.envVelocities) {
        var pos = self.envParticles.geometry.attributes.position.array;
        var vel = self.envVelocities;
        var count = pos.length / 3;

        for (var i = 0; i < count; i++) {
          pos[i * 3 + 0] += vel[i * 3 + 0] * delta;
          pos[i * 3 + 1] += vel[i * 3 + 1] * delta;
          pos[i * 3 + 2] += vel[i * 3 + 2] * delta;

          // Boundary wrapping
          if (pos[i * 3 + 1] < -0.2) pos[i * 3 + 1] = 13.0;
          if (pos[i * 3 + 1] > 14.0) pos[i * 3 + 1] = 0.0;
          if (pos[i * 3 + 0] < -12.0) pos[i * 3 + 0] = 12.0;
          if (pos[i * 3 + 0] > 12.0) pos[i * 3 + 0] = -12.0;
        }
        self.envParticles.geometry.attributes.position.needsUpdate = true;
      }

      // 3. Lightning flash flicker in stormy arena
      if (self.lightningFlashLight) {
        self.lightningTimer -= delta;
        if (self.lightningTimer <= 0) {
          self.lightningFlashLight.intensity = Math.random() > 0.5 ? 3.0 : 0.0;
          self.lightningTimer = 3.5 + Math.random() * 4.0;
        } else if (self.lightningFlashLight.intensity > 0) {
          self.lightningFlashLight.intensity = Math.max(0, self.lightningFlashLight.intensity - delta * 8.0);
        }
      }

      // 4. Hit Sparks Decay
      for (var s = self.hitSparks.length - 1; s >= 0; s--) {
        var spk = self.hitSparks[s];
        spk.life -= delta;
        if (spk.life <= 0) {
          self.scene.remove(spk.mesh);
          self.hitSparks.splice(s, 1);
        } else {
          var pArr = spk.mesh.geometry.attributes.position.array;
          for (var k = 0; k < spk.velocities.length / 3; k++) {
            pArr[k * 3 + 0] += spk.velocities[k * 3 + 0] * delta;
            pArr[k * 3 + 1] += spk.velocities[k * 3 + 1] * delta;
            pArr[k * 3 + 2] += spk.velocities[k * 3 + 2] * delta;
            spk.velocities[k * 3 + 1] -= 9.8 * delta; // Gravity on sparks
          }
          spk.mesh.geometry.attributes.position.needsUpdate = true;
          spk.mesh.material.opacity = spk.life / spk.maxLife;
        }
      }

      // 4b. Update active character AnimationMixers
      for (var m = 0; m < self.mixers.length; m++) {
        self.mixers[m].update(delta);
      }

      // 5. Render Scene
      self.renderer.render(self.scene, self.camera);
    }

    renderFrame();
  };

  // ------------------------------------------------------------
  // Character Selection Screen 3D Preview Stage
  // Renders Real Animated Rigged Fighter Model with Head-to-Toe Framing
  // ------------------------------------------------------------
  Renderer3D.createPreviewScene = function (containerId, charData) {
    var container = document.getElementById(containerId);
    if (!container) return null;

    var width = container.clientWidth || 400;
    var height = container.clientHeight || 380;
    var isMobile = (window.SANDAI && window.SANDAI.deviceType === 'mobile') || (window.innerWidth <= 900);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 50);
    var camZ = isMobile ? 4.5 : 4.0;
    camera.position.set(0, 1.05, camZ);
    camera.lookAt(0, 0.95, 0);

    var renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: true });
    renderer.setSize(width, height);
    var dpr = isMobile ? 1.0 : Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Studio Preview Lighting
    var ambLight = new THREE.AmbientLight(0x222238, 1.2);
    scene.add(ambLight);

    var keyLight = new THREE.DirectionalLight(0xffeedd, 2.2);
    keyLight.position.set(2.5, 4, 3.5);
    scene.add(keyLight);

    var rimColor = 0x00f0ff;
    if (charData && charData.color) {
      try { rimColor = parseInt(charData.color.replace('#', '0x'), 16); } catch (e) {}
    }
    var rimLight = new THREE.DirectionalLight(rimColor, 2.5);
    rimLight.position.set(-3, 2, -2);
    scene.add(rimLight);

    var dummyRenderer = Object.create(Renderer3D.prototype);
    dummyRenderer.scene = scene;
    dummyRenderer.quality = isMobile ? 'medium' : 'high';
    dummyRenderer.mixers = [];

    var model = dummyRenderer.createFighterModel(charData, 0);
    model.position.set(0, 0, 0);
    model.rotation.y = 0.25;

    var animTime = 0;
    var animId = null;

    function previewLoop() {
      if (!container.parentNode) {
        cancelAnimationFrame(animId);
        try { renderer.dispose(); } catch (e) {}
        return;
      }
      animId = requestAnimationFrame(previewLoop);
      animTime += 0.016;

      // Gentle rotating showcase + breathing
      model.rotation.y = 0.25 + Math.sin(animTime * 0.8) * 0.18;
      for (var dm = 0; dm < dummyRenderer.mixers.length; dm++) {
        dummyRenderer.mixers[dm].update(0.016);
      }
      renderer.render(scene, camera);
    }
    previewLoop();

    var onPrevResize = function () {
      if (!container || !container.parentNode) return;
      var nw = container.clientWidth || 300;
      var nh = container.clientHeight || 260;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener('resize', onPrevResize);

    return {
      destroy: function () {
        if (animId) cancelAnimationFrame(animId);
        window.removeEventListener('resize', onPrevResize);
        try { renderer.dispose(); } catch (e) {}
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
    };
  };

  Renderer3D.prototype.destroy = function () {
    this.isDestroyed = true;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.onResize) window.removeEventListener('resize', this.onResize);

    try {
      this.mixers.forEach(function (m) { m.stopAllAction(); });
      this.mixers = [];
      this.renderer.dispose();
    } catch (e) {}

    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  };

  window.SANDAI.Renderer3D = Renderer3D;
  console.log('[SANDAI 3D] Next-Gen 3D Engine active.');
})();

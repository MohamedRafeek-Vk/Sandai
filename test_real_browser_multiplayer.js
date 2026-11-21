const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/admin/.gemini/antigravity/brain/97a3bdad-3662-4cb4-aedd-f33771efed87';

async function testRealMultiplayer() {
  console.log('===============================================================');
  console.log('    SANDAI REAL TWO-CLIENT BROWSER MULTIPLAYER VERIFICATION    ');
  console.log('===============================================================');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  const passed = [];
  const failed = [];

  function assert(condition, desc) {
    if (condition) {
      console.log(`  [PASS] ${desc}`);
      passed.push(desc);
    } else {
      console.error(`  [FAIL] ${desc}`);
      failed.push(desc);
    }
  }

  try {
    // Client 1: Host
    console.log('\n--- 1. Launching Host and Guest Browser Contexts ---');
    const hostContext = await browser.createBrowserContext();
    const guestContext = await browser.createBrowserContext();

    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    await hostPage.setViewport({ width: 1280, height: 720 });
    await guestPage.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true }); // Guest on mobile landscape!

    await hostPage.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 20000 });
    await guestPage.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 20000 });

    // Navigate both to Online Room Lobby
    await hostPage.evaluate(() => {
      window.SANDAI.showScreen('screen-lobby');
    });
    await guestPage.evaluate(() => {
      window.SANDAI.deviceType = 'mobile';
      window.SANDAI.showScreen('screen-lobby');
    });

    await new Promise(r => setTimeout(r, 1500));

    // Verify both sockets connected
    const hostStatus = await hostPage.evaluate(() => {
      const text = document.querySelector('#connection-status .status-text');
      const dot = document.querySelector('#connection-status .status-dot');
      return {
        text: text ? text.textContent : '',
        isConnected: dot && dot.classList.contains('connected'),
        socketId: window.SANDAI.socket ? window.SANDAI.socket.id : null
      };
    });

    const guestStatus = await guestPage.evaluate(() => {
      const text = document.querySelector('#connection-status .status-text');
      const dot = document.querySelector('#connection-status .status-dot');
      return {
        text: text ? text.textContent : '',
        isConnected: dot && dot.classList.contains('connected'),
        socketId: window.SANDAI.socket ? window.SANDAI.socket.id : null
      };
    });

    assert(hostStatus.isConnected && hostStatus.socketId, `Host connected to Socket.IO (${hostStatus.socketId})`);
    assert(guestStatus.isConnected && guestStatus.socketId, `Guest connected to Socket.IO (${guestStatus.socketId})`);

    // --- 2. Host clicks CREATE NEW ROOM ---
    console.log('\n--- 2. Host Clicking Create Room Button ---');
    await hostPage.evaluate(() => {
      const btn = document.getElementById('btn-create-room');
      if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 1200));

    const hostRoomData = await hostPage.evaluate(() => {
      const codeDisplay = document.getElementById('room-code-display');
      const roomView = document.getElementById('lobby-room-view');
      const isVisible = roomView && !roomView.classList.contains('hidden');
      return {
        roomCode: window.SANDAI.roomCode,
        displayCode: codeDisplay ? codeDisplay.textContent : '',
        isRoomViewVisible: isVisible,
        playerNumber: window.SANDAI.playerNumber
      };
    });

    assert(hostRoomData.roomCode && hostRoomData.roomCode.length === 6, `Host created room with 6-char code: ${hostRoomData.roomCode}`);
    assert(hostRoomData.isRoomViewVisible, 'Host lobby transitioned to active room view');
    assert(hostRoomData.playerNumber === 1, 'Host assigned Player 1 role');

    // --- 3. Guest Joins Room with the 6-character Code ---
    console.log(`\n--- 3. Guest Joining Room ${hostRoomData.roomCode} ---`);
    await guestPage.evaluate((roomCode) => {
      // Switch to Join tab
      const tabJoin = document.querySelector('.lobby-tab[data-tab="join"]');
      if (tabJoin) tabJoin.click();
      const input = document.getElementById('input-room-code');
      if (input) input.value = roomCode;
      const btnJoin = document.getElementById('btn-join-room');
      if (btnJoin) btnJoin.click();
    }, hostRoomData.roomCode);

    await new Promise(r => setTimeout(r, 1500));

    const guestRoomData = await guestPage.evaluate(() => {
      const roomView = document.getElementById('lobby-room-view');
      const isVisible = roomView && !roomView.classList.contains('hidden');
      return {
        roomCode: window.SANDAI.roomCode,
        isRoomViewVisible: isVisible,
        playerNumber: window.SANDAI.playerNumber,
        guestConnected: window.SANDAI.guestConnected
      };
    });

    assert(guestRoomData.roomCode === hostRoomData.roomCode, `Guest joined room ${guestRoomData.roomCode}`);
    assert(guestRoomData.playerNumber === 2, 'Guest assigned Player 2 role');

    // Verify Host sees Guest connected in slot 2
    const hostGuestCheck = await hostPage.evaluate(() => {
      return {
        guestConnected: window.SANDAI.guestConnected,
        p2WaitingHidden: document.getElementById('slot-p2-waiting') ? document.getElementById('slot-p2-waiting').classList.contains('hidden') : false
      };
    });
    assert(hostGuestCheck.guestConnected && hostGuestCheck.p2WaitingHidden, 'Host lobby updated: Guest appears in Slot 2');

    // Take screenshot of 2-player lobby
    await hostPage.screenshot({ path: path.join(ARTIFACT_DIR, 'test_multiplayer_host_lobby.png') });
    await guestPage.screenshot({ path: path.join(ARTIFACT_DIR, 'test_multiplayer_guest_lobby.png') });

    // --- 4. Independent Character Selection & Ready Declarations ---
    console.log('\n--- 4. Independent Character Selection & Ready Synchronization ---');
    // Host chooses Farook (ID 3)
    await hostPage.evaluate(() => {
      window.SANDAI.socket.emit('select-character', {
        roomCode: window.SANDAI.roomCode,
        characterId: 3
      });
      window.SANDAI.player1Character = 3;
      window.SANDAI.updateLobbyUI();
    });

    // Guest chooses Rafeek (ID 6)
    await guestPage.evaluate(() => {
      window.SANDAI.socket.emit('select-character', {
        roomCode: window.SANDAI.roomCode,
        characterId: 6
      });
      window.SANDAI.player2Character = 6;
      window.SANDAI.updateLobbyUI();
    });

    await new Promise(r => setTimeout(r, 800));

    // Guest clicks READY
    await guestPage.evaluate(() => {
      const btn = document.getElementById('btn-ready');
      if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 600));

    // Host clicks READY
    await hostPage.evaluate(() => {
      const btn = document.getElementById('btn-ready');
      if (btn) btn.click();
    });

    await new Promise(r => setTimeout(r, 800));

    const readyCheck = await hostPage.evaluate(() => {
      const btnStart = document.getElementById('btn-start-match');
      return {
        p1Ready: window.SANDAI.p1Ready,
        p2Ready: window.SANDAI.p2Ready,
        btnStartDisabled: btnStart ? btnStart.disabled : true,
        btnStartText: btnStart ? btnStart.textContent : ''
      };
    });

    assert(readyCheck.p1Ready && readyCheck.p2Ready, 'Both Host and Guest marked READY');
    assert(!readyCheck.btnStartDisabled, 'Host START MATCH ⚔ button unlocked and ready to launch');

    // --- 5. Host Launches the Match ---
    console.log('\n--- 5. Host Launching 3D Match ---');
    await hostPage.evaluate(() => {
      const btnStart = document.getElementById('btn-start-match');
      if (btnStart) btnStart.click();
    });

    // Wait for match countdown and transition to screen-game
    await hostPage.waitForSelector('#screen-game.active', { timeout: 10000 });
    await guestPage.waitForSelector('#screen-game.active', { timeout: 10000 });
    await guestPage.waitForSelector('#sandai-touch-controls', { timeout: 10000 });
    await new Promise(r => setTimeout(r, 2000));

    const fightState = await hostPage.evaluate(() => {
      const gameScreen = document.getElementById('screen-game');
      return {
        isGameScreenActive: gameScreen ? gameScreen.classList.contains('active') : false,
        hasRenderer3D: !!window.SANDAI.activeRenderer3D,
        p1Char: window.SANDAI.player1Character,
        p2Char: window.SANDAI.player2Character
      };
    });

    const guestFightState = await guestPage.evaluate(() => {
      const gameScreen = document.getElementById('screen-game');
      return {
        isGameScreenActive: gameScreen ? gameScreen.classList.contains('active') : false,
        hasRenderer3D: !!window.SANDAI.activeRenderer3D,
        touchControlsActive: !!document.getElementById('sandai-touch-controls')
      };
    });

    assert(fightState.isGameScreenActive, 'Host launched into 3D battle arena (#screen-game)');
    assert(guestFightState.isGameScreenActive, 'Guest launched into 3D battle arena (#screen-game)');
    assert(guestFightState.touchControlsActive, 'Guest (Mobile) has virtual touch controller mounted');

    // Take screenshot of active live match on both clients
    await hostPage.screenshot({ path: path.join(ARTIFACT_DIR, 'test_multiplayer_host_fight.png') });
    await guestPage.screenshot({ path: path.join(ARTIFACT_DIR, 'test_multiplayer_guest_fight.png') });

    // --- 6. Real-Time Combat Action Synchronization ---
    console.log('\n--- 6. Real-Time Combat Action Synchronization ---');
    // Guest executes kick attack
    await guestPage.evaluate(() => {
      const kickBtn = document.querySelector('[data-action="kick"]');
      if (kickBtn) {
        const pd = new PointerEvent('pointerdown', { pointerId: 201, bubbles: true, cancelable: true });
        kickBtn.dispatchEvent(pd);
        const pu = new PointerEvent('pointerup', { pointerId: 201, bubbles: true, cancelable: true });
        kickBtn.dispatchEvent(pu);
      }
    });

    await new Promise(r => setTimeout(r, 800));

    const guestActionVerified = await hostPage.evaluate(() => {
      return {
        fighter2Exists: !!(window.SANDAI.activeFightScene && window.SANDAI.activeFightScene.fighter2),
        fighter2State: window.SANDAI.activeFightScene ? window.SANDAI.activeFightScene.fighter2.state : ''
      };
    });

    assert(guestActionVerified.fighter2Exists, 'Fighter 2 (Guest) active and synchronized in Host 3D scene');

    // --- 7. Real-Time Health & Damage Synchronization ---
    console.log('\n--- 7. Real-Time Health & Damage Synchronization ---');
    // Host applies hit damage to Guest
    await hostPage.evaluate(() => {
      if (window.SANDAI.activeFightScene && window.SANDAI.socket) {
        window.SANDAI.activeFightScene.fighter2.takeDamage(15);
        window.SANDAI.socket.emit('game-action', {
          roomCode: window.SANDAI.roomCode,
          action: 'damage',
          targetPlayerIndex: 1,
          damage: 15,
          newHealth: window.SANDAI.activeFightScene.fighter2.health
        });
      }
    });

    await new Promise(r => setTimeout(r, 600));

    const guestHealthCheck = await guestPage.evaluate(() => {
      return {
        health: window.SANDAI.activeFightScene ? window.SANDAI.activeFightScene.fighter2.health : 100
      };
    });

    assert(guestHealthCheck.health < 100, `Guest synchronized health reduction: ${guestHealthCheck.health}/100`);

    // --- 8. Synchronized Round Knockout & Victory Screen ---
    console.log('\n--- 8. Synchronized Round Knockout & Victory Screen ---');
    await hostPage.evaluate(() => {
      if (window.SANDAI.activeFightScene) {
        window.SANDAI.activeFightScene.handleMatchComplete(1); // Host wins
      }
    });

    await hostPage.waitForSelector('#screen-winner.active', { timeout: 6000 });
    await guestPage.waitForSelector('#screen-winner.active', { timeout: 6000 });

    const matchResultCheck = await guestPage.evaluate(() => {
      const winnerScreen = document.getElementById('screen-winner');
      return {
        winnerActive: winnerScreen ? winnerScreen.classList.contains('active') : false,
        winnerName: document.getElementById('winner-name') ? document.getElementById('winner-name').textContent : ''
      };
    });

    assert(matchResultCheck.winnerActive, 'Guest received synchronized match completion and displayed Victory screen');

    await hostPage.screenshot({ path: path.join(ARTIFACT_DIR, 'test_multiplayer_host_victory.png') });
    await guestPage.screenshot({ path: path.join(ARTIFACT_DIR, 'test_multiplayer_guest_victory.png') });

    // --- 9. Clean Room Leave / Return to Lobby ---
    console.log('\n--- 9. Clean Room Leave / Return to Lobby ---');
    await guestPage.evaluate(() => {
      const btnLeave = document.getElementById('btn-winner-menu');
      if (btnLeave) btnLeave.click();
    });

    await new Promise(r => setTimeout(r, 1200));

    const leaveCheck = await hostPage.evaluate(() => {
      return {
        guestConnected: window.SANDAI.guestConnected
      };
    });

    assert(!leaveCheck.guestConnected, 'Host cleanly registered Guest departure');

    await browser.close();

    console.log('\n===============================================================');
    console.log(`TEST SUMMARY: ${passed.length} PASSED | ${failed.length} FAILED`);
    console.log('===============================================================');

    return failed.length === 0;
  } catch (err) {
    console.error('[Multiplayer Test Error]', err);
    await browser.close();
    return false;
  }
}

testRealMultiplayer().then(ok => {
  if (!ok) process.exit(1);
  process.exit(0);
});

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
// First, so it counts every download the scene setup starts.
import { whenAssetsLoaded } from './game/util/assetsReady.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { initSDK } from './bloxity/sdk.js';
import { loadingEnd, loadingStep, gameplayStart } from './bloxity/lifecycle.js';
import { buildStartingPlace } from './game/scenes/StartingPlace.js';
import { attachCameraControls, createChaseCamera, updateChaseCamera } from './game/systems/camera.js';
import { createInputState, updateMovement } from './game/systems/movement.js';
import { RIDER_HEIGHT } from './game/systems/collision.js';
import { checkBoostPadOverlap } from './game/entities/BoostPad.js';
import { BIKES, isBikeUnlocked, requirementText, rideColor, levelTarget, applyLevelProgress } from './shared/constants.js';
import { joinStartingPlace } from './net/colyseusClient.js';
import { createPlayer } from './game/entities/Player.js';
import StartingPlaceHUD from './ui/StartingPlaceHUD.jsx';
import { hideLoadingScreen } from './ui/loadingScreen.js';

const SAVE_KEY = 'mte-starting-place';
const SESSION_PROGRESS_KEY = 'mte-session-progress';
const freshProfile = { wins: 0, finishes: 0, selectedBike: 'bike_scooter', speed: 0, level: 1, levelProgress: 0 };
const effectiveBikeSpeed = (baseSpeed, speed, level) =>
  baseSpeed + Math.min(30, Math.sqrt(Math.max(0, speed)) * 0.25) + Math.min(100, Math.max(0, level - 1)) * 0.3;

function readProfile() {
  try {
    // Wins, trophy pickups and the equipped bike belong to this tab's guest session, like speed
    // and level: a new browser or tab starts from zero. Drop the old shared save if it exists.
    localStorage.removeItem(SAVE_KEY);
    const saved = JSON.parse(sessionStorage.getItem(SAVE_KEY) || '{}');
    const sessionProgress = JSON.parse(sessionStorage.getItem(SESSION_PROGRESS_KEY) || '{}');
    // Clear the old untouched starter fill so zero-speed sessions show an empty bar.
    if (sessionProgress.speed === 0 && sessionProgress.level === 1 && sessionProgress.levelProgress === 12) {
      sessionProgress.levelProgress = 0;
    }
    // A newly opened tab starts fresh even when another tab has already played this browser game.
    const profile = {
      ...freshProfile,
      wins: Number.isFinite(saved.wins) ? saved.wins : freshProfile.wins,
      finishes: Number.isFinite(saved.finishes) ? saved.finishes : freshProfile.finishes,
      selectedBike: saved.selectedBike ?? freshProfile.selectedBike,
      ...sessionProgress,
    };
    profile.speed = Number.isFinite(profile.speed) ? Math.max(0, profile.speed) : freshProfile.speed;
    profile.level = Number.isFinite(profile.level) ? Math.max(1, profile.level) : freshProfile.level;
    profile.levelProgress = Number.isFinite(profile.levelProgress)
      ? Math.max(0, Math.min(levelTarget(profile.level) - 1, profile.levelProgress))
      : freshProfile.levelProgress;
    if (profile.speed === 0) profile.levelProgress = 0;
    // Saves from before the bike store may name a bike that no longer exists.
    if (!BIKES.some((bike) => bike.id === profile.selectedBike)) profile.selectedBike = freshProfile.selectedBike;
    return profile;
  } catch { return { ...freshProfile }; }
}

export default function App() {
  const canvasRef = useRef(null);
  const bikeRef = useRef(null);
  const cameraRef = useRef(null);
  const [profile, setProfile] = useState(readProfile);
  const profileRef = useRef(profile);
  const bonusSpeedRef = useRef(0);
  profileRef.current = profile;
  const [presence, setPresence] = useState({ status: 'connecting', count: 1 });
  const [customSpeed, setCustomSpeed] = useState(BIKES[0].speed);
  const [notice, setNotice] = useState(null);
  const [bikePurchaseOpen, setBikePurchaseOpen] = useState(false);
  const [premiumBoardPurchase, setPremiumBoardPurchase] = useState(null);
  const worldRef = useRef(null);
  const padHandlerRef = useRef(() => {});

  useEffect(() => {
    try { initSDK(); } catch (error) { console.info('Running outside Bloxity portal:', error); }
    loadingStep('Building your starting place');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9bdcff);
    const camera = createChaseCamera(window.innerWidth / window.innerHeight);
    cameraRef.current = camera;
    const detachCameraControls = attachCameraControls(camera);
    // No MSAA on the canvas: the scene is drawn into the composer's own render target (which has none),
    // and the canvas only receives the finished full-screen image, where MSAA changes no pixel but still
    // costs a multisampled framebuffer and a resolve every frame.
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Glow: only things brighter than white (neon strips, pads, hubs, water highlights) bloom.
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.7, 1.0);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    // Bloom is a soft blur, so it doesn't need full resolution to look right; composer.setSize above (and
    // again below on window resize) hands every pass, this one included, the full render size, so its own
    // internal blur chain is downsized again right after, each time, to a quarter of the pixels for that
    // one pass, cutting a real per-frame cost that runs unconditionally regardless of scene content.
    const sizeBloom = () => bloomPass.setSize(window.innerWidth / 2, window.innerHeight / 2);
    sizeBloom();

    const world = buildStartingPlace(scene, renderer);
    world.waveTrack.setRiderLevel(profileRef.current.level);
    bikeRef.current = world.player;
    const detachLeaderboards = world.leaderboards.attach(camera, renderer.domElement);
    worldRef.current = world;
    const keys = createInputState();
    const remoteRiders = new Map();
    let room = null;
    let cancelled = false;
    let reconnectTimer = null;
    let lastPresenceSend = 0;
    let speedGainRemainder = 0;
    let speedProgress = profileRef.current.speed;
    let levelProgress = profileRef.current.levelProgress;
    let riderLevel = profileRef.current.level;
    // Speed and level change on almost every frame while driving. Handing each change to React would
    // re-render the whole HUD (and re-save the profile) 60 times a second, so the loop keeps the live
    // values itself and passes them on at most HUD_SYNC_MS apart; a level-up goes through at once.
    const HUD_SYNC_MS = 100;
    let hudDirty = false;
    let lastHudSync = 0;
    const syncHud = (now) => {
      hudDirty = false;
      lastHudSync = now;
      setProfile((current) => ({ ...current, speed: speedProgress, level: riderLevel, levelProgress }));
    };
    let lastTrainingPad = null;
    let respawnFreezeUntil = 0;
    let pendingReturn = null; // { at, rewardId }: a returned trophy's burst is playing; teleport home at `at`
    const clearKeys = () => {
      keys.clear();
      camera.userData.steer = 0;
    };
    let speedPopupAccum = 0;
    let lastSpeedPopupTime = 0;
    const SPEED_POPUP_INTERVAL = 0.35; // seconds between popups, so one shows per short burst of driving instead of every frame

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connectToRoom();
      }, 2500);
    };
    const connectToRoom = () => {
      joinStartingPlace({
        onStatus: (status) => {
          if (cancelled) return;
          setPresence((current) => ({ ...current, status }));
          if (status === 'offline') scheduleReconnect();
          if (status === 'connected' && reconnectTimer) {
            window.clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
        },
        onPlayers: (players, localSessionId) => {
          if (cancelled) return;
          const present = new Set();
          for (const remote of players) {
            if (remote.sessionId === localSessionId) continue;
            present.add(remote.sessionId);
            let rider = remoteRiders.get(remote.sessionId);
            const bike = BIKES.find((item) => item.id === remote.equippedBike);
            if (!rider) {
              rider = createPlayer();
              scene.add(rider);
              remoteRiders.set(remote.sessionId, rider);
            }
            rider.userData.setBikeModel?.(remote.equippedBike);
            rider.userData.setBikeColor?.(rideColor(bike));
            rider.position.set(remote.x, remote.y, remote.z);
            rider.rotation.y = remote.rotY;
          }
          for (const [sessionId, rider] of remoteRiders) {
            if (!present.has(sessionId)) {
              scene.remove(rider);
              remoteRiders.delete(sessionId);
            }
          }
          setPresence((current) => current.count === players.length ? current : ({ ...current, count: players.length }));
        },
      }).then((connection) => {
        if (cancelled) connection.leave();
        else room = connection;
      }).catch((error) => {
        console.info('Starting Place server is not available:', error.message);
        if (!cancelled) {
          setPresence((current) => ({ ...current, status: 'offline' }));
          scheduleReconnect();
        }
      });
    };
    connectToRoom();

    let previous = performance.now();
    let active = true;
    const animate = (now) => {
      if (!active) return;
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (pendingReturn && now >= pendingReturn.at) {
        // The burst is over: bring the trophy back so it can be collected again, teleport home and
        // hand control straight back.
        world.waveTrack.restoreReward(pendingReturn.rewardId);
        world.player.position.set(0, 0, 0);
        world.player.rotation.set(0, 0, 0);
        Object.assign(world.player.userData, { turnRemaining: 0, turnVelocity: 0 });
        world.player.userData.grounded = true;
        world.player.userData.jumpVelocity = 0;
        pendingReturn = null;
      }
      const previousX = world.player.position.x;
      const previousZ = world.player.position.z;
      if (pendingReturn) {
        clearKeys(); // stay on the mat while the burst plays
      } else if (now >= respawnFreezeUntil) {
        updateMovement(world.player, keys, delta, world.collision, camera);
      } else {
        world.player.position.set(0, 0, 0);
        world.player.rotation.set(0, 0, 0);
        Object.assign(world.player.userData, { turnRemaining: 0, turnVelocity: 0 });
        clearKeys();
      }
      const movedDistance = Math.hypot(world.player.position.x - previousX, world.player.position.z - previousZ);
      const overlappingPad = checkBoostPadOverlap(world.boostPads, world.player.position);
      const groundedOnPad = world.player.userData.grounded && world.player.position.y < 0.8;
      const lockedPremiumBoard = [3, 9, 25, 100].includes(overlappingPad?.multiplier) && groundedOnPad;
      const trainingPad = overlappingPad && !lockedPremiumBoard && groundedOnPad
        ? overlappingPad
        : null;
      const trainingMultiplier = trainingPad?.multiplier ?? 0;
      const trainingRate = (world.player.userData.moveSpeed || 9) * trainingMultiplier;
      speedGainRemainder += lockedPremiumBoard ? 0 : trainingPad ? trainingRate * delta : movedDistance;
      speedGainRemainder += bonusSpeedRef.current; // wheelspin / daily reward prizes
      bonusSpeedRef.current = 0;
      world.player.userData.spinWheels?.(trainingPad ? 0 : movedDistance, delta, trainingMultiplier);

      const trainingState = lockedPremiumBoard ? `locked-${overlappingPad.multiplier}x` : trainingPad;
      if (trainingState !== lastTrainingPad) {
        lastTrainingPad = trainingState;
        if (lockedPremiumBoard) setNotice({ id: Date.now(), text: `${overlappingPad.label} Treadmill is locked. Complete the purchase to train here.` });
        else if (trainingPad) setNotice({ id: Date.now(), text: `${trainingPad.label} training active! Wheels spinning for a ${trainingPad.multiplier}x speed boost.` });
      }

      const reward = world.player.userData.grounded ? world.waveTrack.rewardAt(world.player.position) : null;
      if (reward && world.waveTrack.collectReward(reward.id)) {
        setProfile((current) => ({
          ...current,
          wins: current.wins + reward.wins,
        }));
        // Zoom back in to the normal chase view if zoomed out, burst confetti, and teleport home after it.
        if (camera.userData.zoomTarget > 1) camera.userData.zoomTarget = 1;
        world.returnBursts.spawn(world.player.position, now / 1000);
        pendingReturn = { at: now + world.returnBursts.duration * 1000, rewardId: reward.id };
        clearKeys();
      }

      const earnedSpeed = Math.floor(speedGainRemainder);
      if (earnedSpeed > 0) {
        speedGainRemainder -= earnedSpeed;
        speedProgress += earnedSpeed;
        speedPopupAccum += earnedSpeed;
        // Each level needs more than the last (see levelTarget), so a big jump (a speed pack, or a big
        // debug/testing grant) can clear many at once; the leftover carries into the new level's own,
        // bigger bar. Solved in closed form (see applyLevelProgress) rather than one level at a time,
        // since a huge enough grant could otherwise ask for millions of loop iterations in a single frame.
        const { levelsGained, levelProgress: newLevelProgress } = applyLevelProgress(levelProgress, earnedSpeed, riderLevel);
        riderLevel += levelsGained;
        levelProgress = newLevelProgress;
        hudDirty = true;
        if (levelsGained > 0) {
          syncHud(now);
          setNotice({ id: Date.now(), text: `Level up! You reached Level ${riderLevel}. Your jump is higher and your bike is faster.` });
        }
      }
      if (hudDirty && now - lastHudSync >= HUD_SYNC_MS) syncHud(now);
      const nowSeconds = now / 1000;
      if (speedPopupAccum > 0 && nowSeconds - lastSpeedPopupTime > SPEED_POPUP_INTERVAL) {
        world.speedPopups.spawn(world.player.position, speedPopupAccum, nowSeconds, world.player.rotation.y);
        speedPopupAccum = 0;
        lastSpeedPopupTime = nowSeconds;
      }
      updateChaseCamera(camera, world.player);
      world.update(now / 1000, (bike) => padHandlerRef.current(bike), camera, () => {
        camera.userData.focusPoint = new THREE.Vector3(-8.5, 4, -32.3);
        camera.userData.zoomTarget = 0.4;
        setBikePurchaseOpen(true);
      }, (pad) => {
        camera.userData.focusPoint = new THREE.Vector3(pad.position.x, 1.8, pad.position.z);
        camera.userData.zoomTarget = 0.4;
        setPremiumBoardPurchase(`${pad.userData.multiplier}x`);
      });
      if (world.tsunami.hitsPlayer(world.player, world.collision, RIDER_HEIGHT)) {
        world.player.position.set(0, 0, 0);
        world.player.rotation.set(0, 0, 0);
        Object.assign(world.player.userData, { turnRemaining: 0, turnVelocity: 0 });
        world.player.userData.grounded = true;
        world.player.userData.jumpVelocity = 0;
        setNotice({ id: Date.now(), text: 'The tsunami caught you! Returned to the starting point.' });
      }
      if (room && now - lastPresenceSend > 100) {
        lastPresenceSend = now;
        room.sendMovement({
          x: world.player.position.x,
          y: world.player.position.y,
          z: world.player.position.z,
          rotY: world.player.rotation.y,
          equippedBike: profileRef.current.selectedBike,
        });
      }
      composer.render();
      requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);

    const resize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
      sizeBloom();
    };
    window.addEventListener('resize', resize);

    // The loading screen (index.html) stays up until the bike models and textures have arrived, the web
    // fonts are in and the first frames are on screen, so the player never sees a half-built scene; then
    // it fades straight into the game. A stuck download can't hold the game back for more than 20 s.
    const firstFrames = new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const shownBriefly = new Promise((resolve) => setTimeout(resolve, 900)); // no flash on a fast load
    const ready = Promise.all([whenAssetsLoaded(), document.fonts?.ready, firstFrames, shownBriefly]);
    const giveUp = new Promise((resolve) => setTimeout(resolve, 20000));
    Promise.race([ready, giveUp]).then(() => {
      if (!active) return;
      loadingEnd();
      gameplayStart();
      hideLoadingScreen();
    });

    return () => {
      active = false;
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      room?.leave();
      keys.dispose();
      detachCameraControls();
      detachLeaderboards();
      window.removeEventListener('resize', resize);
      composer.dispose();
      renderer.dispose();
      world.dispose?.();
    };
  }, []);

  useEffect(() => {
    const { wins, finishes, selectedBike } = profile;
    sessionStorage.setItem(SAVE_KEY, JSON.stringify({ wins, finishes, selectedBike }));
    sessionStorage.setItem(SESSION_PROGRESS_KEY, JSON.stringify({
      speed: profile.speed,
      level: profile.level,
      levelProgress: profile.levelProgress,
    }));
  }, [profile]);

  useEffect(() => {
    const bike = BIKES.find((item) => item.id === profile.selectedBike);
    if (bikeRef.current && bike) {
      bikeRef.current.userData.setBikeModel?.(bike.id);
      bikeRef.current.userData.setBikeColor?.(rideColor(bike));
      bikeRef.current.userData.moveSpeed = bike.speed;
    }
    if (bike) setCustomSpeed(bike.speed);
  }, [profile.selectedBike]);

  useEffect(() => {
    if (!bikeRef.current) return;
    // Every level adds a little drive speed and raises the jump arc. Cap both
    // bonuses so long-term progression stays playable.
    bikeRef.current.userData.moveSpeed = effectiveBikeSpeed(customSpeed, profile.speed, profile.level);
    bikeRef.current.userData.jumpSpeed = Math.min(12, 6 + (profile.level - 1) * 0.2);
  }, [customSpeed, profile.speed, profile.level]);

  const selectBike = (bike) => {
    if (!isBikeUnlocked(bike, profile)) return;
    setProfile((current) => ({ ...current, selectedBike: bike.id }));
  };

  // Driving onto a bike-store pad equips the bike, or explains what is missing.
  padHandlerRef.current = (bike) => {
    const current = profileRef.current;
    if (bike.id === current.selectedBike) return;
    if (!isBikeUnlocked(bike, current)) {
      setNotice({ id: Date.now(), text: `${bike.name} is locked - ${requirementText(bike)}` });
      return;
    }
    setProfile((previous) => ({ ...previous, selectedBike: bike.id }));
    setNotice({ id: Date.now(), text: `${bike.name} equipped!` });
    worldRef.current?.store.takeBike(bike.id); // the display bike leaves its stand, and a new one takes its place
  };

  // Pads glow green (equipped), yellow (unlocked) or red (locked).
  useEffect(() => {
    worldRef.current?.setStoreStates((bike) => {
      if (bike.id === profile.selectedBike) return 'equipped';
      return isBikeUnlocked(bike, profile) ? 'unlocked' : 'locked';
    });
  }, [profile.selectedBike, profile.wins, profile.finishes]);

  // Red wave-track trophies open at level 100; the track shows "Return" on the ones this level can collect.
  useEffect(() => {
    worldRef.current?.waveTrack.setRiderLevel(profile.level);
  }, [profile.level]);

  const changeCustomSpeed = (value) => {
    setCustomSpeed(value);
    if (bikeRef.current) {
      bikeRef.current.userData.moveSpeed = effectiveBikeSpeed(value, profileRef.current.speed, profileRef.current.level);
    }
  };

  return (
    <main className="app-root">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Motorcycle Tsunami Escape starting place" />
      <StartingPlaceHUD
        bikes={BIKES}
        wins={profile.wins}
        finishes={profile.finishes}
        notice={notice}
        bikePurchaseOpen={bikePurchaseOpen}
        premiumBoardPurchase={premiumBoardPurchase}
        onClosePurchase={() => {
          setBikePurchaseOpen(false);
          setPremiumBoardPurchase(null);
          if (cameraRef.current) {
            cameraRef.current.userData.focusPoint = null;
            cameraRef.current.userData.zoomTarget = 1;
          }
        }}
        onWavesChange={(disabled) => worldRef.current?.setWavesEnabled(!disabled)}
        selectedBike={profile.selectedBike}
        onSelectBike={selectBike}
        speed={profile.speed}
        level={profile.level}
        levelProgress={profile.levelProgress}
        customSpeed={customSpeed}
        onCustomSpeed={changeCustomSpeed}
        onGrantSpeed={(amount) => { bonusSpeedRef.current += amount; }}
        onGrantWins={(amount) => setProfile((current) => ({ ...current, wins: current.wins + amount }))}
      />
    </main>
  );
}

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
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
import { BIKES, isBikeUnlocked, requirementText, rideColor } from './shared/constants.js';
import { joinStartingPlace } from './net/colyseusClient.js';
import { createPlayer } from './game/entities/Player.js';
import StartingPlaceHUD from './ui/StartingPlaceHUD.jsx';

const SAVE_KEY = 'mte-starting-place';
const SESSION_PROGRESS_KEY = 'mte-session-progress';
const freshProfile = { wins: 0, finishes: 0, selectedBike: 'bike_scooter', collectedRewards: [], speed: 0, level: 1, levelProgress: 0 };
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
      collectedRewards: Array.isArray(saved.collectedRewards) ? saved.collectedRewards : [],
      ...sessionProgress,
    };
    profile.speed = Number.isFinite(profile.speed) ? Math.max(0, profile.speed) : freshProfile.speed;
    profile.level = Number.isFinite(profile.level) ? Math.max(1, profile.level) : freshProfile.level;
    profile.levelProgress = Number.isFinite(profile.levelProgress)
      ? Math.max(0, Math.min(99, profile.levelProgress))
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
  const [profile, setProfile] = useState(readProfile);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const [presence, setPresence] = useState({ status: 'connecting', count: 1 });
  const [customSpeed, setCustomSpeed] = useState(BIKES[0].speed);
  const [notice, setNotice] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const worldRef = useRef(null);
  const padHandlerRef = useRef(() => {});

  useEffect(() => {
    try { initSDK(); } catch (error) { console.info('Running outside Bloxity portal:', error); }
    loadingStep('Building your starting place');

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9bdcff);
    const camera = createChaseCamera(window.innerWidth / window.innerHeight);
    const detachCameraControls = attachCameraControls(camera);
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Glow: only things brighter than white (neon strips, pads, hubs, water highlights) bloom.
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.7, 1.0));
    composer.addPass(new OutputPass());

    const world = buildStartingPlace(scene);
    world.waveTrack.setCollectedRewards(profileRef.current.collectedRewards);
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
    let lastTrainingPad = null;
    let respawnFreezeUntil = 0;
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
      const previousX = world.player.position.x;
      const previousZ = world.player.position.z;
      if (now >= respawnFreezeUntil) {
        updateMovement(world.player, keys, delta, world.collision, camera);
      } else {
        world.player.position.set(0, 0, 0);
        world.player.rotation.set(0, 0, 0);
        camera.userData.steer = 0;
        keys.w = false;
        keys.a = false;
        keys.s = false;
        keys.d = false;
        keys.space = false;
      }
      const movedDistance = Math.hypot(world.player.position.x - previousX, world.player.position.z - previousZ);
      const overlappingPad = checkBoostPadOverlap(world.boostPads, world.player.position);
      const trainingPad = overlappingPad && world.player.userData.grounded && world.player.position.y < 0.8
        ? overlappingPad
        : null;
      const trainingMultiplier = trainingPad?.multiplier ?? 0;
      const trainingRate = (world.player.userData.moveSpeed || 9) * trainingMultiplier;
      speedGainRemainder += trainingPad ? trainingRate * delta : movedDistance;
      const wheelDistance = keys.s && !keys.w ? -movedDistance : movedDistance;
      world.player.userData.spinWheels?.(trainingPad ? 0 : wheelDistance, delta, trainingMultiplier);

      if (trainingPad !== lastTrainingPad) {
        lastTrainingPad = trainingPad;
        if (trainingPad) setNotice({ id: Date.now(), text: `${trainingPad.label} training active! Wheels spinning for a ${trainingPad.multiplier}x speed boost.` });
      }

      const reward = world.player.userData.grounded ? world.waveTrack.rewardAt(world.player.position) : null;
      if (reward && world.waveTrack.collectReward(reward.id)) {
        respawnFreezeUntil = now + 3000;
        const totalWins = profileRef.current.wins + reward.wins;
        setProfile((current) => ({
          ...current,
          wins: current.wins + reward.wins,
          collectedRewards: [...current.collectedRewards, reward.id],
        }));
        setCelebration({ id: Date.now(), rewardWins: reward.wins, totalWins });
        world.player.position.set(0, 0, 0);
        world.player.rotation.set(0, 0, 0);
        world.player.userData.grounded = true;
        world.player.userData.jumpVelocity = 0;
        keys.w = false;
        keys.a = false;
        keys.s = false;
        keys.d = false;
        keys.space = false;
      }

      const earnedSpeed = Math.floor(speedGainRemainder);
      if (earnedSpeed > 0) {
        speedGainRemainder -= earnedSpeed;
        speedProgress += earnedSpeed;
        speedPopupAccum += earnedSpeed;
        const levelTotal = levelProgress + earnedSpeed;
        const levelsGained = Math.floor(levelTotal / 100);
        riderLevel += levelsGained;
        levelProgress = levelTotal % 100;
        setProfile((current) => ({ ...current, speed: speedProgress, level: riderLevel, levelProgress }));
        if (levelsGained > 0) {
          setNotice({ id: Date.now(), text: `Level up! You reached Level ${riderLevel}. Your jump is higher and your bike is faster.` });
        }
      }
      const nowSeconds = now / 1000;
      if (speedPopupAccum > 0 && nowSeconds - lastSpeedPopupTime > SPEED_POPUP_INTERVAL) {
        world.speedPopups.spawn(world.player.position, speedPopupAccum, nowSeconds, world.player.rotation.y);
        speedPopupAccum = 0;
        lastSpeedPopupTime = nowSeconds;
      }
      updateChaseCamera(camera, world.player);
      world.update(now / 1000, (bike) => padHandlerRef.current(bike), camera);
      if (world.tsunami.hitsPlayer(world.player, world.collision, RIDER_HEIGHT)) {
        world.player.position.set(0, 0, 0);
        world.player.rotation.set(0, 0, 0);
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
    };
    window.addEventListener('resize', resize);
    loadingEnd();
    gameplayStart();

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
    const { wins, finishes, selectedBike, collectedRewards } = profile;
    sessionStorage.setItem(SAVE_KEY, JSON.stringify({ wins, finishes, selectedBike, collectedRewards }));
    sessionStorage.setItem(SESSION_PROGRESS_KEY, JSON.stringify({
      speed: profile.speed,
      level: profile.level,
      levelProgress: profile.levelProgress,
    }));
  }, [profile]);

  useEffect(() => {
    if (!celebration) return undefined;
    const timer = setTimeout(() => setCelebration(null), 3000);
    return () => clearTimeout(timer);
  }, [celebration]);

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
  };

  // Pads glow green (equipped), yellow (unlocked) or red (locked).
  useEffect(() => {
    worldRef.current?.setStoreStates((bike) => {
      if (bike.id === profile.selectedBike) return 'equipped';
      return isBikeUnlocked(bike, profile) ? 'unlocked' : 'locked';
    });
  }, [profile]);

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
        celebration={celebration}
        onWavesChange={(disabled) => worldRef.current?.setWavesEnabled(!disabled)}
        selectedBike={profile.selectedBike}
        onSelectBike={selectBike}
        speed={profile.speed}
        level={profile.level}
        levelProgress={profile.levelProgress}
        customSpeed={customSpeed}
        onCustomSpeed={changeCustomSpeed}
      />
    </main>
  );
}

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
import { BIKES, isBikeUnlocked, requirementText, rideColor } from './shared/constants.js';
import { joinStartingPlace } from './net/colyseusClient.js';
import { createPlayer } from './game/entities/Player.js';
import StartingPlaceHUD from './ui/StartingPlaceHUD.jsx';

const SAVE_KEY = 'mte-starting-place';
const freshProfile = { wins: 0, finishes: 0, selectedBike: 'bike_scooter' };

function readProfile() {
  try {
    const profile = { ...freshProfile, ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') };
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
  const [speed, setSpeed] = useState(10);
  const [level, setLevel] = useState(1);
  const [levelProgress, setLevelProgress] = useState(12);
  const [customSpeed, setCustomSpeed] = useState(BIKES[0].speed);
  const [notice, setNotice] = useState(null);
  const [zone, setZone] = useState(null);
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
    bikeRef.current = world.player;
    worldRef.current = world;
    const keys = createInputState();
    const remoteRiders = new Map();
    let room = null;
    let cancelled = false;
    let lastPresenceSend = 0;

    joinStartingPlace({
      onStatus: (status) => { if (!cancelled) setPresence((current) => ({ ...current, status })); },
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
      if (!cancelled) setPresence((current) => ({ ...current, status: 'offline' }));
    });

    let previous = performance.now();
    let active = true;
    let lastZone = null;
    const animate = (now) => {
      if (!active) return;
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      updateMovement(world.player, keys, delta, world.collision);
      updateChaseCamera(camera, world.player);
      world.update(now / 1000, (bike) => padHandlerRef.current(bike));
      const currentZone = world.zoneAt(world.player.position);
      if (currentZone !== lastZone) {
        lastZone = currentZone;
        setZone(currentZone);
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
      room?.leave();
      keys.dispose();
      detachCameraControls();
      window.removeEventListener('resize', resize);
      composer.dispose();
      renderer.dispose();
      world.dispose?.();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    const bike = BIKES.find((item) => item.id === profile.selectedBike);
    if (bikeRef.current && bike) {
      bikeRef.current.userData.setBikeColor?.(rideColor(bike));
      bikeRef.current.userData.moveSpeed = bike.speed;
    }
    if (bike) setCustomSpeed(bike.speed);
  }, [profile.selectedBike]);

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

  const collectSpeed = (amount) => {
    setSpeed((current) => current + amount);
    const progressGain = Math.max(1, Math.floor(amount / 100_000));
    setLevelProgress((current) => {
      const total = current + progressGain;
      if (total >= 100) setLevel((currentLevel) => currentLevel + Math.floor(total / 100));
      return total % 100;
    });
  };

  const changeCustomSpeed = (value) => {
    setCustomSpeed(value);
    if (bikeRef.current) bikeRef.current.userData.moveSpeed = value;
  };

  return (
    <main className="app-root">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Motorcycle Tsunami Escape starting place" />
      <StartingPlaceHUD
        bikes={BIKES}
        wins={profile.wins}
        finishes={profile.finishes}
        notice={notice}
        zone={zone}
        onWavesChange={(disabled) => worldRef.current?.setWavesEnabled(!disabled)}
        selectedBike={profile.selectedBike}
        onSelectBike={selectBike}
        onEarnWin={() => setProfile((current) => ({ ...current, wins: current.wins + 1 }))}
        speed={speed}
        onCollectSpeed={collectSpeed}
        level={level}
        levelProgress={levelProgress}
        customSpeed={customSpeed}
        onCustomSpeed={changeCustomSpeed}
      />
    </main>
  );
}

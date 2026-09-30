import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
// First, so it counts every download the scene setup starts.
import { whenAssetsLoaded } from './game/util/assetsReady.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  applyAllSettings, authenticateWithServer, getProportions, getUser, isEmbedded, listenSetting, onPlayerEvent,
  onProportionsChanged, onUserChanged, playerInRoom, playerJoined, purchase, setFullscreen, showPortalMenu,
  startBloxity, updateRoom,
} from './bloxity/bloxity.js';
import { BUX_SKUS, treadmillSku, winsPackAmount } from './bloxity/skus.js';
import { useBloxityAccount } from './bloxity/useBloxityAccount.js';
import { gameplayEnd, gameplayStart, loadingEnd, loadingStep } from './bloxity/lifecycle.js';
import { hideLoadingScreen } from './ui/loadingScreen.js';
import { buildStartingPlace } from './game/scenes/StartingPlace.js';
import { attachCameraControls, createChaseCamera, updateChaseCamera } from './game/systems/camera.js';
import { createInputState, updateMovement } from './game/systems/movement.js';
import { RIDER_HEIGHT } from './game/systems/collision.js';
import { checkBoostPadOverlap } from './game/entities/BoostPad.js';
import { BIKES, isBikeUnlocked, requirementText, rideColor, levelTarget, applyLevelProgress, formatShort } from './shared/constants.js';
import { HIDDEN_COUNT_OVER } from './game/entities/WaveTrack.js';
import { SPEED_POPUP_VALUE } from './game/entities/SpeedPopup.js';
import { getServerHttpUrl, joinStartingPlace } from './net/colyseusClient.js';
import { createPlayer } from './game/entities/Player.js';
import StartingPlaceHUD from './ui/StartingPlaceHUD.jsx';

const SAVE_KEY = 'mte-starting-place';
const SESSION_PROGRESS_KEY = 'mte-session-progress';
// Other riders ease toward their latest reported position (sent every ~100 ms) at this rate per second, and
// jump straight there when it is further off than REMOTE_SNAP_DISTANCE (a respawn or teleport).
const REMOTE_FOLLOW_RATE = 12;
const REMOTE_SNAP_DISTANCE = 20;
// ownedBikes / ownedTreadmills / winsMultiplier: what Bux bought (see grantPurchase); transactions: their ids.
const freshProfile = {
  wins: 0, finishes: 0, selectedBike: 'bike_scooter', speed: 0, level: 1, levelProgress: 0,
  ownedBikes: [], ownedTreadmills: [], winsMultiplier: 1, transactions: [],
};
const PREMIUM_BOARDS = [3, 9, 25, 100]; // training boards that are locked until bought
// Graphics quality (the portal's graphics_quality setting): the highest pixel ratio to draw at, and whether
// the glow pass runs. Neither needs a shader rebuilt, so switching never stalls a frame.
const QUALITY = {
  Low: { pixelRatio: 0.75, bloom: false },
  Medium: { pixelRatio: 1, bloom: true },
  High: { pixelRatio: 1.5, bloom: true },
  Ultra: { pixelRatio: 2, bloom: true },
};
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
      ownedBikes: Array.isArray(saved.ownedBikes) ? saved.ownedBikes : [],
      ownedTreadmills: Array.isArray(saved.ownedTreadmills) ? saved.ownedTreadmills : [],
      winsMultiplier: saved.winsMultiplier === 2 ? 2 : 1,
      transactions: Array.isArray(saved.transactions) ? saved.transactions : [],
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
  const [aetherunePurchaseOpen, setAetherunePurchaseOpen] = useState(false);
  const [premiumBoardPurchase, setPremiumBoardPurchase] = useState(null);
  const [teleportBackOffer, setTeleportBackOffer] = useState(false);
  const [winsPurchaseOpen, setWinsPurchaseOpen] = useState(false);
  const [rewardBanner, setRewardBanner] = useState(null); // { id, text }: "You received N Wins!"
  const [serverWavesDisabled, setServerWavesDisabled] = useState(false);
  const worldRef = useRef(null);
  const padHandlerRef = useRef(() => {});
  const teleportBackRef = useRef(() => {}); // puts the rider back where the last wave caught them (set in the game loop's effect)
  const account = useBloxityAccount();

  useEffect(() => {
    startBloxity();
    loadingStep('Building the world');

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
    const applyQuality = (name) => {
      const quality = QUALITY[name] ?? QUALITY.High;
      const pixelRatio = Math.min(window.devicePixelRatio, quality.pixelRatio);
      renderer.setPixelRatio(pixelRatio);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(window.innerWidth, window.innerHeight);
      sizeBloom();
      bloomPass.enabled = quality.bloom;
    };

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
    let lastLockedReward = null; // the locked (red) mat the rider is on, so its offer opens once per visit
    let respawnFreezeUntil = 0;
    let pendingReturn = null; // { at, rewardId }: a returned trophy's burst is playing; teleport home at `at`
    let wipeout = null; // { at }: a wave broke the rider apart; the pieces are settling, respawn at `at`
    let deathSpot = null; // where the last wave caught the rider, for Teleport Back
    let teleportBackRequested = false; // bought: put the rider back at deathSpot next frame
    let respawnRequested = false; // the portal asked for a respawn: send the rider home next frame
    teleportBackRef.current = () => { teleportBackRequested = true; };
    // Ends a wipeout early (the wreck is cleared and the rider shown again), for a respawn or Teleport Back.
    const endWipeout = () => {
      if (!wipeout) return;
      wipeout = null;
      world.shatter.clear();
      world.player.visible = true;
      setTeleportBackOffer(false);
    };
    const sendHome = () => {
      world.player.position.set(0, 0, 0);
      world.player.rotation.set(0, 0, 0);
      Object.assign(world.player.userData, { turnRemaining: 0, turnVelocity: 0, popOffset: 0 });
      world.player.userData.grounded = true;
      world.player.userData.jumpVelocity = 0;
    };
    const clearKeys = () => {
      keys.clear();
      camera.userData.steer = 0;
    };
    let speedPopupAccum = 0;
    let lastSpeedPopupTime = 0;
    const SPEED_POPUP_INTERVAL = 0.35; // seconds between popups, so one shows per short burst of driving instead of every frame
    const SPEED_POPUP_UNTIL = 1000; // the shoe popups only show while the rider's speed is at most this

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connectToRoom();
      }, 2500);
    };
    let joinedAs = null; // the Bloxity username the room was joined with (null: as a guest)
    let announced = null; // session ids of the other riders Bloxity has been told about, this connection
    const connectToRoom = () => {
      joinedAs = getUser()?.username ?? null;
      announced = null;
      loadingStep('Joining server');
      joinStartingPlace({
        username: joinedAs,
        onStatus: (status) => {
          if (cancelled) return;
          setPresence((current) => ({ ...current, status }));
          if (status === 'offline') {
            updateRoom('');
            scheduleReconnect();
          }
          if (status === 'connected' && reconnectTimer) {
            window.clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
        },
        onPlayers: (players, localSessionId) => {
          if (cancelled) return;
          // Tell Bloxity who is here (it toasts the player's friends): the riders already in the room when
          // joining, then each one who joins after.
          const firstList = announced === null;
          announced ??= new Set();
          for (const remote of players) {
            if (remote.sessionId === localSessionId || announced.has(remote.sessionId)) continue;
            announced.add(remote.sessionId);
            if (firstList) playerInRoom(remote.username);
            else playerJoined(remote.username);
          }
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
            // Positions arrive only every ~100 ms; animate eases each rider toward its latest one (see
            // REMOTE_FOLLOW_RATE) instead of jumping there, which made other players' bikes stutter.
            const netTarget = rider.userData.netTarget;
            if (!netTarget || Math.hypot(remote.x - netTarget.x, remote.z - netTarget.z) > REMOTE_SNAP_DISTANCE) {
              rider.position.set(remote.x, remote.y, remote.z);
              rider.rotation.y = remote.rotY;
            }
            rider.userData.netTarget = { x: remote.x, y: remote.y, z: remote.z, rotY: remote.rotY };
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
        else {
          room = connection;
          updateRoom(connection.roomId); // friends invited now join this room
        }
      }).catch((error) => {
        console.info('Starting Place server is not available:', error.message);
        if (!cancelled) {
          setPresence((current) => ({ ...current, status: 'offline' }));
          scheduleReconnect();
        }
      });
    };
    connectToRoom();

    // Bloxity: logging in or out rejoins the room under the new name (so friends see who joined), and a
    // logged-in player's purchases saved on this game's server are brought into this session.
    let greetedUserId = null; // the user whose name was last shown over the rider
    const stopWatchingUser = onUserChanged((user) => {
      const username = user?.username ?? null;
      // Logging in shows the player's name over their rider for a few seconds.
      if (user && user._id !== greetedUserId) world.player.userData.showName(user.displayName || user.username);
      greetedUserId = user?._id ?? null;
      if (room && username !== joinedAs) {
        room.leave(); // its onLeave reports 'offline', which reconnects with the new name
        room = null;
      }
      if (!user) return;
      authenticateWithServer(`${getServerHttpUrl()}/api/legion-auth`).then((answer) => {
        const saved = answer?.profile;
        if (cancelled || !saved) return;
        setProfile((current) => ({
          ...current,
          ownedBikes: [...new Set([...current.ownedBikes, ...(saved.ownedBikes ?? []).filter((id) => id !== 'bike_scooter')])],
          ownedTreadmills: [...new Set([...current.ownedTreadmills, ...(saved.ownedTreadmills ?? [])])],
          winsMultiplier: saved.winsMultiplierActive ? 2 : current.winsMultiplier,
        }));
        if (saved.wavesDisabledUntil > Date.now()) {
          world.setWavesEnabled(false);
          setServerWavesDisabled(true);
        }
      });
    });

    // Bloxity avatar proportions shape the local rider.
    const applyProportions = (proportions) => { if (proportions) world.player.userData.setProportions(proportions); };
    applyProportions(getProportions());
    const stopWatchingProportions = onProportionsChanged(applyProportions);

    // Portal settings the game supports (registering one is what shows its control in the portal menu).
    const fpsCounter = document.getElementById('fps-counter');
    let showFps = false;
    let fullscreenReady = false; // the first call only reports the current value: don't act on it
    const stopSettings = [
      listenSetting('graphics_quality', applyQuality),
      listenSetting('show_fps', (value) => {
        showFps = value === 'true';
        if (fpsCounter) fpsCounter.hidden = !showFps;
      }),
      listenSetting('camera_sensitivity', (value) => {
        const sensitivity = parseFloat(value);
        camera.userData.sensitivity = Number.isFinite(sensitivity) ? THREE.MathUtils.clamp(sensitivity, 0.1, 5) : 1;
      }),
      listenSetting('fullscreen', (value) => {
        if (fullscreenReady) setFullscreen(value === 'true');
        fullscreenReady = true;
      }),
    ];
    applyAllSettings();

    // Portal player events. The game has no chat of its own, so chat messages are left to the portal.
    const stopPlayerEvents = onPlayerEvent((event, data) => {
      if (event === 'respawn_request') respawnRequested = true;
      else if (event === 'pointer_lock_changed' && data === false) clearKeys();
    });
    // Esc opens the portal's pause menu when the game runs inside Bloxity.
    const onEscape = (event) => {
      if (event.key === 'Escape' && isEmbedded()) showPortalMenu();
    };
    window.addEventListener('keydown', onEscape);

    let fpsFrames = 0;
    let fpsSince = performance.now();
    let previous = performance.now();
    let active = true;
    const animate = (now) => {
      if (!active) return;
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (showFps) {
        fpsFrames += 1;
        if (now - fpsSince >= 500) {
          fpsCounter.textContent = `${Math.round((fpsFrames * 1000) / (now - fpsSince))} FPS`;
          fpsFrames = 0;
          fpsSince = now;
        }
      }
      if (respawnRequested) {
        respawnRequested = false;
        endWipeout();
        sendHome();
        clearKeys();
      }
      if (teleportBackRequested) {
        teleportBackRequested = false;
        if (deathSpot) {
          endWipeout();
          sendHome(); // clears the steering and jump state...
          world.player.position.copy(deathSpot.position); // ...then back to where the wave caught them
          world.player.rotation.y = deathSpot.rotY;
          world.player.userData.grounded = false; // settles onto whatever is there
          clearKeys();
        }
      }
      if (pendingReturn && now >= pendingReturn.at) {
        // The burst is over: bring the trophy back so it can be collected again, teleport home and
        // hand control straight back.
        world.waveTrack.restoreReward(pendingReturn.rewardId);
        sendHome();
        pendingReturn = null;
      }
      if (wipeout && now >= wipeout.at) {
        // The pieces have settled and shrunk away: the rider is whole again, back at the start.
        wipeout = null;
        sendHome();
        world.player.visible = true;
        setTeleportBackOffer(false); // the Teleport Back offer is only for while the wreck lies there
        setNotice({ id: Date.now(), text: 'The tsunami caught you! Returned to the starting point.' });
      }
      const previousX = world.player.position.x;
      const previousZ = world.player.position.z;
      if (pendingReturn || wipeout) {
        clearKeys(); // stay put while the burst plays, or while the broken rider's pieces settle
      } else if (now >= respawnFreezeUntil) {
        updateMovement(world.player, keys, delta, world.collision, camera);
      } else {
        world.player.position.set(0, 0, 0);
        world.player.rotation.set(0, 0, 0);
        Object.assign(world.player.userData, { turnRemaining: 0, turnVelocity: 0, popOffset: 0 });
        clearKeys();
      }
      const movedDistance = Math.hypot(world.player.position.x - previousX, world.player.position.z - previousZ);
      const overlappingPad = checkBoostPadOverlap(world.boostPads, world.player.position);
      const groundedOnPad = world.player.userData.grounded && world.player.position.y < 0.8;
      const lockedPremiumBoard = PREMIUM_BOARDS.includes(overlappingPad?.multiplier) && groundedOnPad
        && !profileRef.current.ownedTreadmills.includes(overlappingPad.multiplier);
      const trainingPad = overlappingPad && !lockedPremiumBoard && groundedOnPad
        ? overlappingPad
        : null;
      const trainingMultiplier = trainingPad?.multiplier ?? 0;
      const trainingRate = (world.player.userData.moveSpeed || 9) * trainingMultiplier;
      speedGainRemainder += lockedPremiumBoard ? 0 : trainingPad ? trainingRate * delta : movedDistance;
      speedGainRemainder += bonusSpeedRef.current; // wheelspin / daily reward prizes
      bonusSpeedRef.current = 0;
      world.player.userData.spinWheels?.(trainingPad ? 0 : movedDistance, delta, trainingMultiplier);
      // On a training board the bike trembles against the belt; a light breeze shows how fast it's going.
      world.player.userData.rumble?.(trainingPad ? 1 : 0, delta, now / 1000);
      world.wind.update(delta, delta > 0 ? movedDistance / delta : 0, trainingMultiplier);

      const trainingState = lockedPremiumBoard ? `locked-${overlappingPad.multiplier}x` : trainingPad;
      if (trainingState !== lastTrainingPad) {
        lastTrainingPad = trainingState;
        if (lockedPremiumBoard) setNotice({ id: Date.now(), text: `${overlappingPad.label} Treadmill is locked. Complete the purchase to train here.` });
        else if (trainingPad) setNotice({ id: Date.now(), text: `${trainingPad.label} training active! Wheels spinning for a ${trainingPad.multiplier}x speed boost.` });
      }

      const reward = world.player.userData.grounded && !wipeout ? world.waveTrack.rewardAt(world.player.position) : null;
      if (reward && world.waveTrack.collectReward(reward.id)) {
        const wins = reward.wins * profileRef.current.winsMultiplier; // 2x Wins doubles every trophy
        setProfile((current) => ({
          ...current,
          wins: current.wins + wins,
        }));
        // Zoom back in to the normal chase view if zoomed out, burst confetti, and teleport home after it.
        if (camera.userData.zoomTarget > 1) camera.userData.zoomTarget = 1;
        world.returnBursts.spawn(world.player.position, now / 1000);
        pendingReturn = { at: now + world.returnBursts.duration * 1000, rewardId: reward.id };
        clearKeys();
        // A big reward's count isn't on its mat (see HIDDEN_COUNT_OVER), so it is told here instead.
        if (reward.wins > HIDDEN_COUNT_OVER) setRewardBanner({ id: now, text: `You received ${formatShort(wins)} Wins!` });
      }
      // Driving onto a red mat this level can't collect yet offers the 2x Wins boost instead.
      const lockedReward = world.player.userData.grounded && !wipeout ? world.waveTrack.lockedRewardAt(world.player.position) : null;
      if (lockedReward && lockedReward !== lastLockedReward) setWinsPurchaseOpen(true);
      lastLockedReward = lockedReward;

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
      if (speedProgress > SPEED_POPUP_UNTIL) speedPopupAccum = 0;
      if (speedPopupAccum > 0 && nowSeconds - lastSpeedPopupTime > SPEED_POPUP_INTERVAL) {
        world.speedPopups.spawn(world.player.position, SPEED_POPUP_VALUE, nowSeconds, camera.userData.yaw);
        speedPopupAccum = 0;
        lastSpeedPopupTime = nowSeconds;
      }
      const remoteFollow = 1 - Math.exp(-REMOTE_FOLLOW_RATE * delta);
      for (const rider of remoteRiders.values()) {
        const netTarget = rider.userData.netTarget;
        if (!netTarget) continue;
        rider.position.x += (netTarget.x - rider.position.x) * remoteFollow;
        rider.position.y += (netTarget.y - rider.position.y) * remoteFollow;
        rider.position.z += (netTarget.z - rider.position.z) * remoteFollow;
        let turn = (netTarget.rotY - rider.rotation.y) % (Math.PI * 2);
        if (turn > Math.PI) turn -= Math.PI * 2;
        else if (turn < -Math.PI) turn += Math.PI * 2;
        rider.rotation.y += turn * remoteFollow;
      }
      updateChaseCamera(camera, world.player, delta);
      world.update(now / 1000, (bike) => padHandlerRef.current(bike), camera, () => {
        camera.userData.focusPoint = new THREE.Vector3(-8.5, 4, -32.3);
        camera.userData.zoomTarget = 0.4;
        setBikePurchaseOpen(true);
      }, (pad) => {
        if (profileRef.current.ownedTreadmills.includes(pad.userData.multiplier)) return; // already bought
        camera.userData.focusPoint = new THREE.Vector3(pad.position.x, 1.8, pad.position.z);
        camera.userData.zoomTarget = 0.4;
        setPremiumBoardPurchase(`${pad.userData.multiplier}x`);
      }, () => {
        camera.userData.focusPoint = new THREE.Vector3(11.8, 3, -22.1);
        camera.userData.zoomTarget = 0.4;
        setAetherunePurchaseOpen(true);
      });
      const hitBy = wipeout || pendingReturn ? null : world.tsunami.hitsPlayer(world.player, world.collision, RIDER_HEIGHT, previousZ);
      if (hitBy) {
        // Break the rider apart where the wave caught them and let the pieces settle before sending them home.
        const { x, y, z } = world.player.position;
        deathSpot = { position: world.player.position.clone(), rotY: world.player.rotation.y };
        world.shatter.burst(world.player, world.collision.supportAt(x, z, y), camera.position, now / 1000);
        world.player.visible = false;
        wipeout = { at: now + world.shatter.duration * 1000 };
        clearKeys();
        setTeleportBackOffer(true);
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

    // Tell the portal when gameplay is ready; the game remains visible while optional assets load.
    const firstFrames = new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const shownBriefly = new Promise((resolve) => setTimeout(resolve, 900));
    const ready = Promise.all([whenAssetsLoaded(), document.fonts?.ready, firstFrames, shownBriefly]);
    const giveUp = new Promise((resolve) => setTimeout(resolve, 20000));
    whenAssetsLoaded().then(() => { if (active) loadingStep('Preparing the track'); });
    Promise.race([ready, giveUp]).then(() => {
      if (!active) return;
      // With the models in, build every shader behind the loading screen, so none is built mid-ride.
      world.warmShaders(renderer, camera, composer.readBuffer, () => composer.render());
      loadingEnd();
      gameplayStart();
      hideLoadingScreen();
    });

    return () => {
      active = false;
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      room?.leave();
      updateRoom('');
      gameplayEnd();
      stopWatchingUser();
      stopWatchingProportions();
      stopSettings.forEach((stop) => stop());
      stopPlayerEvents();
      window.removeEventListener('keydown', onEscape);
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
    const { wins, finishes, selectedBike, ownedBikes, ownedTreadmills, winsMultiplier, transactions } = profile;
    sessionStorage.setItem(SAVE_KEY, JSON.stringify({ wins, finishes, selectedBike, ownedBikes, ownedTreadmills, winsMultiplier, transactions }));
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
    // Measure the new bike for a wave's wipeout ahead of time, in idle time (see Shatter.prepare): once now,
    // and again after a textured model loading in the background has had time to arrive.
    const prepare = () => {
      if (bikeRef.current) worldRef.current?.shatter.prepare(bikeRef.current);
    };
    const timers = [setTimeout(prepare, 1000), setTimeout(prepare, 6000)];
    return () => timers.forEach(clearTimeout);
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

  // A completed Bux purchase: keep its transaction id and hand over what was bought. (For a logged-in player
  // the server's webhook saves the same, brought back on their next login.) Disable Waves is switched off by
  // the HUD, which owns that toggle.
  const grantPurchase = (sku, transactionId) => {
    const notify = (text) => setNotice({ id: Date.now(), text });
    const award = (change) => setProfile((current) => ({ ...current, ...change(current) }));
    if (transactionId) award((current) => ({ transactions: [...current.transactions, transactionId].slice(-50) }));
    const treadmill = PREMIUM_BOARDS.find((multiplier) => treadmillSku(multiplier) === sku);
    const winsPack = winsPackAmount(sku);
    if (sku === BUX_SKUS.TELEPORT_BACK) {
      teleportBackRef.current();
    } else if (sku === BUX_SKUS.BOOST_2X_WINS) {
      award(() => ({ winsMultiplier: 2 }));
      notify('2x Wins active! Every trophy now pays double.');
    } else if (sku === BUX_SKUS.BOOST_2X_SPEED) {
      bonusSpeedRef.current += Math.max(1, profileRef.current.speed);
      notify('2x Speed! Your speed has been doubled.');
    } else if (sku === BUX_SKUS.BIKE_ASTRALWING || sku === BUX_SKUS.BIKE_AETHERUNE) {
      award((current) => ({ ownedBikes: [...new Set([...current.ownedBikes, sku])] }));
      notify(`${sku === BUX_SKUS.BIKE_ASTRALWING ? 'Astralwing' : 'Aetherune'} Bike is yours!`);
    } else if (treadmill) {
      award((current) => ({ ownedTreadmills: [...new Set([...current.ownedTreadmills, treadmill])] }));
      notify(`${treadmill}x Speed Treadmill unlocked! Ride onto it to train.`);
    } else if (winsPack) {
      award((current) => ({ wins: current.wins + winsPack }));
      notify(`+${winsPack.toLocaleString()} Wins!`);
    }
  };
  // Buys `sku` with Bux (Bloxity shows its own confirmation); resolves to the SDK's { success, error? }.
  const buyWithBux = async (sku) => {
    const result = await purchase(sku, { game: 'motorcycle-tsunami-escape' });
    if (result.success) {
      grantPurchase(sku, result.transactionId);
      account.refreshBalance();
    }
    return result;
  };

  const changeCustomSpeed = (value) => {
    setCustomSpeed(value);
    if (bikeRef.current) {
      bikeRef.current.userData.moveSpeed = effectiveBikeSpeed(value, profileRef.current.speed, profileRef.current.level);
    }
  };

  return (
    <main className="app-root">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Motorcycle Tsunami Escape starting place" />
      <div id="fps-counter" className="fps-counter" hidden />
      <StartingPlaceHUD
        bikes={BIKES}
        wins={profile.wins}
        finishes={profile.finishes}
        notice={notice}
        bikePurchaseOpen={bikePurchaseOpen}
        aetherunePurchaseOpen={aetherunePurchaseOpen}
        premiumBoardPurchase={premiumBoardPurchase}
        teleportBackOffer={teleportBackOffer}
        account={account}
        onPurchase={buyWithBux}
        serverWavesDisabled={serverWavesDisabled}
        winsPurchaseOpen={winsPurchaseOpen}
        rewardBanner={rewardBanner}
        onClosePurchase={() => {
          setBikePurchaseOpen(false);
          setAetherunePurchaseOpen(false);
          setPremiumBoardPurchase(null);
          setWinsPurchaseOpen(false);
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

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
// First, so it counts every download the scene setup starts.
import { whenAssetsLoaded } from './game/util/assetsReady.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  applyAllSettings, authenticateWithServer, getAvatarSpec, getUser, isEmbedded, listenSetting, onAvatarChanged, onPlayerEvent,
  onProportionsChanged, onUserChanged, playerInRoom, playerJoined, purchase, setFullscreen, showPortalMenu,
  startBloxity, updateRoom,
} from './bloxity/bloxity.js';
import { BUX_SKUS, treadmillSku, winsPackAmount } from './bloxity/skus.js';
import { useBloxityAccount } from './bloxity/useBloxityAccount.js';
import { gameplayEnd, gameplayStart, loadingEnd, loadingStep } from './bloxity/lifecycle.js';
import { hideLoadingScreen } from './ui/loadingScreen.js';
import { buildStartingPlace } from './game/scenes/StartingPlace.js';
import { attachCameraControls, createChaseCamera, updateChaseCamera } from './game/systems/camera.js';
import { createInputState, updateMovement, updateRidePitch } from './game/systems/movement.js';
import { RIDER_HEIGHT } from './game/systems/collision.js';
import { checkBoostPadOverlap } from './game/entities/BoostPad.js';
import { BIKES, MAP_LAYOUT, isBikeUnlocked, requirementText, rideColor, levelTarget, applyLevelProgress, formatShort, customSpeedMax, rideSpeedFor, customSpeedFor } from './shared/constants.js';
import { HIDDEN_COUNT_OVER } from './game/entities/WaveTrack.js';
import { SPEED_POPUP_VALUE } from './game/entities/SpeedPopup.js';
import { getServerHttpUrl, joinStartingPlace } from './net/colyseusClient.js';
import { createPlayer } from './game/entities/Player.js';
import { createGameAudio } from './game/audio/GameAudio.js';
import TouchControls from './ui/TouchControls.jsx';
import StartingPlaceHUD from './ui/StartingPlaceHUD.jsx';

const SAVE_KEY = 'mte-starting-place';
const SESSION_PROGRESS_KEY = 'mte-session-progress';
// Other riders ease toward their latest reported position (sent every ~100 ms) at this rate per second, and
// jump straight there when it is further off than REMOTE_SNAP_DISTANCE (a respawn or teleport).
const REMOTE_FOLLOW_RATE = 12;
const REMOTE_SNAP_DISTANCE = 20;
const WAVE_HEAR_RANGE = 140; // world units: how far off an approaching wave starts to be heard
// ownedBikes / ownedTreadmills / winsMultiplier: what Bux bought (see grantPurchase); transactions: their ids.
const freshProfile = {
  wins: 0, finishes: 0, selectedBike: 'bike_scooter', speed: 0, level: 1, levelProgress: 0,
  ownedBikes: [], ownedTreadmills: [], winsMultiplier: 1, transactions: [],
};
const PREMIUM_BOARDS = [3, 9, 25, 100]; // training boards that are locked until bought
// Speed per second on a training board = the equipped bike's own speed x the board's multiplier x this. It uses the
// bike's speed, not the Custom Speed setting (up to 116), so turning that up can't make levels fly by.
const TRAINING_RATE = 0.6;
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
  const keysRef = useRef(null); // the game loop's input state, which the touch controls also drive
  const cameraRef = useRef(null);
  const [profile, setProfile] = useState(readProfile);
  const profileRef = useRef(profile);
  const bonusSpeedRef = useRef(0);
  profileRef.current = profile;
  const [presence, setPresence] = useState({ status: 'connecting', count: 1 });
  // The number the player typed into the Custom Speed box (ridden at rideSpeedFor of it); null rides at their own speed (the
  // equipped bike's plus their level and speed bonuses, see effectiveBikeSpeed). Not saved: a refresh, a change
  // of bike, or a respawn after a wave catches them goes back to their own speed.
  const [customSpeed, setCustomSpeed] = useState(null);
  const [notice, setNotice] = useState(null);
  const [bikePurchaseOpen, setBikePurchaseOpen] = useState(false);
  const [aetherunePurchaseOpen, setAetherunePurchaseOpen] = useState(false);
  const [premiumBoardPurchase, setPremiumBoardPurchase] = useState(null);
  const [teleportBackOffer, setTeleportBackOffer] = useState(false);
  const [winsPurchaseOpen, setWinsPurchaseOpen] = useState(false);
  const [rewardBanner, setRewardBanner] = useState(null); // { id, text }: "You received N Wins!"
  const [levelUpBanner, setLevelUpBanner] = useState(null); // { id, level }: "You leveled up! Level N"
  const [serverWavesDisabled, setServerWavesDisabled] = useState(false);
  const worldRef = useRef(null);
  const padHandlerRef = useRef(() => {});
  const teleportBackRef = useRef(() => {}); // puts the rider back where the last wave caught them (set in the game loop's effect)
  const account = useBloxityAccount();
  const audioRef = useRef(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    startBloxity();
    loadingStep('Building the world');
    // Music, jingles and the engine (silent until the player's first key press or click; see GameAudio).
    const audio = createGameAudio();
    audioRef.current = audio;
    setMuted(audio.isMuted());
    const stopWatchingMute = audio.onMutedChange(setMuted);
    // Every button in the HUD and its popups answers a press with a water-drop "bloop".
    const onButtonPress = (event) => {
      if (event.target instanceof Element && event.target.closest('button, [role="button"]')) audio.playClick();
    };
    window.addEventListener('pointerdown', onButtonPress, true);

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
    // Checking a shader for errors asks the driver for its info log the first time it is drawn, which waits for
    // the GPU to finish building it: a freeze the first time something new comes into view. Keep the check
    // while developing only.
    renderer.debug.checkShaderErrors = import.meta.env.DEV;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Glow: only things brighter than white (neon strips, pads, hubs, water highlights) bloom.
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    composer.setSize(window.innerWidth, window.innerHeight);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.42, 0.7, 1.0);
    // A single NaN / infinite pixel (a degenerate normal, a divide by zero in some shader) would be smeared by
    // the bloom blur into a black square for that frame, which reads as a black box flashing open. The bloom's
    // bright-pass drops any such pixel first, so it can never spread.
    bloomPass.materialHighPassFilter.fragmentShader = bloomPass.materialHighPassFilter.fragmentShader.replace(
      'vec4 texel = texture2D( tDiffuse, vUv );',
      `vec4 texel = texture2D( tDiffuse, vUv );
      if ( !( all( greaterThanEqual( texel, vec4( 0.0 ) ) ) && all( lessThan( texel, vec4( 60000.0 ) ) ) ) ) texel = vec4( 0.0 );`,
    );
    bloomPass.materialHighPassFilter.needsUpdate = true;
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
      composer.render(); // resizing clears the canvas: draw again now, not a frame later, so it never flashes empty
    };

    const world = buildStartingPlace(scene, renderer);
    world.waveTrack.setRiderLevel(profileRef.current.level);
    bikeRef.current = world.player;
    const detachLeaderboards = world.leaderboards.attach(camera, renderer.domElement);
    worldRef.current = world;
    const keys = createInputState();
    keysRef.current = keys;
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
      audio.playRespawn();
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
    const SPEED_POPUP_UNTIL = 1000; // on the wave track the shoe popups stop once the rider's speed passes this (the starting place always shows them)

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer) return;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connectToRoom();
      }, 2500);
    };
    let avatarJson = null; // the player's Bloxity avatar as last shown and sent to the room
    let joinedAs = null; // the Bloxity username the room was joined with (null: as a guest)
    let announced = null; // session ids of the other riders Bloxity has been told about, this connection
    const connectToRoom = () => {
      joinedAs = getUser()?.username ?? null;
      announced = null;
      loadingStep('Joining server');
      joinStartingPlace({
        username: joinedAs,
        displayName: getUser()?.displayName,
        avatar: avatarJson,
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
          // joining, then each one who joins after. A logged-in player joining (as they do on logging in) has
          // their name shown over their rider for a few seconds.
          const firstList = announced === null;
          announced ??= new Set();
          const greet = new Set();
          for (const remote of players) {
            if (remote.sessionId === localSessionId || announced.has(remote.sessionId)) continue;
            announced.add(remote.sessionId);
            if (firstList) playerInRoom(remote.username);
            else {
              playerJoined(remote.username);
              if (!remote.isGuest) greet.add(remote.sessionId);
            }
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
            // Dress them as their Bloxity avatar (built in spare time; the default one if they sent none).
            if (remote.avatar !== rider.userData.avatarJson) {
              rider.userData.avatarJson = remote.avatar;
              let spec = { equipped: {} };
              try {
                if (remote.avatar) spec = JSON.parse(remote.avatar);
              } catch {
                // Not an avatar: the default one.
              }
              rider.userData.setAvatar(spec);
            }
            if (greet.has(remote.sessionId)) rider.userData.showName(remote.displayName || remote.username);
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
              rider.userData.dispose();
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
          if (avatarJson) connection.sendAvatar(avatarJson); // in case the avatar changed while joining
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

    // The player's Bloxity avatar rides their bike, and goes to the room so other players see it too. Logging in,
    // changing the avatar or its proportions in the portal all redress the rider.
    const applyAvatar = () => {
      const spec = getAvatarSpec();
      const json = JSON.stringify(spec);
      if (json === avatarJson) return;
      avatarJson = json;
      world.player.userData.setAvatar(spec, { now: true }).then(() => world.shatter.prepare(world.player));
      room?.sendAvatar(json);
    };
    applyAvatar();
    const stopWatchingAvatar = onAvatarChanged(applyAvatar);
    const stopWatchingProportions = onProportionsChanged(applyAvatar);

    // Bloxity: logging in or out rejoins the room under the new name (so friends see who joined), and a
    // logged-in player's purchases saved on this game's server are brought into this session.
    let greetedUserId = null; // the user whose name was last shown over the rider
    const stopWatchingUser = onUserChanged((user) => {
      const username = user?.username ?? null;
      // Logging in shows the player's name over their rider for a few seconds.
      if (user && user._id !== greetedUserId) world.player.userData.showName(user.displayName || user.username);
      greetedUserId = user?._id ?? null;
      applyAvatar();
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
      listenSetting('master_volume', (value) => {
        const volume = parseInt(value, 10);
        audio.setMasterVolume(Number.isFinite(volume) ? volume / 100 : 1);
      }),
      listenSetting('music_volume', (value) => {
        const volume = parseInt(value, 10);
        audio.setMusicVolume(Number.isFinite(volume) ? volume / 100 : 0.8);
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
      // M mutes and unmutes all game audio (not while typing, e.g. in the custom speed box).
      if (event.code === 'KeyM' && !event.repeat && !(event.target instanceof HTMLInputElement)) audio.toggleMuted();
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
        setCustomSpeed(null); // a respawn rides at the player's own speed again
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
        audio.playRespawn();
        setTeleportBackOffer(false); // the Teleport Back offer is only for while the wreck lies there
        setCustomSpeed(null); // respawned: a typed Custom Speed is dropped, back to the player's own speed
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
      const bikeSpeed = BIKES.find((bike) => bike.id === profileRef.current.selectedBike)?.speed ?? BIKES[0].speed;
      const trainingRate = bikeSpeed * trainingMultiplier * TRAINING_RATE;
      speedGainRemainder += lockedPremiumBoard ? 0 : trainingPad ? trainingRate * delta : movedDistance;
      speedGainRemainder += bonusSpeedRef.current; // wheelspin / daily reward prizes
      bonusSpeedRef.current = 0;
      world.player.userData.spinWheels?.(trainingPad ? 0 : movedDistance, delta, trainingMultiplier);
      // On a training board the bike trembles against the belt; a light breeze shows how fast it's going.
      world.player.userData.rumble?.(trainingPad ? 1 : 0, delta, now / 1000);
      world.wind.update(delta, delta > 0 ? movedDistance / delta : 0, trainingMultiplier);
      // The engine revs with the bike's speed against its top speed; a training board holds it high, more so
      // the stronger the board. It falls silent while the rider is wrecked or being sent home.
      const topSpeed = world.player.userData.moveSpeed || 9;
      const throttle = trainingPad
        ? 0.55 + 0.45 * Math.min(1, trainingMultiplier / 25)
        : Math.min(1, (delta > 0 ? movedDistance / delta : 0) / topSpeed);
      audio.updateEngine(throttle, !wipeout && !pendingReturn, world.player.userData.grounded !== false);
      const onWaveTrack = world.player.position.z < MAP_LAYOUT.room.north; // past the room's north wall
      audio.setOnTrack(onWaveTrack);
      // The wave roar grows as the nearest wave closes in (heard from WAVE_HEAR_RANGE away), louder for a
      // bigger wave, and fades quickly once one has passed. It sinks low while the rider lies wrecked.
      let waveCloseness = 0;
      for (const wave of world.tsunami.state.waves) {
        const gap = world.player.position.z - wave.z; // > 0: still coming
        const reach = gap >= 0 ? 1 - gap / WAVE_HEAR_RANGE : 1 + gap / 40;
        waveCloseness = Math.max(waveCloseness, reach * (0.75 + 0.25 * Math.min(1, wave.height / 20)));
      }
      audio.updateWaves(wipeout ? waveCloseness * 0.25 : waveCloseness);

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
        audio.playWin();
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
        const previousMax = customSpeedMax(riderLevel);
        riderLevel += levelsGained;
        levelProgress = newLevelProgress;
        hudDirty = true;
        if (levelsGained > 0) {
          syncHud(now);
          audio.playLevelUp();
          setLevelUpBanner({ id: now, level: riderLevel });
          if (customSpeedMax(riderLevel) > previousMax) {
            setNotice({ id: Date.now(), text: `Max Custom Speed is now ${customSpeedMax(riderLevel)}!` });
          }
        }
      }
      if (hudDirty && now - lastHudSync >= HUD_SYNC_MS) syncHud(now);
      const nowSeconds = now / 1000;
      if (onWaveTrack && speedProgress > SPEED_POPUP_UNTIL) speedPopupAccum = 0;
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
        // Other riders' bikes tip to the slopes they ride on too (level while in the air).
        const ground = world.collision.supportAt(rider.position.x, rider.position.z, rider.position.y);
        updateRidePitch(rider, world.collision, delta, Math.abs(rider.position.y - ground) < 0.15);
      }
      updateChaseCamera(camera, world.player, delta, world.collision);
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
        audio.playWipeout();
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
      composer.render(); // resizing clears the canvas: draw again now, not a frame later, so it never flashes empty
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
      audio.prepare();
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
      stopWatchingMute();
      window.removeEventListener('pointerdown', onButtonPress, true);
      audio.dispose();
      audioRef.current = null;
      stopWatchingUser();
      stopWatchingAvatar();
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

  // The engine takes on the equipped bike's sound; changing bikes (not the first one, on load) plays a jingle.
  const heardBikeRef = useRef(null);
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && heardBikeRef.current && heardBikeRef.current !== profile.selectedBike) audio.playBikeChange(profile.selectedBike);
    else audio?.setBike(profile.selectedBike);
    heardBikeRef.current = profile.selectedBike;
  }, [profile.selectedBike]);

  useEffect(() => {
    const bike = BIKES.find((item) => item.id === profile.selectedBike);
    if (bikeRef.current && bike) {
      bikeRef.current.userData.setBikeModel?.(bike.id);
      bikeRef.current.userData.setBikeColor?.(rideColor(bike));
    }
    setCustomSpeed(null); // a new bike rides at its own speed until the player types another
    // Measure the new bike for a wave's wipeout ahead of time, in idle time (see Shatter.prepare): once now,
    // and again after a textured model loading in the background has had time to arrive.
    const prepare = () => {
      if (bikeRef.current) worldRef.current?.shatter.prepare(bikeRef.current);
    };
    const timers = [setTimeout(prepare, 1000), setTimeout(prepare, 6000)];
    return () => timers.forEach(clearTimeout);
  }, [profile.selectedBike]);

  // The player's own ride speed: every level and collected speed add a little to the bike's (both capped, so
  // long-term progression stays playable). The Custom Speed box shows it until they type their own.
  const ownSpeed = effectiveBikeSpeed(
    (BIKES.find((item) => item.id === profile.selectedBike) ?? BIKES[0]).speed, profile.speed, profile.level,
  );
  const rideSpeed = customSpeed === null ? ownSpeed : rideSpeedFor(customSpeed);
  useEffect(() => {
    if (!bikeRef.current) return;
    bikeRef.current.userData.moveSpeed = rideSpeed;
    bikeRef.current.userData.jumpSpeed = Math.min(12, 6 + (profile.level - 1) * 0.2); // each level jumps a bit higher
  }, [rideSpeed, profile.level]);

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
    const result = await purchase(sku, { game: 'speed-motorcycle-tsunami-escape' });
    if (result.success) {
      grantPurchase(sku, result.transactionId);
      account.refreshBalance();
    }
    return result;
  };

  const changeCustomSpeed = (value) => {
    setCustomSpeed(value);
    if (bikeRef.current) bikeRef.current.userData.moveSpeed = rideSpeedFor(value); // from this frame on
  };

  return (
    <main className="app-root">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Motorcycle Tsunami Escape starting place" />
      <div id="fps-counter" className="fps-counter" hidden />
      <button
        type="button"
        className={`sound-toggle${muted ? ' muted' : ''}`}
        aria-label={muted ? 'Unmute sound (M)' : 'Mute sound (M)'}
        title={muted ? 'Unmute sound (M)' : 'Mute sound (M)'}
        onClick={(event) => { audioRef.current?.toggleMuted(); event.currentTarget.blur(); }}
      >
        {muted ? '🔇' : '🔊'}
      </button>
      <TouchControls keysRef={keysRef} canvasRef={canvasRef} />
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
        levelUpBanner={levelUpBanner}
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
        customSpeed={customSpeed ?? Math.round(customSpeedFor(ownSpeed))}
        onCustomSpeed={changeCustomSpeed}
        onGrantSpeed={(amount) => { bonusSpeedRef.current += amount; }}
        onGrantWins={(amount) => setProfile((current) => ({ ...current, wins: current.wins + amount }))}
      />
    </main>
  );
}

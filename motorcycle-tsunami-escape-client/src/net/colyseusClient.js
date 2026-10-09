import { Client } from 'colyseus.js';

// The game's id on hosting.bloxity.io. Its client is served from <GAME_ID>.play.bloxity.io (prod) /
// <GAME_ID>.dev.play.bloxity.io (dev), and its backend from <GAME_ID>.host.bloxity.io / <GAME_ID>.dev.host.bloxity.io.
const GAME_ID = 'speed-motorcycle-tsunami-escape';
const BLOXITY_PLAY_API = 'https://play.bloxity.io';
const onBloxity = window.location.hostname.endsWith('bloxity.io');

function getServerUrl() {
  const configured = import.meta.env.VITE_SERVER_WS_URL?.trim();
  const securePage = window.location.protocol === 'https:';
  const hostname = window.location.hostname;
  if (hostname.includes('dev.play.bloxity.io')) return `wss://${GAME_ID}.dev.host.bloxity.io`;
  if (hostname.includes('play.bloxity.io')) return `wss://${GAME_ID}.host.bloxity.io`;
  if (!configured) return `${securePage ? 'wss' : 'ws'}://${hostname}:2567`;

  const url = new URL(configured);
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (loopbackHosts.has(url.hostname) && !loopbackHosts.has(hostname)) {
    url.hostname = hostname;
  }
  if (securePage && url.protocol === 'ws:') url.protocol = 'wss:';
  return url.toString().replace(/\/$/, '');
}

/** The game server's HTTP address (same host as its websocket), for its /api endpoints. */
export function getServerHttpUrl() {
  return getServerUrl().replace(/^ws/, 'http');
}

// On Bloxity, Legion runs several replicas of the server, so a room has to be picked by Legion's matchmaker
// and reached through its websocket proxy rather than through the load-balanced host directly.
async function getRoomUrl() {
  if (!onBloxity) return getServerUrl();
  const response = await fetch(`${BLOXITY_PLAY_API}/v1/play/${GAME_ID}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  const answer = await response.json().catch(() => ({}));
  if (!response.ok || !answer.roomId) throw new Error(`matchmaker: ${answer.error || response.status}`);
  return `${BLOXITY_PLAY_API.replace(/^http/, 'ws')}/v1/ws/${answer.roomId}`;
}

async function joinRoom(options) {
  let lastError;
  // A cold (scaled-to-zero) backend can take a few seconds to come up, so retry a few times.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const client = new Client(await getRoomUrl());
      return await client.joinOrCreate('starting_place', options);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 700 + attempt * 700));
    }
  }
  throw lastError;
}

/**
 * `username` is the Bloxity username when logged in (friends see them join), with `displayName` shown over
 * their rider to the room; guests get a random one.
 * `avatar` is the player's Bloxity avatar as JSON, for other players to dress their rider with.
 */
export async function joinStartingPlace({ username, displayName, avatar, onPlayers, onStatus }) {
  onStatus?.('connecting');
  const room = await joinRoom({
    username: username || `Rider-${Math.floor(1000 + Math.random() * 9000)}`,
    isGuest: !username,
    displayName: displayName ?? '',
    equippedBike: 'bike_scooter',
    speed: 9,
    avatar: avatar ?? '',
  });

  const publishPlayers = () => {
    const players = [];
    room.state?.players?.forEach((player, sessionId) => {
      players.push({
        sessionId,
        username: player.username,
        displayName: player.displayName,
        isGuest: player.isGuest,
        x: player.x,
        y: player.y,
        z: player.z,
        rotY: player.rotY,
        equippedBike: player.equippedBike,
        avatar: player.avatar,
      });
    });
    onPlayers?.(players, room.sessionId);
  };

  room.onStateChange(publishPlayers);
  room.onLeave(() => onStatus?.('offline'));
  room.onError(() => onStatus?.('offline'));
  publishPlayers();
  onStatus?.('connected');

  return {
    sessionId: room.sessionId,
    roomId: room.roomId,
    sendMovement: ({ x, y, z, rotY, equippedBike }) => {
      try { room.send('move', { x, y, z, rotY, equippedBike }); } catch { /* reconnecting */ }
    },
    sendAvatar: (json) => {
      try { room.send('avatar', json); } catch { /* reconnecting */ }
    },
    leave: () => room.leave(),
  };
}

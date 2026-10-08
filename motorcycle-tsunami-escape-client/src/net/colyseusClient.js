import { Client } from 'colyseus.js';

function getServerUrl() {
  const configured = import.meta.env.VITE_SERVER_WS_URL?.trim();
  const securePage = window.location.protocol === 'https:';
  if (!configured) {
    const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
    if (localHosts.has(window.location.hostname)) {
      return `${securePage ? 'wss' : 'ws'}://${window.location.hostname}:2567`;
    }

    // Render exposes the service through its public hostname on 443, not port 2567.
    return 'wss://motorcycle-tsunami-escape.onrender.com';
  }

  const url = new URL(configured);
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (loopbackHosts.has(url.hostname) && !loopbackHosts.has(window.location.hostname)) {
    url.hostname = window.location.hostname;
  }
  if (securePage && url.protocol === 'ws:') url.protocol = 'wss:';
  return url.toString().replace(/\/$/, '');
}

/** The game server's HTTP address (same host as its websocket), for its /api endpoints. */
export function getServerHttpUrl() {
  return getServerUrl().replace(/^ws/, 'http');
}

/**
 * `username` is the Bloxity username when logged in (friends see them join), with `displayName` shown over
 * their rider to the room; guests get a random one.
 * `avatar` is the player's Bloxity avatar as JSON, for other players to dress their rider with.
 */
export async function joinStartingPlace({ username, displayName, avatar, onPlayers, onStatus }) {
  const client = new Client(getServerUrl());
  onStatus?.('connecting');
  const room = await client.joinOrCreate('starting_place', {
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

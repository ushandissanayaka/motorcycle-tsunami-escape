import { Client } from 'colyseus.js';

function getServerUrl() {
  const configured = import.meta.env.VITE_SERVER_WS_URL?.trim();
  const securePage = window.location.protocol === 'https:';
  if (!configured) {
    return `${securePage ? 'wss' : 'ws'}://${window.location.hostname}:2567`;
  }

  const url = new URL(configured);
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (loopbackHosts.has(url.hostname) && !loopbackHosts.has(window.location.hostname)) {
    url.hostname = window.location.hostname;
  }
  if (securePage && url.protocol === 'ws:') url.protocol = 'wss:';
  return url.toString().replace(/\/$/, '');
}

export async function joinStartingPlace({ username, onPlayers, onStatus }) {
  const client = new Client(getServerUrl());
  onStatus?.('connecting');
  const room = await client.joinOrCreate('starting_place', {
    username: username || `Rider-${Math.floor(1000 + Math.random() * 9000)}`,
    isGuest: true,
    equippedBike: 'bike_scooter',
    speed: 9,
  });

  const publishPlayers = () => {
    const players = [];
    room.state?.players?.forEach((player, sessionId) => {
      players.push({
        sessionId,
        username: player.username,
        x: player.x,
        y: player.y,
        z: player.z,
        rotY: player.rotY,
        equippedBike: player.equippedBike,
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
    sendMovement: ({ x, y, z, rotY, equippedBike }) => {
      try { room.send('move', { x, y, z, rotY, equippedBike }); } catch { /* reconnecting */ }
    },
    leave: () => room.leave(),
  };
}

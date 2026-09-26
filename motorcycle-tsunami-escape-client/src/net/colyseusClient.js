import { Client } from 'colyseus.js';

const SERVER_URL = import.meta.env.VITE_SERVER_WS_URL || 'ws://localhost:2567';

export async function joinStartingPlace({ username, onPlayers, onStatus }) {
  const client = new Client(SERVER_URL);
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
    sendMovement: ({ x, y, z, rotY, equippedBike }) => room.send('move', { x, y, z, rotY, equippedBike }),
    leave: () => room.leave(),
  };
}

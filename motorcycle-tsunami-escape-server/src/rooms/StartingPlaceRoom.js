import colyseus from 'colyseus';
import { PlayerState, createInitialState } from './schema.js';

// Guest room for hub presence. It contains no accounts, saves, or purchases.
const { Room } = colyseus;

// A player's avatar arrives as JSON; anything that isn't a short JSON object is dropped. Clients check the
// contents themselves (item ids, proportion ranges, texture hosts) before using it.
const MAX_AVATAR_LENGTH = 4000;
const cleanAvatar = (value) => {
  if (typeof value !== 'string' || value.length > MAX_AVATAR_LENGTH) return '';
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? value : '';
  } catch {
    return '';
  }
};

export class StartingPlaceRoom extends Room {
  maxClients = 60;

  onCreate() {
    this.setState(createInitialState());
    this.onMessage('move', (client, update = {}) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      for (const field of ['x', 'y', 'z', 'rotY']) {
        if (Number.isFinite(update[field])) player[field] = update[field];
      }
      if (typeof update.equippedBike === 'string') player.equippedBike = update.equippedBike.slice(0, 40);
    });
    this.onMessage('avatar', (client, avatar) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.avatar = cleanAvatar(avatar);
    });
  }

  onJoin(client, options = {}) {
    const player = new PlayerState();
    player.username = typeof options.username === 'string' && options.username.trim()
      ? options.username.trim().slice(0, 20)
      : 'Guest';
    // Logged-in Bloxity players join under their username (the client says so); everyone else is a guest.
    player.isGuest = options.isGuest !== false;
    player.displayName = typeof options.displayName === 'string' && options.displayName.trim()
      ? options.displayName.trim().slice(0, 32)
      : player.username;
    player.x = 0;
    player.y = 0;
    player.z = 0;
    player.rotY = 0;
    player.speed = Number.isFinite(options.speed) ? options.speed : 9;
    player.equippedBike = typeof options.equippedBike === 'string' ? options.equippedBike.slice(0, 40) : 'bike_scooter';
    player.avatar = cleanAvatar(options.avatar);
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
  }
}

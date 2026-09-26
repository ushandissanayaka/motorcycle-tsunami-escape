import colyseus from 'colyseus';
import { PlayerState, createInitialState } from './schema.js';

// Guest room for hub presence. It contains no accounts, saves, or purchases.
const { Room } = colyseus;

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
  }

  onJoin(client, options = {}) {
    const player = new PlayerState();
    player.username = typeof options.username === 'string' && options.username.trim()
      ? options.username.trim().slice(0, 20)
      : 'Guest';
    player.isGuest = true;
    player.x = 0;
    player.y = 0;
    player.z = 0;
    player.rotY = 0;
    player.speed = Number.isFinite(options.speed) ? options.speed : 9;
    player.equippedBike = typeof options.equippedBike === 'string' ? options.equippedBike.slice(0, 40) : 'bike_scooter';
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client) {
    this.state.players.delete(client.sessionId);
  }
}

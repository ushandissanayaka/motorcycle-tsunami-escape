import { Schema, MapSchema, type } from '@colyseus/schema';

export class PlayerState extends Schema {}
type('string')(PlayerState.prototype, 'username');
type('string')(PlayerState.prototype, 'displayName'); // the Bloxity display name, shown over their rider
type('boolean')(PlayerState.prototype, 'isGuest');
type('number')(PlayerState.prototype, 'x');
type('number')(PlayerState.prototype, 'y');
type('number')(PlayerState.prototype, 'z');
type('number')(PlayerState.prototype, 'rotY');
type('number')(PlayerState.prototype, 'speed');
type('string')(PlayerState.prototype, 'equippedBike');
// The player's Bloxity avatar as JSON ({ equipped, proportions, skinUrl }), for other players to dress their rider.
type('string')(PlayerState.prototype, 'avatar');

export class StartingPlaceState extends Schema {}
type({ map: PlayerState })(StartingPlaceState.prototype, 'players');

// Default field values (colyseus/schema requires assigning in the room,
// this is just documenting expected shape).
export function createInitialState() {
  const state = new StartingPlaceState();
  state.players = new MapSchema();
  return state;
}

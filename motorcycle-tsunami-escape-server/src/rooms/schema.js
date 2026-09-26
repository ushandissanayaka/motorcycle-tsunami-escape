import { Schema, MapSchema, type } from '@colyseus/schema';

export class PlayerState extends Schema {}
type('string')(PlayerState.prototype, 'username');
type('boolean')(PlayerState.prototype, 'isGuest');
type('number')(PlayerState.prototype, 'x');
type('number')(PlayerState.prototype, 'y');
type('number')(PlayerState.prototype, 'z');
type('number')(PlayerState.prototype, 'rotY');
type('number')(PlayerState.prototype, 'speed');
type('string')(PlayerState.prototype, 'equippedBike');

export class StartingPlaceState extends Schema {}
type({ map: PlayerState })(StartingPlaceState.prototype, 'players');

// Default field values (colyseus/schema requires assigning in the room,
// this is just documenting expected shape).
export function createInitialState() {
  const state = new StartingPlaceState();
  state.players = new MapSchema();
  return state;
}

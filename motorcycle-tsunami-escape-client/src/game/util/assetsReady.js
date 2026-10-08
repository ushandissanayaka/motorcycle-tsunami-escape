import * as THREE from 'three';

/**
 * Tracks the downloads three.js loaders are running (bike models, textures), so the loading screen can
 * stay up until they have all arrived. Every loader in the game uses the default loading manager; its
 * item counters are private, so this counts starts and ends itself. Import it before anything starts
 * loading.
 */
const manager = THREE.DefaultLoadingManager;
let active = 0;
const waiting = [];
const { itemStart, itemEnd } = manager;
manager.itemStart = (url) => {
  active += 1;
  itemStart.call(manager, url);
};
manager.itemEnd = (url) => {
  active = Math.max(0, active - 1);
  itemEnd.call(manager, url);
  if (active === 0) waiting.splice(0).forEach((resolve) => resolve());
};

/** Resolves once no downloads are running, checked a couple of frames on so loads started by the
 * scene setup (some start from a promise) have been counted. */
export function whenAssetsLoaded() {
  return new Promise((resolve) => {
    const check = () => (active === 0 ? resolve() : waiting.push(resolve));
    requestAnimationFrame(() => requestAnimationFrame(check));
  });
}

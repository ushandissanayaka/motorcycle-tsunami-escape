import { getSDK } from './sdk.js';

// How far along the game's loading screen bar is at each step App.jsx reports (0..1); another step moves it on a little.
const STEP_PROGRESS = { 'Building the world': 0.25, 'Joining server': 0.5, 'Preparing the track': 0.8 };
let progress = 0.08;

/** Moves the game's own loading screen (index.html) to `value` (0..1) of the way; it never goes back. */
export function setLoadingProgress(value) {
  progress = Math.min(1, Math.max(progress, value));
  document.getElementById('loading-screen')?.style.setProperty('--progress', progress.toFixed(3));
}

/** Reports a loading step to the portal, and shows it (and moves the bar on) on the game's own loading screen too. */
export function loadingStep(message) {
  getSDK()?.game?.loadingStep?.(message);
  const status = document.querySelector('#loading-screen .loading-status');
  if (status) status.textContent = message;
  setLoadingProgress(STEP_PROGRESS[message] ?? progress + 0.1);
}

export function loadingEnd() {
  getSDK()?.game?.loadingEnd?.();
}

export function gameplayStart() {
  getSDK()?.game?.gameplayStart?.();
}

export function gameplayEnd() {
  getSDK()?.game?.gameplayEnd?.();
}

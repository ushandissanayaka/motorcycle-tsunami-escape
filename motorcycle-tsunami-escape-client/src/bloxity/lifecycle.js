import { getSDK } from './sdk.js';

export function loadingStep(message) {
  getSDK()?.game?.loadingStep?.(message);
}

export function loadingEnd() {
  getSDK()?.game?.loadingEnd?.();
}

export function gameplayStart() {
  getSDK()?.game?.gameplayStart?.();
}

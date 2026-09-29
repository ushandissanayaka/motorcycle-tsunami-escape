/**
 * The loading screen is plain markup in index.html, so it shows the moment the page opens, before the
 * game's scripts have downloaded. This fades it out and removes it once the game is ready.
 */
export function hideLoadingScreen() {
  const screen = document.getElementById('loading-screen');
  if (!screen) return;
  screen.classList.add('loading-screen--done');
  const remove = () => screen.remove();
  screen.addEventListener('transitionend', remove, { once: true });
  setTimeout(remove, 800); // transitionend doesn't fire in a background tab
}

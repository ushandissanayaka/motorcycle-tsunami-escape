import React from 'react';
import studTile from '../assets/popups/stud_tile.png';

/*
 * Popup art is cut from reference screenshots at the 1919x1004 HUD scale, so boxes are in
 * screenshot pixels and scaled with --u. Card art carries a transparent margin (m) around its
 * black border so the hover pop never clips its outline.
 */
export const px = (n) => `calc(${n} * var(--u))`;
export const rect = ([x0, y0, x1, y1], m = 0) => {
  const [l, t, r, b] = Array.isArray(m) ? m : [m, m, m, m];
  return { left: px(x0 - l), top: px(y0 - t), width: px(x1 - x0 + l + r), height: px(y1 - y0 + t + b) };
};
// Every popup sits on the Shop popup's centre line from the reference (x 959.5, y 469.5 of 1004). Its own --u is
// the HUD's, shrunk when needed so the whole popup (`reach`: its height plus anything hanging below it) fits on
// screen with a margin; everything inside is measured in that --u, so it all scales together.
const POPUP_MARGIN = 24;
export const frame = (w, h, reach = h) => ({
  '--u': `min(var(--hud-u), calc((100vw - ${POPUP_MARGIN}px) / ${w}), calc((100vh - ${POPUP_MARGIN}px) / ${reach}))`,
  width: px(w), height: px(h), left: `calc(50% - ${px(w / 2)})`,
  top: `max(${POPUP_MARGIN / 2}px, calc(50% + ${px(469.5 - 502 - h / 2)}))`,
});

// Blur after a click so SPACE (hop) never re-triggers the button that was just pressed.
export const press = (action) => (event) => {
  event.currentTarget.blur();
  action();
};

export function Card({ art, box, m = 4, onClick, className = '', style, children }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`popup-card ${className}`} style={{ ...rect(box, m), ...style }} onClick={onClick}>
      <img src={art} alt="" draggable={false} />
      {children}
    </Tag>
  );
}

export function Popup({ size, reach, top, shell, close, closeBox, label, viewport, contentHeight, onClose, children, after }) {
  const style = frame(...size, reach);
  if (top !== undefined) style.top = `max(${POPUP_MARGIN / 2}px, min(${px(top)}, calc(100% - ${POPUP_MARGIN / 2}px - ${px(reach ?? size[1])})))`;
  return (
    <section className="menu-popup" style={style} role="dialog" aria-label={label}>
      <img className="menu-popup-shell" src={shell} alt="" draggable={false} />
      {viewport ? (
        <div className="menu-popup-scroll" style={{ ...rect(viewport), backgroundImage: `url(${studTile})` }}>
          <div className="menu-popup-content" style={{ height: px(contentHeight) }}>{children}</div>
        </div>
      ) : children}
      {after}
      <button className="menu-popup-close" style={rect(closeBox)} aria-label="Close" onClick={onClose}>
        <img src={close} alt="" draggable={false} />
      </button>
    </section>
  );
}

export const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':');
};

export function readStore(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === 'object' ? value : fallback();
  } catch {
    return fallback();
  }
}

export function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

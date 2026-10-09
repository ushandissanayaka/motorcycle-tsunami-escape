import React, { useEffect, useState } from 'react';
import './TouchControls.css';

// A thumb that lands on the game view in this left share of the screen becomes a joystick right there (a
// floating stick, as in most mobile games): a fixed one would sit on the HUD's left column on a landscape phone.
// Touches further right still swing the camera round (systems/camera.js).
const STICK_ZONE = 0.45;
const stickReach = () => Math.round(Math.min(70, Math.max(44, Math.min(window.innerWidth, window.innerHeight) * 0.12)));
const isTouchScreen = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;

/**
 * On-screen controls for touch screens: the floating joystick, which steers and drives like W / A / S / D
 * (it fills `keys.stick`, see systems/movement.js), and a Jump button (Space). Shown on touch screens, and
 * from the first touch on any other screen; a mouse-and-keyboard player never sees them.
 */
export default function TouchControls({ keysRef, canvasRef }) {
  const [enabled, setEnabled] = useState(isTouchScreen);
  const [stick, setStick] = useState(null); // { x, y, dx, dy, reach }: where it was put down and how far pushed

  useEffect(() => {
    if (enabled) return undefined;
    const onTouch = (event) => { if (event.pointerType === 'touch') setEnabled(true); };
    window.addEventListener('pointerdown', onTouch, true);
    return () => window.removeEventListener('pointerdown', onTouch, true);
  }, [enabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!enabled || !canvas) return undefined;
    let active = null; // { id, x, y, reach }
    const push = (event) => {
      let dx = event.clientX - active.x;
      let dy = event.clientY - active.y;
      const length = Math.hypot(dx, dy);
      if (length > active.reach) {
        dx *= active.reach / length;
        dy *= active.reach / length;
      }
      const keys = keysRef.current;
      if (keys) keys.stick = { x: dx / active.reach, y: -dy / active.reach };
      setStick({ x: active.x, y: active.y, dx, dy, reach: active.reach });
    };
    const onDown = (event) => {
      if (event.pointerType === 'mouse' || active || event.clientX > window.innerWidth * STICK_ZONE) return;
      event.stickClaimed = true; // the camera leaves this finger alone
      active = { id: event.pointerId, x: event.clientX, y: event.clientY, reach: stickReach() };
      push(event);
    };
    const onMove = (event) => {
      if (active && event.pointerId === active.id) push(event);
    };
    const onUp = (event) => {
      if (!active || event.pointerId !== active.id) return;
      active = null;
      if (keysRef.current) keysRef.current.stick = null;
      setStick(null);
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (keysRef.current) keysRef.current.stick = null;
    };
  }, [enabled, canvasRef, keysRef]);

  if (!enabled) return null;
  const jump = (down) => (event) => {
    event.preventDefault();
    if (keysRef.current) keysRef.current.space = down;
  };
  return (
    <div className="touch-controls">
      {stick ? (
        <div className="touch-stick" style={{ left: stick.x, top: stick.y, '--reach': `${stick.reach}px` }}>
          <div className="touch-stick-knob" style={{ transform: `translate(calc(-50% + ${stick.dx}px), calc(-50% + ${stick.dy}px))` }} />
        </div>
      ) : (
        <div className="touch-stick touch-stick-hint" aria-hidden="true">
          <div className="touch-stick-knob" />
          <span>Drag to ride</span>
        </div>
      )}
      <button
        type="button" className="touch-jump" aria-label="Jump"
        onPointerDown={jump(true)} onPointerUp={jump(false)} onPointerCancel={jump(false)} onPointerLeave={jump(false)}
        onContextMenu={(event) => event.preventDefault()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 4 13h5v7h6v-7h5z" /></svg>
        <span>Jump</span>
      </button>
    </div>
  );
}

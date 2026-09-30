import React from 'react';

// Bloxity's Bux mark, as the Bloxity SDK draws it: three blue ring segments, 120 degrees apart, in a 100 x 100 box.
const SEGMENT = 'M 54 10.2 A 40 40 0 0 1 86.467 66.436 L 67.199 55.311 A 18 18 0 0 0 54 32.45 Z';
const BLUE = '#0080FF';

/**
 * The Bux currency icon. Plain, it is the mark alone (for dark panels such as the purchase dialog). As a `coin`,
 * the mark sits on a white disc with a dark outline, matching the game's outlined price digits and the coin
 * painted into the HUD / shop art.
 */
export default function BuxIcon({ coin = false, className = '' }) {
  const segments = [0, 120, 240].map((angle) => (
    <path key={angle} d={SEGMENT} fill={BLUE} transform={angle ? `rotate(${angle} 50 50)` : undefined} />
  ));
  return (
    <svg className={`bux-icon ${className}`} viewBox="0 0 100 100" aria-hidden="true">
      {coin ? (
        <>
          <circle cx="50" cy="50" r="50" fill="#121214" />
          <circle cx="50" cy="50" r="40" fill="#fff" />
          <g transform="translate(50 50) scale(0.8) translate(-50 -50)">{segments}</g>
        </>
      ) : segments}
    </svg>
  );
}

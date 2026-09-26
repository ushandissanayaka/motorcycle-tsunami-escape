import React from 'react';
import { isBikeUnlocked, requirementText, stepText } from '../shared/constants.js';

export default function BikeSection({ bikes, wins, finishes = 0, selectedBike, onSelect, onEarnWin }) {
  return (
    <aside className="bike-panel">
      <div className="panel-heading">
        <div><span className="panel-kicker">YOUR GARAGE</span><h2>Choose a bike</h2></div>
        <span className="garage-icon" aria-hidden="true">M</span>
      </div>
      <p className="garage-copy">Ride around and collect wins to unlock faster bikes.</p>
      <div className="bike-list">
        {bikes.map((bike, index) => {
          const unlocked = isBikeUnlocked(bike, { wins, finishes });
          const selected = bike.id === selectedBike;
          const owned = bike.finishesRequired !== undefined ? finishes : wins;
          const needed = bike.finishesRequired ?? bike.winsRequired;
          const progress = needed ? Math.min(owned / needed * 100, 100) : 100;
          return (
            <button key={bike.id} className={`bike-card ${selected ? 'selected' : ''} ${unlocked ? '' : 'locked'}`} onClick={() => onSelect(bike)} disabled={!unlocked}>
              <span className={`bike-art bike-art-${index}`} style={{ '--bike-color': `#${bike.color.toString(16).padStart(6, '0')}` }}><i /><b /><em /></span>
              <span className="bike-info">
                <strong>{bike.name}</strong>
                <small>{unlocked ? `${stepText(bike)} · TOP SPEED ${bike.speed}` : requirementText(bike)}</small>
                {!unlocked && <span className="unlock-track"><i style={{ width: `${progress}%` }} /></span>}
              </span>
              <span className="bike-state">{selected ? 'RIDING' : unlocked ? 'SELECT' : 'LOCKED'}</span>
            </button>
          );
        })}
      </div>
      <div className="garage-footer"><span className="online-dot" /> Unlock bikes with wins and finishes</div>
      {onEarnWin && <button className="demo-win-button" onClick={onEarnWin}>PRACTICE: +1 WIN</button>}
    </aside>
  );
}

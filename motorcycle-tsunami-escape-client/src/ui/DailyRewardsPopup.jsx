import React, { useEffect, useState } from 'react';
import { Card, Popup, clock, press, px, readStore, writeStore } from './popupParts.jsx';

import dailyShell from '../assets/popups/daily_shell.png';
import dailyClose from '../assets/popups/daily_close.png';
import dailyClaimAll from '../assets/popups/daily_claim_all.png';
import dailyCheck from '../assets/popups/daily_check.png';
import day1 from '../assets/popups/daily_day1.png';
import day2 from '../assets/popups/daily_day2.png';
import day3 from '../assets/popups/daily_day3.png';
import day4 from '../assets/popups/daily_day4.png';
import day5 from '../assets/popups/daily_day5_blank.png';
import day6 from '../assets/popups/daily_day6_blank.png';
import day7 from '../assets/popups/daily_day7_blank.png';

const STORE_KEY = 'mte-daily-rewards';
const HOUR = 3600 * 1000;
const CARD_M = [3, 12, 3, 3];

// Each day unlocks 24h after the previous one - a fresh account can claim Day 1 right away.
const DAYS = [
  { day: 1, art: day1, box: [30, 104, 244, 318], timerY: 45.5, size: 23, reward: '+2,000 Speed', speed: 2000 },
  { day: 2, art: day2, box: [262, 104, 475, 318], timerY: 45.5, size: 23, reward: '+15 Wins', wins: 15 },
  { day: 3, art: day3, box: [492, 104, 706, 318], timerY: 45.5, size: 23, reward: '+5,000 Speed', speed: 5000 },
  { day: 4, art: day4, box: [30, 331, 244, 545], timerY: 45.5, size: 23, reward: '+50 Wins', wins: 50 },
  { day: 5, art: day5, box: [262, 331, 475, 545], timerY: 45.5, size: 23, reward: 'Purple Trail' },
  { day: 6, art: day6, box: [492, 331, 706, 545], timerY: 45.5, size: 23, reward: '+10,000 Speed', speed: 10000 },
  { day: 7, art: day7, box: [720, 104, 1004, 545], timerY: 61, size: 32, reward: 'Hexa Bike' },
];

const unlockAt = (state, day) => state.start + (day - 1) * 24 * HOUR;

export default function DailyRewardsPopup({ onClose, onMessage, onGrantSpeed, onGrantWins }) {
  const [state, setState] = useState(() => readStore(STORE_KEY, () => ({ start: Date.now(), claimed: [] })));
  const [now, setNow] = useState(Date.now);

  useEffect(() => writeStore(STORE_KEY, state), [state]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const ready = (day) => !state.claimed.includes(day) && now >= unlockAt(state, day);
  const claim = (days) => {
    if (!days.length) return false;
    setState((current) => ({ ...current, claimed: [...current.claimed, ...days] }));
    days.forEach((day) => {
      const item = DAYS.find((entry) => entry.day === day);
      if (item.speed) onGrantSpeed(item.speed);
      if (item.wins) onGrantWins(item.wins);
    });
    onMessage(`Claimed: ${days.map((day) => DAYS.find((entry) => entry.day === day).reward).join(', ')}!`);
    return true;
  };
  const nextOpen = () => {
    const pending = DAYS.filter((item) => !state.claimed.includes(item.day)).map((item) => unlockAt(state, item.day));
    return pending.length ? `Next reward in ${clock(Math.min(...pending) - now)}.` : 'All daily rewards claimed!';
  };

  return (
    <Popup size={[1032, 571]} reach={680} top={131.5} shell={dailyShell} close={dailyClose} closeBox={[944, 11, 1012, 78]} label="Daily Rewards" onClose={onClose}
      after={(
        <Card art={dailyClaimAll} box={[319, 581, 713, 673]} m={0}
          onClick={press(() => { if (!claim(DAYS.filter((item) => ready(item.day)).map((item) => item.day))) onMessage(nextOpen()); })} />
      )}>
      {DAYS.map((item) => {
        const claimed = state.claimed.includes(item.day);
        const isReady = ready(item.day);
        return (
          <Card key={item.day} art={item.art} box={item.box} m={CARD_M} className={claimed ? 'daily-claimed' : ''}
            onClick={press(() => { if (isReady) claim([item.day]); else if (!claimed) onMessage(`Day ${item.day} unlocks in ${clock(unlockAt(state, item.day) - now)}.`); })}>
            <span className="daily-timer" style={{ top: px(CARD_M[1] + item.timerY), fontSize: px(claimed ? 22 : item.size) }}>
              {claimed ? 'CLAIMED!' : isReady ? 'READY!' : `(${clock(unlockAt(state, item.day) - now)})`}
            </span>
            {claimed && <img className="daily-check" src={dailyCheck} alt="" draggable={false} />}
          </Card>
        );
      })}
    </Popup>
  );
}

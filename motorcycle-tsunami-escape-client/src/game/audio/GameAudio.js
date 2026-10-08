// Every sound in the game is synthesised here with the Web Audio API: the background song, the level-up and
// bike-change jingles, button clicks, the trophy effect, each bike's engine, the roar of an approaching wave
// and the short tune that plays while the rider is wiped out (the song stops, and starts over on respawn). Nothing is downloaded, so audio
// adds no loading time and has no licensing to worry about.
//
// Browsers only let a page start audio after the player interacts with it, so the context is created on the
// first key press, click or touch (see unlock). Until then every call here is a no-op.
//
// Routing:  song voices -> songDry -> musicBus -> musicDuck -> musicVolume -+
//           wipeout tune ---------------------------> stingBus ----------+
//           jingles / effects --------------------------------> sfxBus --+-> master -> compressor -> speakers
//           engine -------------------------------------------> engineBus +
//           wave roar ----------------------------------------> waveBus --+
// The song's dry, echo and reverb feeds (songDry / songEcho / songVerb) fade together, so stopping the song
// on a wipeout silences its held notes and their sends at once while the reverb tail of other sounds rings on.
// The music also feeds a shared echo (delay) and reverb, and its pads and bass are "pumped" by the kick
// (sidechain ducking), which gives the track its driving, bouncy feel.

const BPM = 124;
const STEP = 60 / BPM / 4; // one 16th note, in seconds
const LOOKAHEAD = 0.15; // seconds of music scheduled ahead of the clock
const TICK_MS = 25;
const SFX_LEVEL = 0.7;
// The mix depends on where the rider is: in the starting place the song leads and the engine is a soft purr
// underneath; out on the wave track the song drops well back and the engine sits just above it, so the
// approaching waves are what stands out (see setOnTrack).
const MIX = {
  start: { music: 0.4, engine: 0.07, waves: 0.35 },
  track: { music: 0.13, engine: 0.12, waves: 0.8 },
};
// Big moments (level up, a returned trophy, a new bike) take the spotlight: the song drops to SPOTLIGHT.music
// and the engine and waves to SPOTLIGHT.bed for the length of the jingle, which plays SPOTLIGHT.boost x louder
// than the other effects.
const SPOTLIGHT = { music: 0.12, bed: 0.35, boost: 1.6 };
const MIX_TIME = 0.9; // seconds (time constant) to glide from one mix to the other
const MUTE_KEY = 'mte-audio-muted';

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// --- the song ---------------------------------------------------------------------------------------------
// A minor, the classic i-VI-III-VII loop for the hook and a lifting VI-VII-v-i for the chorus. `bass` is the
// root (played an octave and two up), `tones` the chord voiced around middle C for the pads and arpeggio.
const CHORDS = {
  Am: { bass: 33, tones: [57, 60, 64] },
  F: { bass: 29, tones: [57, 60, 65] },
  C: { bass: 36, tones: [55, 60, 64] },
  G: { bass: 31, tones: [55, 59, 62] },
  Em: { bass: 28, tones: [55, 59, 64] },
};

// Melodies are [bar, step, midi note, length in steps].
const HOOK_BAR_0 = [[0, 76, 3], [3, 74, 1], [4, 72, 2], [6, 74, 2], [8, 76, 4], [12, 72, 2], [14, 71, 2]];
const HOOK_BAR_1 = [[0, 69, 4], [4, 72, 2], [6, 69, 2], [8, 77, 4], [12, 76, 4]];
const at = (bar, notes) => notes.map(([step, note, len]) => [bar, step, note, len]);
const HOOK = [
  ...at(0, HOOK_BAR_0),
  ...at(1, HOOK_BAR_1),
  ...at(2, [[0, 76, 3], [3, 79, 3], [6, 76, 2], [8, 74, 2], [10, 72, 2], [12, 74, 4]]),
  ...at(3, [[0, 71, 4], [4, 74, 4], [8, 79, 6]]),
  ...at(4, HOOK_BAR_0),
  ...at(5, HOOK_BAR_1),
  ...at(6, [[0, 76, 3], [3, 79, 3], [6, 81, 2], [8, 79, 2], [10, 76, 2], [12, 74, 4]]),
  ...at(7, [[0, 71, 2], [2, 72, 2], [4, 74, 2], [6, 76, 10]]),
];
const CHORUS_BAR_0 = [[0, 81, 6], [6, 79, 2], [8, 77, 4], [12, 76, 4]];
const CHORUS = [
  ...at(0, CHORUS_BAR_0),
  ...at(1, [[0, 74, 6], [6, 76, 2], [8, 79, 8]]),
  ...at(2, [[0, 76, 4], [4, 79, 4], [8, 83, 6], [14, 81, 2]]),
  ...at(3, [[0, 81, 12], [12, 76, 2], [14, 79, 2]]),
  ...at(4, CHORUS_BAR_0),
  ...at(5, [[0, 74, 4], [4, 79, 4], [8, 83, 4], [12, 86, 4]]),
  ...at(6, [[0, 84, 8], [8, 83, 4], [12, 79, 4]]),
  ...at(7, [[0, 76, 12]]),
];
const BREAK_MELODY = [
  ...at(0, [[0, 76, 8], [8, 72, 8]]),
  ...at(1, [[0, 77, 8], [8, 76, 8]]),
  ...at(2, [[0, 79, 8], [8, 76, 8]]),
  ...at(3, [[0, 74, 16]]),
];

// drums: 'full' (four on the floor), 'hats' (hats only) or 'none'. riser: a noise sweep over the last bar
// leading into the next section; crash: a cymbal on the first beat.
const SECTIONS = {
  intro: { chords: ['Am', 'F', 'C', 'G'], drums: 'hats', bass: false, arp: true, pad: true, riser: true },
  hook: { chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'], melody: HOOK, voice: 'lead', drums: 'full', bass: true, arp: true, pad: true, crash: true },
  chorus: { chords: ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'], melody: CHORUS, voice: 'lead', drums: 'full', bass: true, arp: true, pad: true, crash: true, fill: true },
  groove: { chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G'], drums: 'full', bass: true, arp: true, pad: true },
  break: { chords: ['Am', 'F', 'C', 'G'], melody: BREAK_MELODY, voice: 'bell', drums: 'none', bass: false, arp: false, pad: true, riser: true },
};
// Played once from the top, then the loop repeats forever.
const INTRO = ['intro'];
const LOOP = ['hook', 'chorus', 'groove', 'hook', 'break', 'chorus'];
const ARP_PATTERN = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 4, 3, 2, 1];

// --- engines ----------------------------------------------------------------------------------------------
// idle/max: firing pitch (Hz) from standstill to full speed. wave: the main oscillator; buzz: how much of a
// slightly detuned square is mixed in for grit. sub: the octave-down rumble. cut: the low-pass range that opens
// with the revs (kept low and run through two filters, so the engine purrs instead of fizzing). lump: how
// uneven the firing is (a V-twin's "potato-potato"), at lumpRatio x the firing pitch. drive: soft saturation.
// air: the rush of wind that grows with speed.
const ENGINES = {
  scooter: { idle: 72, max: 210, wave: 'triangle', buzz: 0.12, sub: 0.45, cut: [520, 1700], lump: 0.15, lumpRatio: 0.5, drive: 1.4, air: 0.05, level: 0.55 },
  dirt: { idle: 50, max: 175, wave: 'sawtooth', buzz: 0.1, sub: 0.5, cut: [380, 1500], lump: 0.3, lumpRatio: 0.5, drive: 1.7, air: 0.06, level: 0.5 },
  cruiser: { idle: 31, max: 96, wave: 'sawtooth', buzz: 0.05, sub: 0.9, cut: [230, 820], lump: 0.55, lumpRatio: 0.5, drive: 1.9, air: 0.05, level: 0.85 },
  sport: { idle: 64, max: 265, wave: 'sawtooth', buzz: 0.08, sub: 0.35, cut: [560, 2100], lump: 0.07, lumpRatio: 1, drive: 1.5, air: 0.07, level: 0.45 },
  beast: { idle: 37, max: 150, wave: 'sawtooth', buzz: 0.1, sub: 0.8, cut: [300, 1350], lump: 0.4, lumpRatio: 0.5, drive: 2.4, air: 0.07, level: 0.6 },
  electric: { idle: 110, max: 420, wave: 'triangle', buzz: 0, sub: 0.25, cut: [900, 2600], lump: 0, lumpRatio: 1, drive: 1, air: 0.05, level: 0.45 },
};
const ENGINE_FOR_BIKE = {
  bike_scooter: 'scooter',
  bike_trail: 'dirt', bike_azure: 'dirt',
  bike_cruiser_red: 'cruiser', bike_cruiser_violet: 'cruiser',
  bike_cyan_bolt: 'sport', bike_violet_racer: 'sport', bike_gold_sprint: 'sport', bike_blue_blitz: 'sport', bike_pink_phantom: 'sport',
  bike_bloodmoon_1: 'beast', bike_bloodmoon_2: 'beast', bike_bloodmoon_3: 'beast',
  bike_astralwing: 'electric', bike_aetherune: 'electric',
};
// Bikes sharing an engine type still sound a little different: each one along its list is pitched up a touch.
const PITCH_FOR_BIKE = {};
for (const type of Object.keys(ENGINES)) {
  Object.keys(ENGINE_FOR_BIKE).filter((id) => ENGINE_FOR_BIKE[id] === type).forEach((id, index) => { PITCH_FOR_BIKE[id] = 1 + index * 0.07; });
}

function distortionCurve(amount) {
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i += 1) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

function readMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export function createGameAudio() {
  let ctx = null;
  let master; let musicVolume; let musicDuck; let musicBus; let pumpBus; let sfxBus; let engineBus; let waveBus; let stingBus;
  let bedDuck; let jingleBus;
  let songDry; let songEcho; let songVerb;
  let echoSend; let reverbSend; let noiseBuffer;
  let muted = readMuted();
  let masterLevel = 1;
  let musicLevel = 1;
  let disposed = false;
  const mutedListeners = new Set();

  // ---- setup -------------------------------------------------------------------------------------------
  const build = () => {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return false;
    ctx = new AudioCtx({ latencyHint: 'interactive' });

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.2;
    compressor.connect(ctx.destination);
    master = ctx.createGain();
    master.connect(compressor);

    musicVolume = ctx.createGain();
    musicVolume.connect(master);
    musicDuck = ctx.createGain();
    musicDuck.connect(musicVolume);
    musicBus = ctx.createGain();
    musicBus.gain.value = MIX.start.music;
    musicBus.connect(musicDuck);
    songDry = ctx.createGain();
    songDry.connect(musicBus);
    pumpBus = ctx.createGain(); // pads and bass, ducked by every kick
    pumpBus.connect(songDry);
    stingBus = ctx.createGain();
    stingBus.gain.value = 0.55;
    stingBus.connect(musicVolume);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = SFX_LEVEL;
    sfxBus.connect(master);
    engineBus = ctx.createGain();
    engineBus.gain.value = MIX.start.engine;
    bedDuck = ctx.createGain(); // engine and waves, ducked under the jingles
    bedDuck.connect(master);
    engineBus.connect(bedDuck);
    waveBus = ctx.createGain();
    waveBus.gain.value = MIX.start.waves;
    waveBus.connect(bedDuck);
    jingleBus = ctx.createGain();
    jingleBus.gain.value = SPOTLIGHT.boost;
    jingleBus.connect(sfxBus);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const noise = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noise.length; i += 1) noise[i] = Math.random() * 2 - 1;

    // Echo: a dotted-eighth delay, darkened a little on every repeat.
    echoSend = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const darken = ctx.createBiquadFilter();
    darken.type = 'lowpass';
    darken.frequency.value = 2800;
    songEcho = ctx.createGain();
    songEcho.connect(echoSend);
    echoSend.connect(delay);
    delay.connect(darken);
    darken.connect(feedback);
    feedback.connect(delay);
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.5;
    darken.connect(echoOut);
    echoOut.connect(musicBus);

    // Reverb: a convolver with a generated, exponentially decaying stereo noise tail.
    reverbSend = ctx.createGain();
    const reverb = ctx.createConvolver();
    const length = Math.floor(ctx.sampleRate * 1.8);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
    reverb.buffer = impulse;
    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.45;
    songVerb = ctx.createGain();
    songVerb.connect(reverbSend);
    reverbSend.connect(reverb);
    reverb.connect(reverbOut);
    reverbOut.connect(musicBus);
    // The jingles share the reverb, so they sit in the same space as the song.
    const sfxVerb = ctx.createGain();
    sfxVerb.gain.value = 0.25;
    sfxBus.connect(sfxVerb);
    sfxVerb.connect(reverbSend);
    const stingVerb = ctx.createGain();
    stingVerb.gain.value = 0.6;
    stingBus.connect(stingVerb);
    stingVerb.connect(reverbSend);

    applyVolumes(true);
    return true;
  };

  const applyVolumes = (now = false) => {
    if (!ctx) return;
    const t = ctx.currentTime;
    const value = muted ? 0 : masterLevel;
    if (now) master.gain.setValueAtTime(value, t);
    else master.gain.setTargetAtTime(value, t, 0.08);
    musicVolume.gain.setTargetAtTime(musicLevel, t, 0.08);
  };

  // ---- small building blocks ---------------------------------------------------------------------------
  const noiseSource = (t, duration) => {
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    source.start(t, Math.random() * 1.5, duration + 0.05);
    return source;
  };
  const filter = (type, frequency, q = 0.7) => {
    const node = ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = frequency;
    node.Q.value = q;
    return node;
  };
  // A gain with a quick attack and an exponential fall to silence over `decay` seconds.
  const envelope = (t, peak, decay, attack = 0.003) => {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return gain;
  };
  const chain = (...nodes) => {
    for (let i = 0; i < nodes.length - 1; i += 1) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
  };
  const tone = (t, type, frequency, duration) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    osc.start(t);
    osc.stop(t + duration + 0.05);
    return osc;
  };

  // ---- drums -------------------------------------------------------------------------------------------
  const kick = (t) => {
    const osc = tone(t, 'sine', 160, 0.45);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    chain(osc, envelope(t, 1, 0.42), songDry);
    chain(noiseSource(t, 0.02), filter('highpass', 3000), envelope(t, 0.25, 0.015), songDry);
    // Pump: pads and bass dip on the kick and swell back before the next one.
    pumpBus.gain.cancelScheduledValues(t);
    pumpBus.gain.setValueAtTime(0.3, t);
    pumpBus.gain.linearRampToValueAtTime(1, t + STEP * 3);
  };
  const clap = (t, level = 0.55) => {
    const body = chain(noiseSource(t, 0.2), filter('bandpass', 1700, 0.9), envelope(t, level, 0.17), songDry);
    body.connect(songVerb);
    chain(tone(t, 'triangle', 190, 0.1), envelope(t, level * 0.5, 0.07), songDry);
  };
  const hat = (t, open, level) => {
    chain(noiseSource(t, open ? 0.25 : 0.05), filter('highpass', 7500), envelope(t, level, open ? 0.2 : 0.035), songDry);
  };
  const crash = (t) => {
    const out = chain(noiseSource(t, 1.6), filter('highpass', 4500), envelope(t, 0.16, 1.5), songDry);
    out.connect(songVerb);
  };
  const riser = (t, duration) => {
    const sweep = filter('bandpass', 300, 2.5);
    sweep.frequency.setValueAtTime(300, t);
    sweep.frequency.exponentialRampToValueAtTime(7000, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.22, t + duration);
    gain.gain.linearRampToValueAtTime(0, t + duration + 0.02);
    chain(noiseSource(t, duration), sweep, gain, songDry).connect(songVerb);
  };

  // ---- instruments -------------------------------------------------------------------------------------
  const bass = (t, midi, duration) => {
    const osc = tone(t, 'sawtooth', hz(midi), duration);
    const sub = tone(t, 'sine', hz(midi - 12), duration);
    const lp = filter('lowpass', 1500, 4);
    lp.frequency.setValueAtTime(1500, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + duration);
    const env = envelope(t, 0.4, duration);
    osc.connect(lp);
    chain(sub, envelope(t, 0.35, duration), pumpBus);
    chain(lp, env, pumpBus);
  };
  const pad = (t, midis, duration) => {
    const lp = filter('lowpass', 1100, 0.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.07, t + 0.25);
    gain.gain.setValueAtTime(0.07, t + duration - 0.1);
    gain.gain.linearRampToValueAtTime(0.0001, t + duration + 0.3);
    for (const midi of midis) {
      for (const detune of [-12, 12]) {
        const osc = tone(t, 'sawtooth', hz(midi), duration + 0.3);
        osc.detune.value = detune;
        osc.connect(lp);
      }
    }
    chain(lp, gain, pumpBus);
    gain.connect(songVerb);
  };
  const arp = (t, midi, level = 0.07) => {
    const out = chain(tone(t, 'square', hz(midi), 0.15), filter('lowpass', 2600), envelope(t, level, 0.13), songDry);
    out.connect(songEcho);
  };
  const lead = (t, midi, duration) => {
    const lp = filter('lowpass', 3200, 1.5);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.13, t + 0.012);
    gain.gain.linearRampToValueAtTime(0.09, t + 0.12);
    gain.gain.setValueAtTime(0.09, t + duration);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.18);
    const vibrato = tone(t, 'sine', 5.5, duration + 0.2);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(14, t + Math.min(duration, 0.4)); // vibrato swells in on long notes
    vibrato.connect(depth);
    // Two detuned saws, plus a quieter square an octave up for shine.
    for (const [type, detune, level] of [['sawtooth', -8, 1], ['sawtooth', 8, 1], ['square', 1200, 0.25]]) {
      const osc = tone(t, type, hz(midi), duration + 0.2);
      osc.detune.value = detune;
      depth.connect(osc.detune);
      const mix = ctx.createGain();
      mix.gain.value = level;
      chain(osc, mix, lp);
    }
    chain(lp, gain, songDry);
    gain.connect(songEcho);
    gain.connect(songVerb);
  };
  const bell = (t, midi, duration, level = 0.16, out = songDry) => {
    const gain = envelope(t, level, duration + 0.6, 0.004);
    chain(tone(t, 'sine', hz(midi), duration + 0.7), gain);
    chain(tone(t, 'triangle', hz(midi + 12), duration + 0.4), envelope(t, level * 0.35, duration * 0.6 + 0.2), gain);
    gain.connect(out);
    if (out === songDry) {
      gain.connect(songEcho);
      gain.connect(songVerb);
    }
  };

  // ---- the sequencer -----------------------------------------------------------------------------------
  let sectionList = INTRO;
  let sectionIndex = 0;
  let bar = 0;
  let step = 0;
  let nextStepTime = 0;
  let timer = null;
  let songPlaying = true;

  const playStep = (t) => {
    const section = SECTIONS[sectionList[sectionIndex]];
    const chord = CHORDS[section.chords[bar]];
    const lastBar = bar === section.chords.length - 1;

    if (section.drums === 'full') {
      if (step % 4 === 0) kick(t);
      if (step === 4 || step === 12) clap(t);
      if (section.fill && lastBar && step >= 12) clap(t, 0.25 + (step - 12) * 0.1);
      hat(t, step % 4 === 2, step % 4 === 2 ? 0.1 : 0.04);
    } else if (section.drums === 'hats') {
      if (step % 4 === 2) hat(t, true, 0.07);
    }
    if (section.crash && bar === 0 && step === 0) crash(t);
    if (section.riser && lastBar && step === 0) riser(t, STEP * 16);
    if (section.pad && step === 0) pad(t, chord.tones, STEP * 16);
    if (section.bass && step % 2 === 0) bass(t, chord.bass + (step % 4 === 0 ? 12 : 24), STEP * 1.8);
    if (section.arp) {
      const notes = [...chord.tones, chord.tones[0] + 12, chord.tones[1] + 12].map((n) => n + 12);
      arp(t, notes[ARP_PATTERN[step]], section.drums === 'full' ? 0.055 : 0.07);
    }
    if (section.melody) {
      for (const [noteBar, noteStep, midi, len] of section.melody) {
        if (noteBar !== bar || noteStep !== step) continue;
        if (section.voice === 'bell') bell(t, midi, len * STEP);
        else lead(t, midi, len * STEP * 0.92);
      }
    }
  };

  const advance = () => {
    step += 1;
    if (step < 16) return;
    step = 0;
    bar += 1;
    if (bar < SECTIONS[sectionList[sectionIndex]].chords.length) return;
    bar = 0;
    sectionIndex += 1;
    if (sectionIndex >= sectionList.length) {
      sectionList = LOOP;
      sectionIndex = 0;
    }
  };

  const tick = () => {
    if (!ctx || ctx.state !== 'running') return;
    // A throttled background tab can fall far behind; skip ahead rather than play the backlog all at once.
    if (nextStepTime < ctx.currentTime - 0.1) nextStepTime = ctx.currentTime + 0.05;
    while (nextStepTime < ctx.currentTime + LOOKAHEAD) {
      if (songPlaying) playStep(nextStepTime);
      advance();
      nextStepTime += STEP;
    }
    updateEngineParams();
    updateWaveParams();
  };

  const fadeSong = (value, timeConstant) => {
    const t = ctx.currentTime;
    for (const node of [songDry, songEcho, songVerb]) {
      node.gain.cancelScheduledValues(t);
      node.gain.setTargetAtTime(value, t, timeConstant);
    }
  };
  // Back to the top of the song (the soft intro that builds into the hook), as if the game had just begun.
  const restartSong = () => {
    sectionList = INTRO;
    sectionIndex = 0;
    bar = 0;
    step = 0;
    nextStepTime = ctx.currentTime + 0.25;
    songPlaying = true;
    fadeSong(1, 0.05);
  };

  const startMusic = () => {
    if (timer) return;
    nextStepTime = ctx.currentTime + 0.1;
    timer = window.setInterval(tick, TICK_MS);
  };

  // ---- engine ------------------------------------------------------------------------------------------
  let engine = null;
  let engineBike = 'bike_scooter';
  let engineType = ENGINES.scooter;
  let enginePitch = 1;
  let rpm = 0; // smoothed 0..1
  let targetRpm = 0;
  let engineOn = false;
  let revBoost = 0; // a burst of revs when a bike is equipped, fading out
  let lastEngineUpdate = 0;
  let airborne = false;
  // A real engine is never perfectly steady: the pitch and tone wander a little (a smoothed random walk toward
  // a new target every second or so). And when the rider holds one speed, the ear tunes the engine out, so it
  // does the same: after STEADY_AFTER seconds at a steady throttle it eases down to STEADY_LEVEL, coming back
  // the moment the throttle changes (a turn, a jump, a slope, stopping).
  let wander = 0;
  let wanderGoal = 0;
  let nextWander = 0;
  let cruiseRpm = 0; // a slow follower of the revs; the gap to it says whether they are changing
  let steadyFor = 0;
  const STEADY_AFTER = 1.5;
  const STEADY_FADE = 3; // seconds it takes to ease all the way down
  const STEADY_LEVEL = 0.45;

  const buildEngine = () => {
    const main = ctx.createOscillator();
    const second = ctx.createOscillator();
    second.type = 'square';
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    const secondGain = ctx.createGain();
    const subGain = ctx.createGain();
    const shaper = ctx.createWaveShaper();
    // Two gentle low-passes in a row (a 24 dB slope) take off the harsh top end.
    const lp = filter('lowpass', 600, 0.9);
    const lp2 = filter('lowpass', 600, 0.6);
    const air = ctx.createBufferSource();
    air.buffer = noiseBuffer;
    air.loop = true;
    air.start();
    const airFilter = filter('lowpass', 500, 0.5);
    const airGain = ctx.createGain();
    // The firing pulse: a low oscillator wobbling the volume ("putt-putt").
    const lumpOsc = ctx.createOscillator();
    const lumpDepth = ctx.createGain();
    const lumpGain = ctx.createGain();
    const out = ctx.createGain();
    out.gain.value = 0;

    main.connect(shaper);
    second.connect(secondGain).connect(shaper);
    shaper.connect(lp).connect(lp2).connect(lumpGain);
    sub.connect(subGain).connect(lumpGain);
    lumpOsc.connect(lumpDepth).connect(lumpGain.gain);
    lumpGain.connect(out);
    air.connect(airFilter).connect(airGain).connect(out);
    out.connect(engineBus);
    for (const osc of [main, second, sub, lumpOsc]) osc.start();
    engine = { main, second, secondGain, sub, subGain, shaper, lp, lp2, airFilter, airGain, lumpOsc, lumpDepth, lumpGain, out };
    applyEngineType();
  };

  const applyEngineType = () => {
    if (!engine) return;
    engine.main.type = engineType.wave;
    engine.secondGain.gain.value = engineType.buzz;
    engine.subGain.gain.value = engineType.sub;
    engine.shaper.curve = distortionCurve(engineType.drive);
    engine.lumpDepth.gain.value = engineType.lump * 0.5;
    engine.lumpGain.gain.value = 1 - engineType.lump * 0.5;
  };

  function updateEngineParams() {
    if (!engine) return;
    const now = ctx.currentTime;
    if (now - lastEngineUpdate < 0.03) return;
    const dt = Math.min(0.2, now - lastEngineUpdate);
    lastEngineUpdate = now;
    // Revs climb fast and fall back more slowly, like a throttle let go.
    const goal = Math.min(1, Math.max(targetRpm, revBoost));
    rpm += (goal - rpm) * (1 - Math.exp(-(goal > rpm ? 7 : 3) * dt));
    revBoost = Math.max(0, revBoost - dt * 0.9);
    if (now >= nextWander) {
      wanderGoal = Math.random() * 2 - 1;
      nextWander = now + 0.7 + Math.random() * 1.1;
    }
    wander += (wanderGoal - wander) * (1 - Math.exp(-1.5 * dt));
    cruiseRpm += (rpm - cruiseRpm) * (1 - Math.exp(-0.8 * dt));
    if (Math.abs(rpm - cruiseRpm) > 0.06 || airborne) steadyFor = 0;
    else steadyFor += dt;
    const settle = 1 - (1 - STEADY_LEVEL) * Math.min(1, Math.max(0, (steadyFor - STEADY_AFTER) / STEADY_FADE));
    // In the air the rear wheel spins free: the revs flare up and the sound thins out.
    const revs = Math.min(1, rpm + (airborne ? 0.12 : 0));
    const { idle, max, cut, level } = engineType;
    const frequency = (idle + (max - idle) * revs ** 0.85) * enginePitch * (1 + 0.035 * wander);
    const cutoff = (cut[0] + (cut[1] - cut[0]) * revs) * (1 + 0.15 * wander) * (airborne ? 0.8 : 1);
    engine.main.frequency.setTargetAtTime(frequency, now, 0.05);
    engine.second.frequency.setTargetAtTime(frequency * 1.008, now, 0.05);
    engine.sub.frequency.setTargetAtTime(frequency * 0.5, now, 0.05);
    engine.lumpOsc.frequency.setTargetAtTime(frequency * engineType.lumpRatio, now, 0.05);
    engine.lp.frequency.setTargetAtTime(cutoff, now, 0.05);
    engine.lp2.frequency.setTargetAtTime(cutoff * 1.3, now, 0.05);
    engine.airFilter.frequency.setTargetAtTime(350 + rpm * 900, now, 0.08);
    engine.airGain.gain.setTargetAtTime(engineType.air * rpm * rpm, now, 0.08);
    // Almost silent while standing still; it swells with the revs.
    const volume = engineOn ? level * (0.2 + 0.8 * rpm) * settle * (airborne ? 0.75 : 1) : 0;
    engine.out.gain.setTargetAtTime(volume, now, engineOn ? 0.08 : 0.15);
  }

  // ---- the approaching wave ---------------------------------------------------------------------------
  // A deep roar (low-passed noise) that opens up and grows as a wave closes in, with the hiss of breaking
  // foam on top once it is near, and a slow surge so it rolls rather than drones.
  let waves = null;
  let waveTarget = 0;
  let waveLevel = 0;
  let lastWaveUpdate = 0;
  const buildWaves = () => {
    const loop = (offset) => {
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;
      source.start(ctx.currentTime, offset);
      return source;
    };
    const roarFilter = filter('lowpass', 250, 0.6);
    const roarGain = ctx.createGain();
    roarGain.gain.value = 0;
    const hissFilter = filter('bandpass', 2400, 0.8);
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0;
    const surge = ctx.createGain();
    surge.gain.value = 0.8;
    const surgeOsc = ctx.createOscillator();
    surgeOsc.frequency.value = 0.23;
    const surgeDepth = ctx.createGain();
    surgeDepth.gain.value = 0.2;
    surgeOsc.connect(surgeDepth).connect(surge.gain);
    surgeOsc.start();
    loop(0).connect(roarFilter).connect(roarGain).connect(surge);
    loop(0.9).connect(hissFilter).connect(hissGain).connect(surge);
    surge.connect(waveBus);
    waves = { roarFilter, roarGain, hissFilter, hissGain };
  };
  function updateWaveParams() {
    if (!waves) return;
    const now = ctx.currentTime;
    if (now - lastWaveUpdate < 0.04) return;
    lastWaveUpdate = now;
    waveLevel = waveTarget;
    const p = waveLevel;
    waves.roarGain.gain.setTargetAtTime(0.9 * p ** 1.6, now, 0.12);
    waves.roarFilter.frequency.setTargetAtTime(220 + 1500 * p * p, now, 0.12);
    waves.hissGain.gain.setTargetAtTime(0.32 * p ** 3, now, 0.12);
    waves.hissFilter.frequency.setTargetAtTime(1800 + 1400 * p, now, 0.12);
  }

  // ---- unlocking, visibility -----------------------------------------------------------------------------
  const unlock = () => {
    if (disposed) return;
    if (!ctx && !build()) return;
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume();
    if (!engine) buildEngine();
    if (!waves) buildWaves();
    startMusic();
  };
  const unlockEvents = ['pointerdown', 'keydown', 'touchstart'];
  unlockEvents.forEach((name) => window.addEventListener(name, unlock, { passive: true, capture: true }));
  // Silence everything while the tab is in the background.
  const onVisibility = () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else ctx.resume();
  };
  document.addEventListener('visibilitychange', onVisibility);

  const ready = () => ctx && ctx.state === 'running';
  // Ducks the song, engine and waves for `seconds`, then lets them glide back.
  const spotlight = (seconds) => {
    const t = ctx.currentTime;
    for (const [node, amount] of [[musicDuck, SPOTLIGHT.music], [bedDuck, SPOTLIGHT.bed]]) {
      node.gain.cancelScheduledValues(t);
      node.gain.setTargetAtTime(amount, t, 0.05);
      node.gain.setTargetAtTime(1, t + seconds, 0.4);
    }
  };
  const sparkle = (t, count, spread, level = 0.05, out = sfxBus) => {
    for (let i = 0; i < count; i += 1) {
      const when = t + Math.random() * spread;
      chain(tone(when, 'sine', 2200 + Math.random() * 3800, 0.2), envelope(when, level, 0.18), out);
    }
  };
  const whoosh = (t, from, to, duration, level, out = sfxBus) => {
    const sweep = filter('bandpass', from, 1.8);
    sweep.frequency.setValueAtTime(from, t);
    sweep.frequency.exponentialRampToValueAtTime(to, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + duration * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    chain(noiseSource(t, duration), sweep, gain, out);
  };

  let lastLevelUp = 0;
  let lastClick = 0;
  let onTrack = false;

  return {
    /** Level up: a bright rising fanfare over a sparkling chord, with the song ducked under it. */
    playLevelUp() {
      if (!ready()) return;
      const t = ctx.currentTime + 0.02;
      if (t - lastLevelUp < 0.8) return; // a big grant can level up many times in a row: one fanfare
      lastLevelUp = t;
      spotlight(1.5);
      whoosh(t, 400, 6000, 0.35, 0.18, jingleBus);
      [72, 76, 79, 84].forEach((midi, i) => {
        const when = t + i * 0.075;
        bell(when, midi, 0.15, 0.22, jingleBus);
        chain(tone(when, 'square', hz(midi), 0.14), filter('lowpass', 3500), envelope(when, 0.07, 0.12), jingleBus);
      });
      const chordAt = t + 0.32;
      for (const midi of [84, 88, 91, 96]) bell(chordAt, midi, 0.9, 0.12, jingleBus);
      for (const detune of [-10, 10]) {
        const osc = tone(chordAt, 'sawtooth', hz(72), 1.2);
        osc.detune.value = detune;
        chain(osc, filter('lowpass', 2400), envelope(chordAt, 0.06, 1.1, 0.02), jingleBus);
      }
      const boom = tone(chordAt, 'sine', 110, 0.6);
      boom.frequency.exponentialRampToValueAtTime(45, chordAt + 0.4);
      chain(boom, envelope(chordAt, 0.4, 0.5), jingleBus);
      sparkle(chordAt, 10, 0.8, 0.05, jingleBus);
    },

    /** Equipping a bike: a whoosh, a metallic "shing", and the new engine revving up. */
    playBikeChange(bikeId) {
      if (!ready()) return;
      const t = ctx.currentTime + 0.02;
      spotlight(1.1);
      whoosh(t, 3000, 250, 0.4, 0.22, jingleBus);
      const thunk = tone(t + 0.12, 'sine', 140, 0.25);
      thunk.frequency.exponentialRampToValueAtTime(55, t + 0.3);
      chain(thunk, envelope(t + 0.12, 0.35, 0.22), jingleBus);
      [[88, 0.18], [95, 0.26]].forEach(([midi, offset]) => {
        bell(t + offset, midi, 0.25, 0.14, jingleBus);
        chain(tone(t + offset, 'square', hz(midi), 0.1), filter('highpass', 2000), envelope(t + offset, 0.04, 0.08), jingleBus);
      });
      sparkle(t + 0.25, 5, 0.3, 0.035, jingleBus);
      this.setBike(bikeId);
      revBoost = 1;
    },

    /** Trophy collected: a two-note coin chime with sparkles. */
    playWin() {
      if (!ready()) return;
      const t = ctx.currentTime + 0.02;
      spotlight(1.1);
      [[83, 0], [88, 0.08]].forEach(([midi, offset]) => {
        chain(tone(t + offset, 'square', hz(midi), 0.3), filter('lowpass', 4000), envelope(t + offset, 0.09, offset ? 0.35 : 0.08), jingleBus);
        bell(t + offset, midi, 0.3, 0.12, jingleBus);
      });
      sparkle(t + 0.1, 8, 0.5, 0.04, jingleBus);
    },

    /**
     * Caught by the tsunami. No crash: the song fades away, the water washes softly over, and a gentle
     * music-box tune plays over warm chords while the wreck settles (about five seconds, the length of the
     * wipeout), ending on a hopeful lift that leads into playRespawn.
     */
    playWipeout() {
      if (!ready()) return;
      const t = ctx.currentTime + 0.03;
      songPlaying = false;
      fadeSong(0.0001, 0.18);
      // The wash: swells in over half a second instead of hitting at once, then drains away.
      const wash = filter('lowpass', 1600, 0.5);
      wash.frequency.setValueAtTime(1600, t);
      wash.frequency.exponentialRampToValueAtTime(300, t + 2.6);
      chain(noiseSource(t, 2.8), wash, envelope(t, 0.16, 2.2, 0.5), sfxBus);
      const thump = tone(t, 'sine', 75, 0.5);
      thump.frequency.exponentialRampToValueAtTime(40, t + 0.4);
      chain(thump, filter('lowpass', 200), envelope(t, 0.14, 0.45, 0.03), sfxBus);

      // Warm pads: Fmaj7 - Em7 - Dm7 - Gsus4 - G.
      const chords = [
        [0, 1.6, [53, 57, 60, 64]],
        [1.6, 1.4, [52, 55, 59, 62]],
        [3.0, 1.2, [50, 53, 57, 60]],
        [4.2, 0.5, [55, 60, 62]],
        [4.7, 0.6, [55, 59, 62]],
      ];
      for (const [start, length, notes] of chords) {
        const when = t + start;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.linearRampToValueAtTime(0.06, when + 0.35);
        gain.gain.setValueAtTime(0.06, when + length);
        gain.gain.linearRampToValueAtTime(0.0001, when + length + 0.5);
        const lp = filter('lowpass', 900, 0.5);
        for (const midi of notes) {
          chain(tone(when, 'triangle', hz(midi), length + 0.55), lp);
          const osc = tone(when, 'sawtooth', hz(midi), length + 0.55);
          osc.detune.value = 6;
          const soft = ctx.createGain();
          soft.gain.value = 0.25;
          chain(osc, soft, lp);
        }
        chain(lp, gain, stingBus);
      }
      // The music box: drifts down, then climbs back up toward the fresh start.
      const melody = [[0.35, 81], [0.75, 79], [1.15, 76], [1.75, 79], [2.15, 76], [2.55, 74], [3.15, 77], [3.55, 76], [3.95, 72], [4.45, 74], [4.85, 79]];
      for (const [start, midi] of melody) bell(t + start, midi, 0.5, 0.11, stingBus);
    },

    /**
     * The rider is back at the start: a rising shimmer and a bright chime, and the song starts over from its
     * intro, so every run after a wipeout feels like a fresh beginning.
     */
    playRespawn() {
      if (!ready()) return;
      const t = ctx.currentTime + 0.02;
      whoosh(t, 300, 5000, 0.6, 0.12);
      [72, 76, 79, 84].forEach((midi, i) => bell(t + 0.1 + i * 0.09, midi, 0.35, 0.12, sfxBus));
      sparkle(t + 0.4, 8, 0.6, 0.035);
      restartSong();
    },

    /**
     * How close the nearest wave is, 0 (none near) to 1 (about to hit). Called every frame; the roar follows
     * smoothly.
     */
    updateWaves(closeness) {
      waveTarget = Math.max(0, Math.min(1, closeness));
    },

    /**
     * Pressing a button: a water drop falling into water, a "bloop" sweeping quickly upward, with a smaller
     * drop just after. Each press is pitched a little differently so repeated clicks never sound mechanical.
     */
    playClick() {
      if (!ready()) return;
      const t = ctx.currentTime + 0.005;
      if (t - lastClick < 0.04) return;
      lastClick = t;
      const pitch = 0.88 + Math.random() * 0.24;
      const drop = (when, from, to, level, length) => {
        const osc = tone(when, 'sine', from * pitch, length + 0.02);
        osc.frequency.exponentialRampToValueAtTime(to * pitch, when + length * 0.55);
        chain(osc, envelope(when, level, length, 0.002), sfxBus);
      };
      drop(t, 380, 1500, 0.32, 0.09);
      drop(t + 0.07, 700, 2100, 0.08, 0.06);
      // A faint splash of high noise at the moment of impact.
      chain(noiseSource(t, 0.03), filter('bandpass', 3500, 2), envelope(t, 0.03, 0.025, 0.001), sfxBus);
    },

    /** true while the rider is out on the wave track: the engine comes forward and the song steps back. */
    setOnTrack(value) {
      if (value === onTrack) return;
      onTrack = value;
      if (!ctx) return;
      const mix = onTrack ? MIX.track : MIX.start;
      musicBus.gain.setTargetAtTime(mix.music, ctx.currentTime, MIX_TIME);
      engineBus.gain.setTargetAtTime(mix.engine, ctx.currentTime, MIX_TIME);
      waveBus.gain.setTargetAtTime(mix.waves, ctx.currentTime, MIX_TIME);
    },

    /** Switches the engine to `bikeId`'s sound (no jingle; see playBikeChange). */
    setBike(bikeId) {
      engineBike = bikeId;
      engineType = ENGINES[ENGINE_FOR_BIKE[bikeId]] ?? ENGINES.sport;
      enginePitch = PITCH_FOR_BIKE[bikeId] ?? 1;
      applyEngineType();
    },

    /**
     * Called every frame. `throttle` is 0..1: how hard the engine is working (the rider's speed against the
     * bike's top speed, or the training board's pull). `running` false lets the engine fall silent;
     * `grounded` false (mid-jump) lets the revs flare.
     */
    updateEngine(throttle, running = true, grounded = true) {
      targetRpm = Math.max(0, Math.min(1, throttle));
      engineOn = running;
      airborne = running && !grounded;
      if (ready() && !timer) startMusic();
    },

    /** Portal volume settings, 0..1. */
    setMasterVolume(value) {
      masterLevel = Math.max(0, Math.min(1, value));
      applyVolumes();
    },
    setMusicVolume(value) {
      musicLevel = Math.max(0, Math.min(1, value));
      applyVolumes();
    },

    isMuted: () => muted,
    setMuted(value) {
      muted = Boolean(value);
      try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* storage may be blocked */ }
      if (!muted) unlock();
      applyVolumes();
      mutedListeners.forEach((listener) => listener(muted));
    },
    toggleMuted() { this.setMuted(!muted); },
    /** listener(muted) on every change; returns the unsubscribe. */
    onMutedChange(listener) {
      mutedListeners.add(listener);
      return () => mutedListeners.delete(listener);
    },

    get bikeId() { return engineBike; },

    dispose() {
      disposed = true;
      unlockEvents.forEach((name) => window.removeEventListener(name, unlock, true));
      document.removeEventListener('visibilitychange', onVisibility);
      if (timer) window.clearInterval(timer);
      timer = null;
      ctx?.close();
      ctx = null;
      engine = null;
      waves = null;
      mutedListeners.clear();
    },
  };
}

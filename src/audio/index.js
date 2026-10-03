// AUDIO ENGINE. Owner: Person 3. Uses Tone.js (loaded as the global `Tone` in index.html).
// Exports (keep these names): init, loadProject, play, stop, setBpm, playNote, getBeat, addClip,
//   updateClip, previewClip, onNote, getSpectrum, TONES
import { DRUM_PITCH } from "../shared/contracts.js";

const T = () => window.Tone;
let inst = null;
let started = false;
let scheduled = [];
let fft = null, wave = null;
const noteListeners = [];
const clips = new Map();      // id -> { player, chain, opts }

// Voice-clip "tones": free effect chains applied in the app (no extra ElevenLabs credit).
export const TONES = {
  clean:   { label: "Clean" },
  stadium: { label: "Stadium" },
  echo:    { label: "Echo" },
  radio:   { label: "Radio" },
  robot:   { label: "Robot" },
  lofi:    { label: "Lo-fi" },
  phone:   { label: "Phone" },
  chorus:  { label: "Choir" },
};

function makeInstruments() {
  const Tone = T();
  const reverb = new Tone.Reverb({ decay: 3, wet: 0.3 }).toDestination();
  return {
    keys: new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.005, release: 0.3 } }).toDestination(),
    lead: new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sawtooth" }, envelope: { attack: 0.01, release: 0.2 }, volume: -10 }).connect(reverb),
    pluck: new Tone.PolySynth(Tone.Synth, { oscillator: { type: "square" }, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 }, volume: -12 }).connect(reverb),
    pad: new Tone.PolySynth(Tone.Synth, { oscillator: { type: "fatsawtooth", count: 3, spread: 30 }, envelope: { attack: 0.4, release: 1.5 }, volume: -18 }).connect(reverb),
    // Bass is a PolySynth of MonoSynths so overlapping notes from the AI never collide.
    bass: new Tone.PolySynth(Tone.MonoSynth, { oscillator: { type: "square" }, filter: { Q: 2, type: "lowpass" }, filterEnvelope: { attack: 0.01, decay: 0.2, baseFrequency: 120, octaves: 2.5 }, volume: -8 }).toDestination(),
    kick: new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 6, volume: -2 }).toDestination(),
    snare: new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.18, sustain: 0 }, volume: -10 }).toDestination(),
    hat: new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.05, release: 0.01 }, harmonicity: 5.1, resonance: 4000, volume: -26 }).toDestination(),
  };
}

/** Call once from a user click (browsers need a gesture before audio can start). */
export async function init() {
  if (started) return;
  await T().start();
  inst = makeInstruments();
  fft = new (T().FFT)(64);
  wave = new (T().Waveform)(256);
  T().getDestination().connect(fft);
  T().getDestination().connect(wave);
  started = true;
}

// One-voice drums crash if hit twice at the same instant, so nudge repeat hits forward a hair.
const lastHit = {};
function safeTime(name, time) {
  const t = lastHit[name] !== undefined && time <= lastHit[name] ? lastHit[name] + 0.002 : time;
  lastHit[name] = t;
  return t;
}

function trigger(type, pitch, dur, time, vel) {
  try {
    if (type === "drums") {
      if (pitch === DRUM_PITCH.kick) inst.kick.triggerAttackRelease("C1", "8n", safeTime("kick", time), vel);
      else if (pitch === DRUM_PITCH.snare || pitch === DRUM_PITCH.clap) inst.snare.triggerAttackRelease("16n", safeTime("snare", time), vel);
      else inst.hat.triggerAttackRelease("32n", safeTime("hat", time), vel);
    } else {
      (inst[type] || inst.keys).triggerAttackRelease(T().Frequency(pitch, "midi").toFrequency(), dur, time, vel);
    }
  } catch (e) {
    console.warn("[audio] skipped a note:", e.message);
  }
  // Tell listeners (visuals) exactly when the note is heard.
  if (noteListeners.length) T().Draw.schedule(() => noteListeners.forEach((fn) => fn({ type, pitch, vel })), time);
}

const ticks = (beats) => `${Math.round(beats * T().Transport.PPQ)}i`;

/** Schedule every track's notes. Call again whenever the project changes. @param {import("../shared/contracts.js").Project} project */
export function loadProject(project) {
  if (!started) return;
  const tr = T().Transport;
  scheduled.forEach((id) => tr.clear(id));
  scheduled = [];
  tr.bpm.value = project.bpm;
  tr.loop = true;
  tr.loopStart = 0;
  tr.loopEnd = `${project.bars}m`;
  for (const track of project.tracks) {
    if (track.muted) continue;
    for (const note of track.notes) {
      scheduled.push(tr.schedule((time) => trigger(track.type, note.pitch, ticks(note.dur), time, note.vel ?? 0.8), ticks(note.start)));
    }
  }
}

export function play() { if (started) T().Transport.start(); }
export function stop() { if (started) { T().Transport.stop(); T().Transport.position = 0; } }
export function setBpm(bpm) { if (started) T().Transport.bpm.value = bpm; }

/** Play one note now (live keyboard). */
export function playNote(pitch, type = "keys") {
  if (!started) return;
  trigger(type, pitch, "8n", T().now(), 0.9);
}

/** Current playhead position in beats (0 when stopped). */
export function getBeat() {
  if (!started) return 0;
  return T().Transport.ticks / T().Transport.PPQ;
}

/** Listen for every note as it's heard: fn({type, pitch, vel}). */
export function onNote(fn) { noteListeners.push(fn); }

/** Live audio data for visuals: { bins: Float32Array (dB, 64 bands), wave: Float32Array (-1..1) } or null. */
export function getSpectrum() {
  if (!started) return null;
  return { bins: fft.getValue(), wave: wave.getValue() };
}

// ---------- Voice clips: pitch + tone ----------
function buildChain(opts) {
  const Tone = T();
  const nodes = [new Tone.PitchShift({ pitch: Number(opts.pitch) || 0, windowSize: 0.08 })];
  switch (opts.tone) {
    case "stadium": nodes.push(new Tone.Reverb({ decay: 6, wet: 0.55 })); break;
    case "echo":    nodes.push(new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.45, wet: 0.45 })); break;
    case "radio":   nodes.push(new Tone.Filter({ type: "bandpass", frequency: 1800, Q: 1.2 }), new Tone.Distortion(0.3)); break;
    case "robot":   nodes.push(new Tone.Chebyshev(24), new Tone.Chorus({ frequency: 30, delayTime: 2, depth: 0.9, wet: 0.6 }).start()); break;
    case "lofi":    nodes.push(new Tone.Filter({ type: "lowpass", frequency: 2200 }), new Tone.Vibrato({ frequency: 1.5, depth: 0.08 })); break;
    case "phone":   nodes.push(new Tone.Filter({ type: "highpass", frequency: 500 }), new Tone.Filter({ type: "lowpass", frequency: 3000 })); break;
    case "chorus":  nodes.push(new Tone.Chorus({ frequency: 1.5, delayTime: 4, depth: 0.7, wet: 0.7 }).start(), new Tone.Reverb({ decay: 4, wet: 0.4 })); break;
  }
  const vol = new Tone.Volume(Number(opts.volume) || 0);
  nodes.push(vol);
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  vol.toDestination();
  return nodes;
}

async function loadPlayer(url) {
  const player = new (T().Player)();
  await player.load(url);              // wait for the audio before scheduling (fixes "buffer not loaded")
  return player;
}

/**
 * Put an audio sample (e.g. a vocal clip) on the timeline.
 * @param {string} url @param {number} startBeat
 * @param {{pitch?:number, tone?:string, volume?:number}} [opts] pitch in semitones (-12..12), tone = a TONES key
 * @returns {Promise<string>} clip id, for updateClip()
 */
export async function addClip(url, startBeat, opts = {}) {
  if (!started || !url) return "";
  const id = Math.random().toString(36).slice(2);
  const player = await loadPlayer(url);
  const chain = buildChain(opts);
  player.connect(chain[0]);
  player.sync().start(ticks(startBeat));
  clips.set(id, { player, chain, opts: { ...opts }, startBeat });
  return id;
}

/** Change a clip's pitch / tone after it's been added. */
export function updateClip(id, opts) {
  const c = clips.get(id);
  if (!c) return;
  c.opts = { ...c.opts, ...opts };
  c.player.disconnect();
  c.chain.forEach((n) => n.dispose());
  c.chain = buildChain(c.opts);
  c.player.connect(c.chain[0]);
}

/** Play a clip right now with the given pitch / tone (for auditioning in the panel). */
let preview = null;
export async function previewClip(url, opts = {}) {
  if (!started || !url) return;
  if (preview) { try { preview.player.stop(); } catch {} preview.player.dispose(); preview.chain.forEach((n) => n.dispose()); }
  const player = await loadPlayer(url);
  const chain = buildChain(opts);
  player.connect(chain[0]);
  player.start();
  preview = { player, chain };
}

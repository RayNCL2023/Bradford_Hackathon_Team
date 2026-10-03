// AUDIO ENGINE. Owner: Person 3. Uses Tone.js (loaded as the global `Tone` in index.html).
// Exports (keep these names): init, loadProject, play, stop, setBpm, playNote, getBeat, addClip
// Starter version: basic synths and scheduling. Improve the sounds, add mixer, effects, etc.
import { DRUM_PITCH } from "../shared/contracts.js";

const T = () => window.Tone;
let instruments = null;
let started = false;
let scheduled = [];
let players = [];

function makeInstruments() {
  const Tone = T();
  const reverb = new Tone.Reverb({ decay: 3, wet: 0.3 }).toDestination();
  return {
    keys: new Tone.PolySynth(Tone.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.005, release: 0.3 } }).toDestination(),
    lead: new Tone.PolySynth(Tone.Synth, { oscillator: { type: "sawtooth" }, envelope: { attack: 0.01, release: 0.2 }, volume: -10 }).connect(reverb),
    pluck: new Tone.PolySynth(Tone.Synth, { oscillator: { type: "square" }, envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 }, volume: -12 }).connect(reverb),
    pad: new Tone.PolySynth(Tone.Synth, { oscillator: { type: "fatsawtooth", count: 3, spread: 30 }, envelope: { attack: 0.4, release: 1.5 }, volume: -18 }).connect(reverb),
    bass: new Tone.MonoSynth({ oscillator: { type: "square" }, filter: { Q: 2, type: "lowpass" }, filterEnvelope: { attack: 0.01, decay: 0.2, baseFrequency: 120, octaves: 2.5 }, volume: -8 }).toDestination(),
    kick: new Tone.MembraneSynth({ pitchDecay: 0.03, octaves: 6, volume: -2 }).toDestination(),
    snare: new Tone.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.18, sustain: 0 }, volume: -10 }).toDestination(),
    hat: new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.05, release: 0.01 }, harmonicity: 5.1, resonance: 4000, volume: -26 }).toDestination(),
  };
}

/** Call once from a user click (browsers need a gesture before audio can start). */
export async function init() {
  if (started) return;
  await T().start();
  instruments = makeInstruments();
  started = true;
}

function trigger(type, pitch, dur, time, vel) {
  const i = instruments;
  if (type === "drums") {
    if (pitch === DRUM_PITCH.kick) i.kick.triggerAttackRelease("C1", "8n", time, vel);
    else if (pitch === DRUM_PITCH.snare || pitch === DRUM_PITCH.clap) i.snare.triggerAttackRelease("16n", time, vel);
    else i.hat.triggerAttackRelease("32n", time, vel);
    return;
  }
  const synth = i[type] || i.keys;
  synth.triggerAttackRelease(T().Frequency(pitch, "midi").toFrequency(), dur, time, vel);
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

/** Put an audio sample (e.g. a vocal clip) on the timeline. @param {string} url @param {number} startBeat */
export function addClip(url, startBeat) {
  if (!started || !url) return;
  const player = new (T().Player)(url).toDestination();
  player.sync().start(ticks(startBeat));
  players.push(player);
}

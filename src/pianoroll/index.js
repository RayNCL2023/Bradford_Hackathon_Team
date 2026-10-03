// PIANO ROLL + KEYBOARD. Owner: Person 2.
// Exports (keep these names): mount, getNotes, setTracks, screenshot, setPlayhead, setMood, clear, hit, setLength,
//   setBars, setQuantize, setActive
// Edits the ACTIVE LAYER's notes (any melodic layer); every other layer is drawn behind it.
// The grid lines up with the playlist above: same 160 px left column, same bar widths.
import { TRACK_COLORS, BEATS_PER_BAR, MOODS } from "../shared/contracts.js";

const LOW = 33, HIGH = 84;           // A1..C6 (drums sit just above the bottom edge)
const ROW_H = 12;
export const GUTTER = 250;           // matches the playlist's track-name column
const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const DRUM_NAMES = { 36: "Kick", 38: "Snare", 39: "Clap", 42: "Hat", 46: "Open hat", 49: "Crash" };

// Scale lock: every key plays a note from the mood's scale, so nothing sounds wrong.
const ROW_LOW = "asdfghjkl";          // middle row walks up the scale
const ROW_HIGH = "qwertyuiop";        // top row = same, one octave higher
let mood = MOODS.dance;
let shift = 0;                        // Z / X move everything down / up an octave
let grid = 0.25;                      // record quantise in beats (0 = off)

let canvas, ctx, wrap, opts, bars = 4, stepW = 22;
let userNotes = [];
let others = [];
let activeId = "user", activeColor = TRACK_COLORS.keys;
let playhead = -1;
const held = new Set();

/** Map a key to a pitch in the current scale, or null. */
function keyToPitch(k) {
  let i = ROW_LOW.indexOf(k), up = 0;
  if (i < 0) { i = ROW_HIGH.indexOf(k); up = 12; }
  if (i < 0) return null;
  const len = mood.scale.length;
  return mood.root + shift + up + mood.scale[i % len] + 12 * Math.floor(i / len);
}

/**
 * @param {HTMLElement} el
 * @param {{ bars:number, onNoteOn:(pitch:number)=>void, isRecording:()=>boolean, getBeat:()=>number, onChange?:()=>void,
 *           intercept?:(pitch:number)=>boolean }} options  intercept: return true to take over a key press (e.g. an armed drum layer)
 */
export function mount(el, options) {
  opts = options;
  bars = options.bars || 4;
  canvas = document.createElement("canvas");
  el.appendChild(canvas);
  ctx = canvas.getContext("2d");
  wrap = el.closest(".roll-wrap") || el;
  new ResizeObserver(() => { resize(); draw(); }).observe(wrap);
  resize();
  canvas.addEventListener("mousedown", onClick);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", (e) => held.delete(e.key.toLowerCase()));
  draw();
  // Open scrolled to the bottom so drums and bass are in view.
  requestAnimationFrame(() => wrap.scrollTo(0, 1e6));
}

function resize() {
  // Fit the bars to the visible width so they line up with the playlist above.
  const avail = Math.max(320, (wrap.clientWidth || 900) - GUTTER);
  stepW = avail / (bars * BEATS_PER_BAR * 4);
  canvas.width = Math.round(GUTTER + avail);
  canvas.height = (HIGH - LOW + 1) * ROW_H;
}

const yOf = (pitch) => (HIGH - pitch) * ROW_H;
const xOf = (beat) => GUTTER + beat * 4 * stepW;
const snap = (beat) => (grid ? Math.round(beat / grid) * grid : Math.round(beat * 16) / 16);

function onClick(e) {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) * (canvas.width / r.width);
  if (x < GUTTER) return;
  const beat = Math.floor((x - GUTTER) / stepW) / 4;
  const pitch = HIGH - Math.floor(((e.clientY - r.top) * (canvas.height / r.height)) / ROW_H);
  const hitIdx = userNotes.findIndex((n) => n.pitch === pitch && beat >= n.start && beat < n.start + n.dur);
  if (hitIdx >= 0) userNotes.splice(hitIdx, 1);
  else { userNotes.push({ pitch, start: beat, dur: 0.25, vel: 0.9 }); opts.onNoteOn?.(pitch); }
  opts.onChange?.();
  draw();
}

function onKey(e) {
  if (e.target?.closest?.("input, textarea")) return;
  const k = e.key.toLowerCase();
  if (k === "z") { shift = Math.max(-24, shift - 12); return; }
  if (k === "x") { shift = Math.min(12, shift + 12); return; }
  const pitch = keyToPitch(k);
  if (pitch === null || held.has(k) || e.repeat) return;
  held.add(k);
  hit(pitch);
}

function draw() {
  if (!ctx) return;
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--roll-bg").trim() || "#0E0F13";
  ctx.fillRect(0, 0, w, h);
  for (let p = LOW; p <= HIGH; p++) {
    const inScale = mood.scale.includes(((p - mood.root) % 12 + 12) % 12);
    if (!inScale) { ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(GUTTER, yOf(p), w - GUTTER, ROW_H); }
    if (p % 12 === 0) { ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(GUTTER, yOf(p) + ROW_H - 1, w - GUTTER, 1); }
  }
  const steps = bars * 16;
  for (let s = 0; s <= steps; s++) {
    ctx.fillStyle = s % 16 === 0 ? "rgba(255,255,255,.24)" : s % 4 === 0 ? "rgba(255,255,255,.09)" : "rgba(255,255,255,.035)";
    ctx.fillRect(xOf(s / 4), 0, 1, h);
  }
  // Keyboard column (same width as the playlist's names column).
  ctx.fillStyle = "#18191F"; ctx.fillRect(0, 0, GUTTER, h);
  ctx.font = "600 9px 'JetBrains Mono', monospace"; ctx.textBaseline = "middle";
  for (let p = LOW; p <= HIGH; p++) {
    const black = [1, 3, 6, 8, 10].includes(p % 12);
    ctx.fillStyle = black ? "#22242B" : "#2C2F38";
    ctx.fillRect(GUTTER - 46, yOf(p) + 1, 46, ROW_H - 1);
    const label = DRUM_NAMES[p] ? DRUM_NAMES[p] : p % 12 === 0 ? `C${Math.floor(p / 12) - 1}` : "";
    if (label) { ctx.fillStyle = DRUM_NAMES[p] ? "#FFB547" : "#8E8F99"; ctx.fillText(label, 10, yOf(p) + ROW_H / 2); }
  }
  ctx.fillStyle = "#2A2C34"; ctx.fillRect(GUTTER - 1, 0, 1, h);
  const drawNotes = (notes, color, a) => {
    ctx.globalAlpha = a; ctx.fillStyle = color;
    for (const n of notes) {
      if (n.pitch < LOW || n.pitch > HIGH) continue;
      ctx.beginPath(); ctx.roundRect(xOf(n.start) + 1, yOf(n.pitch) + 1, Math.max(3, n.dur * 4 * stepW - 2), ROW_H - 2, 3); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  for (const t of others) if (!t.muted) drawNotes(t.notes, TRACK_COLORS[t.type], t.source === "user" ? 0.85 : 0.4);
  drawNotes(userNotes, activeColor, 1);
  if (playhead >= 0) { ctx.fillStyle = "#fff"; ctx.fillRect(xOf(playhead), 0, 2, h); }
}

/** The active layer's notes. @returns {import("../shared/contracts.js").Note[]} */
export function getNotes() { return userNotes.map((n) => ({ ...n })); }

/** Show every other layer behind the active one. Pass replaceUserNotes to load the active layer's notes. */
export function setTracks(tracks, replaceUserNotes) {
  others = tracks.filter((t) => t.id !== activeId);
  if (replaceUserNotes) userNotes = replaceUserNotes.map((n) => ({ ...n }));
  draw();
}

/** Switch which layer the roll and keyboard edit. */
export function setActive(id, color, notes, tracks) {
  activeId = id;
  activeColor = color || TRACK_COLORS.keys;
  setTracks(tracks || [], notes || []);
}

/** PNG data URL of the grid, sent to the AI so it can "see" the beat. */
export function screenshot() { return canvas.toDataURL("image/png"); }

/** Move the playhead (beats), or -1 to hide. */
export function setPlayhead(beat) { playhead = beat; draw(); }

/** Change the scale the keys play (a key of MOODS). */
export function setMood(key) { mood = MOODS[key] || MOODS.dance; draw(); }

/** Record quantise in beats: 1 = 1/4, 0.5 = 1/8, 0.25 = 1/16, 0.125 = 1/32, 0 = off. */
export function setQuantize(beats) { grid = Number(beats) || 0; }

/** Remove all of the active layer's notes. */
export function clear() { userNotes = []; opts.onChange?.(); draw(); }

/** Play a note (keyboard or phone) and record it into the active layer if recording. Returns the note or null. */
export function hit(pitch) {
  if (opts.intercept?.(pitch)) return null;
  opts.onNoteOn?.(pitch);
  if (!opts.isRecording?.()) return null;
  const total = bars * BEATS_PER_BAR;
  const note = { pitch, start: snap(opts.getBeat()) % total, dur: grid || 0.25, vel: 0.9 };
  userNotes.push(note);
  opts.onChange?.();
  draw();
  return note;
}

/** Set a recorded note's length (beats) when the finger lifts, snapped to the grid. */
export function setLength(note, beats) {
  if (!note || !userNotes.includes(note)) return;
  const g = grid || 0.0625;
  note.dur = Math.max(g, Math.min(8, Math.round(beats / g) * g));
  opts.onChange?.();
  draw();
}

/** Change the loop length (bars). */
export function setBars(n) { bars = n; resize(); draw(); }

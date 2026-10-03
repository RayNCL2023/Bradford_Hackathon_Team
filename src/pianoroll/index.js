// PIANO ROLL + KEYBOARD. Owner: Person 2.
// Exports (keep these names): mount, getNotes, setTracks, screenshot, setPlayhead, setMood, clear
// Starter version: canvas grid, click to add/remove notes, computer keys play/record notes locked to a scale.
import { TRACK_COLORS, BEATS_PER_BAR, MOODS } from "../shared/contracts.js";

const LOW = 36, HIGH = 84;           // C2..C6
const ROW_H = 12, STEP_W = 22;       // one 16th note = STEP_W px
// Scale lock: every key plays a note from the mood's scale, so nothing sounds wrong.
const ROW_LOW = "asdfghjkl";          // middle row walks up the scale
const ROW_HIGH = "qwertyuiop";        // top row = same, one octave higher
let mood = MOODS.dance;
let shift = 0;                        // Z / X move everything down / up an octave

/** Map a key to a pitch in the current scale, or null. */
function keyToPitch(k) {
  let i = ROW_LOW.indexOf(k), up = 0;
  if (i < 0) { i = ROW_HIGH.indexOf(k); up = 12; }
  if (i < 0) return null;
  const len = mood.scale.length;
  return mood.root + shift + up + mood.scale[i % len] + 12 * Math.floor(i / len);
}

let canvas, ctx, opts, bars = 4;
let userNotes = [];
let aiTracks = [];
let playhead = -1;
const held = new Set();

/**
 * @param {HTMLElement} el
 * @param {{ bars:number, onNoteOn:(pitch:number)=>void, isRecording:()=>boolean, getBeat:()=>number }} options
 */
export function mount(el, options) {
  opts = options;
  bars = options.bars || 4;
  canvas = document.createElement("canvas");
  el.appendChild(canvas);
  ctx = canvas.getContext("2d");
  resize();
  canvas.addEventListener("mousedown", onClick);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", (e) => held.delete(e.key.toLowerCase()));
  draw();
}

function resize() {
  canvas.width = bars * BEATS_PER_BAR * 4 * STEP_W;
  canvas.height = (HIGH - LOW + 1) * ROW_H;
}

const yOf = (pitch) => (HIGH - pitch) * ROW_H;
const xOf = (beat) => beat * 4 * STEP_W;

function onClick(e) {
  const r = canvas.getBoundingClientRect();
  const beat = Math.floor((e.clientX - r.left) / STEP_W) / 4;
  const pitch = HIGH - Math.floor((e.clientY - r.top) / ROW_H);
  const hit = userNotes.findIndex((n) => n.pitch === pitch && beat >= n.start && beat < n.start + n.dur);
  if (hit >= 0) userNotes.splice(hit, 1);
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
  if (pitch === null || held.has(k)) return;
  held.add(k);
  opts.onNoteOn?.(pitch);
  if (opts.isRecording?.()) {
    const total = bars * BEATS_PER_BAR;
    const beat = (Math.round(opts.getBeat() * 4) / 4) % total;
    userNotes.push({ pitch, start: beat, dur: 0.25, vel: 0.9 });
    opts.onChange?.();
    draw();
  }
}

function draw() {
  const w = canvas.width, h = canvas.height;
  const css = getComputedStyle(document.documentElement);
  ctx.fillStyle = css.getPropertyValue("--roll-bg").trim() || "#12151e";
  ctx.fillRect(0, 0, w, h);
  for (let p = LOW; p <= HIGH; p++) {
    if ([1, 3, 6, 8, 10].includes(p % 12)) { ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.fillRect(0, yOf(p), w, ROW_H); }
    if (p % 12 === 0) { ctx.fillStyle = "rgba(255,255,255,.08)"; ctx.fillRect(0, yOf(p) + ROW_H - 1, w, 1); }
  }
  for (let s = 0; s <= bars * 16; s++) {
    ctx.fillStyle = s % 16 === 0 ? "rgba(255,255,255,.22)" : s % 4 === 0 ? "rgba(255,255,255,.09)" : "rgba(255,255,255,.035)";
    ctx.fillRect(s * STEP_W, 0, 1, h);
  }
  const drawNotes = (notes, color, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    for (const n of notes) {
      if (n.pitch < LOW || n.pitch > HIGH) continue;
      ctx.beginPath();
      ctx.roundRect(xOf(n.start) + 1, yOf(n.pitch) + 1, Math.max(4, xOf(n.dur) - 2), ROW_H - 2, 3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  for (const t of aiTracks) if (t.type !== "drums" && !t.muted) drawNotes(t.notes, TRACK_COLORS[t.type], 0.45);
  drawNotes(userNotes, TRACK_COLORS.keys, 1);
  if (playhead >= 0) { ctx.fillStyle = "#fff"; ctx.fillRect(xOf(playhead), 0, 2, h); }
}

/** The notes the user has played/drawn. @returns {import("../shared/contracts.js").Note[]} */
export function getNotes() { return userNotes.map((n) => ({ ...n })); }

/** Show AI (or other) tracks behind the user's notes. Pass {userNotes} to replace the user's notes too. */
export function setTracks(tracks, replaceUserNotes) {
  aiTracks = tracks.filter((t) => t.source !== "user");
  if (replaceUserNotes) userNotes = replaceUserNotes.map((n) => ({ ...n }));
  draw();
}

/** PNG data URL of the grid, sent to the AI so it can "see" the beat. */
export function screenshot() { return canvas.toDataURL("image/png"); }

/** Change the scale the keys play (a key of MOODS). */
export function setMood(key) { mood = MOODS[key] || MOODS.dance; }

/** Remove all of the user's notes. */
export function clear() { userNotes = []; opts.onChange?.(); draw(); }

/** Play a note from outside (e.g. the phone pads) and record it if recording. Returns the recorded note or null. */
export function hit(pitch) {
  opts.onNoteOn?.(pitch);
  if (!opts.isRecording?.()) return null;
  const total = bars * BEATS_PER_BAR;
  const note = { pitch, start: (Math.round(opts.getBeat() * 4) / 4) % total, dur: 0.25, vel: 0.9 };
  userNotes.push(note);
  opts.onChange?.();
  draw();
  return note;
}

/** Set a recorded note's length (beats, snapped to 1/16) when the finger lifts. */
export function setLength(note, beats) {
  if (!note || !userNotes.includes(note)) return;
  note.dur = Math.max(0.25, Math.min(8, Math.round(beats * 4) / 4));
  opts.onChange?.();
  draw();
}

/** Move the playhead (beats), or -1 to hide. */
export function setPlayhead(beat) { playhead = beat; draw(); }

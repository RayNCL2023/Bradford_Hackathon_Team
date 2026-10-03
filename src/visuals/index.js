// VISUALS. Owner: Person 2.
// Exports (keep these names): mount, setPalette, pulse, setTitle, setTracks, setMeta, noteOn, beat,
//   setSpectrumSource, setClock, setCooking
//
// Concept: "your song as a record". The loop is a disc; every note sits on it by time (angle) and
// pitch/track (radius). A sweeping arm plays through them and each note flares when heard.
// Kick thumps the disc, the live spectrum glows round the rim, and the title is set like album art.
import { TRACK_COLORS } from "../shared/contracts.js";

let canvas, ctx, el;
let palette = ["#ff3d7f", "#7b2ff7", "#00e5ff"];
let title = "", meta = "";
let tracks = [], totalBeats = 16;
let spectrum = () => null, clock = () => 0;
let cooking = false;
let compact = false; // small panel view: disc centred, one-line title
let thump = 0, flash = 0, spin = 0, t = 0;
let rings = [], sparks = [], flares = new Map();
let grain = null;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Ring layout (fraction of disc radius) per track type.
const RING = { drums: [0.2, 0.34], bass: [0.38, 0.48], pad: [0.52, 0.62], keys: [0.66, 0.92], lead: [0.66, 0.92], pluck: [0.66, 0.92] };

/** @param {HTMLElement} host */
export function mount(host) {
  el = host;
  canvas = document.createElement("canvas");
  el.appendChild(canvas);
  ctx = canvas.getContext("2d");
  const fit = () => { canvas.width = el.clientWidth * devicePixelRatio; canvas.height = el.clientHeight * devicePixelRatio; makeGrain(); };
  new ResizeObserver(fit).observe(el);
  fit();
  el.addEventListener("dblclick", () => (document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen?.()).catch?.(() => {}));
  el.title = "Double-click for full screen";
  requestAnimationFrame(frame);
}

export function setPalette(colors) { if (colors?.length >= 2) palette = colors.slice(0, 3); }
export function setTitle(text) { title = text || ""; }
/** @param {{bpm?:number, mood?:string, key?:string}} m */
export function setMeta(m) { meta = [m.mood, m.bpm && `${m.bpm} BPM`, m.key].filter(Boolean).join("  ·  ").toUpperCase(); }
/** @param {import("../shared/contracts.js").Track[]} list @param {number} bars */
export function setTracks(list, bars = 4) { tracks = list.filter((x) => !x.muted); totalBeats = bars * 4; }
export function setSpectrumSource(fn) { spectrum = fn; }
export function setClock(fn) { clock = fn; }
export function setCooking(on) { cooking = on; }
/** Small panel view (true) or full poster layout (false, used by Performance mode). */
export function setCompact(on) { compact = !!on; }
export function pulse(strength = 0.6) { thump = Math.min(1, thump + strength); }

/** Called on every beat (0-based beat in the loop). */
export function beat(n) { if (n % 4 === 0) flash = Math.max(flash, 0.35); }

/** Called for every note as it's heard. */
export function noteOn({ type, pitch, vel = 0.8 }) {
  if (type === "drums") {
    if (pitch === 36) { thump = 1; rings.push({ r: 0.3, a: 0.9 }); }
    else if (pitch === 38 || pitch === 39) flash = Math.max(flash, 0.5);
  }
  const key = `${type}:${pitch}`;
  flares.set(key, 1);
  const pos = notePos(type, pitch, beatInLoop());
  if (pos && !reduced) for (let i = 0; i < (type === "drums" ? 3 : 7); i++) {
    const a = Math.random() * Math.PI * 2, s = (0.6 + Math.random() * 1.6) * vel;
    sparks.push({ x: pos.x, y: pos.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, c: TRACK_COLORS[type] || palette[0] });
  }
}

const beatInLoop = () => ((clock() % totalBeats) + totalBeats) % totalBeats;

// Disc geometry, recomputed each frame.
let cx = 0, cy = 0, R = 1;
function notePos(type, pitch, start) {
  const [r0, r1] = RING[type] || RING.lead;
  const frac = type === "drums" ? ({ 36: 0, 38: 0.5, 39: 0.5, 42: 1, 46: 1 }[pitch] ?? 0.7) : Math.min(1, Math.max(0, (pitch - 30) / 60));
  const r = R * (r0 + (r1 - r0) * frac);
  const ang = -Math.PI / 2 + (start / totalBeats) * Math.PI * 2 + spin;
  return { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r, ang, r };
}

function makeGrain() {
  grain = document.createElement("canvas");
  grain.width = grain.height = 128;
  const g = grain.getContext("2d"), img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 14; }
  g.putImageData(img, 0, 0);
}

function frame() {
  requestAnimationFrame(frame);
  const w = canvas.width, h = canvas.height, d = devicePixelRatio;
  if (!w || !h) return;
  t += 1 / 60;
  thump *= 0.86; flash *= 0.88;
  spin += cooking ? 0.05 : 0;

  // Layout: disc on the right, poster type on the left (stacks on narrow stages).
  const wide = !compact && w > h * 1.4;
  cx = wide ? w * 0.68 : w / 2;
  cy = compact ? h * 0.46 : h / 2;
  R = Math.min(wide ? w * 0.3 : w * 0.42, h * (compact ? 0.4 : 0.44)) * (1 + thump * 0.04);

  // Background: palette wash + slow drift, brightened by kick and snare.
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, shade(palette[1], -0.82));
  bg.addColorStop(1, shade(palette[0], -0.86));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  palette.forEach((c, i) => {
    const x = cx + Math.cos(t * 0.13 + i * 2.1) * w * 0.35, y = cy + Math.sin(t * 0.17 + i) * h * 0.4, r = Math.max(w, h) * 0.45;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, hexA(c, 0.16 + flash * 0.2)); g.addColorStop(1, hexA(c, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  });

  // Spectrum halo round the rim.
  const sp = spectrum();
  if (sp?.bins) {
    const n = sp.bins.length;
    for (let i = 0; i < n * 2; i++) {
      const v = Math.max(0, (sp.bins[i % n] + 100) / 70);
      const ang = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
      const len = R * 0.22 * v;
      ctx.strokeStyle = hexA(palette[i % 3], 0.5);
      ctx.lineWidth = 2.5 * d;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * (R * 1.04), cy + Math.sin(ang) * (R * 1.04));
      ctx.lineTo(cx + Math.cos(ang) * (R * 1.04 + len), cy + Math.sin(ang) * (R * 1.04 + len));
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = "source-over";

  // The disc: grooves and bar lines.
  ctx.fillStyle = "rgba(6,6,12,0.72)";
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1 * d;
  for (let r = 0.18; r < 1; r += 0.045) { ctx.beginPath(); ctx.arc(cx, cy, R * r, 0, Math.PI * 2); ctx.stroke(); }
  for (let b = 0; b < totalBeats; b += 4) {
    const a = -Math.PI / 2 + (b / totalBeats) * Math.PI * 2 + spin;
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.16, cy + Math.sin(a) * R * 0.16); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
  }

  // Notes on the disc. Sustained notes are arcs; flared notes glow.
  const now = beatInLoop();
  ctx.globalCompositeOperation = "lighter";
  for (const tr of tracks) {
    const col = TRACK_COLORS[tr.type] || palette[0];
    for (const n of tr.notes) {
      const p = notePos(tr.type, n.pitch, n.start);
      const fl = flares.get(`${tr.type}:${n.pitch}`) || 0;
      const near = Math.abs(((now - n.start + totalBeats) % totalBeats)) < Math.max(0.3, n.dur) ? 1 : 0;
      const glow = 0.35 + 0.65 * Math.max(near * fl, 0);
      if (n.dur >= 1 && tr.type !== "drums") {
        const a1 = p.ang + (n.dur / totalBeats) * Math.PI * 2;
        ctx.strokeStyle = hexA(col, 0.25 + glow * 0.5); ctx.lineWidth = (2 + glow * 3) * d; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(cx, cy, p.r, p.ang, a1); ctx.stroke();
      } else {
        const s = (tr.type === "drums" ? 2.2 : 2.8) * d * (1 + glow * 1.6);
        ctx.fillStyle = hexA(col, 0.35 + glow * 0.65);
        ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  for (const [k, v] of flares) { const nv = v * 0.9; if (nv < 0.03) flares.delete(k); else flares.set(k, nv); }

  // Play arm.
  const armA = -Math.PI / 2 + (now / totalBeats) * Math.PI * 2 + spin + (cooking ? t * 6 : 0);
  const armG = ctx.createLinearGradient(cx, cy, cx + Math.cos(armA) * R, cy + Math.sin(armA) * R);
  armG.addColorStop(0, hexA(palette[2], 0)); armG.addColorStop(1, hexA(palette[2], 0.95));
  ctx.strokeStyle = armG; ctx.lineWidth = 3 * d;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(armA) * R, cy + Math.sin(armA) * R); ctx.stroke();
  // Trailing sweep.
  ctx.fillStyle = hexA(palette[2], 0.07);
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, armA - 0.5, armA); ctx.closePath(); ctx.fill();

  // Kick shockwaves.
  rings = rings.filter((r) => r.a > 0.02);
  for (const r of rings) {
    r.r += 0.035; r.a *= 0.9;
    ctx.strokeStyle = hexA(palette[0], r.a); ctx.lineWidth = 3 * d;
    ctx.beginPath(); ctx.arc(cx, cy, R * r.r, 0, Math.PI * 2); ctx.stroke();
  }

  // Sparks.
  if (cooking && !reduced && Math.random() < 0.5) {
    const a = Math.random() * Math.PI * 2, r = R * 1.6;
    sparks.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, vx: -Math.cos(a) * 3, vy: -Math.sin(a) * 3, life: 1, c: palette[Math.floor(Math.random() * 3)] });
  }
  sparks = sparks.filter((s) => s.life > 0.02).slice(-400);
  for (const s of sparks) {
    s.x += s.vx * d; s.y += s.vy * d; s.vy += 0.02 * d; s.life *= 0.95;
    ctx.fillStyle = hexA(s.c, s.life);
    ctx.fillRect(s.x, s.y, 2 * d, 2 * d);
  }
  ctx.globalCompositeOperation = "source-over";

  // Label in the centre like a record.
  ctx.fillStyle = palette[0];
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.13 * (1 + thump * 0.15), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#07070c";
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.025, 0, Math.PI * 2); ctx.fill();

  // Poster type (compact: one small line under the disc).
  if (compact) {
    ctx.font = `700 ${Math.round(11 * d)}px "IBM Plex Sans", system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.textAlign = "center";
    ctx.fillText((title || (cooking ? "Cooking…" : "Tap a beat")).toUpperCase(), w / 2, h - 8 * d);
    ctx.textAlign = "start";
    if (grain) { ctx.fillStyle = ctx.createPattern(grain, "repeat"); ctx.fillRect(0, 0, w, h); }
    return;
  }
  const tx = wide ? w * 0.06 : w * 0.05, maxW = wide ? w * 0.42 : w * 0.9;
  const words = (title || (cooking ? "Cooking…" : "Tap a beat")).toUpperCase();
  let size = Math.min(h * 0.17, 92 * d);
  ctx.font = `800 ${size}px "Bricolage Grotesque", system-ui, sans-serif`;
  const lines = wrap(words, maxW);
  while (lines.length * size * 0.95 > h * 0.62 && size > 18 * d) { size *= 0.9; ctx.font = `800 ${size}px "Bricolage Grotesque", system-ui, sans-serif`; lines.splice(0, lines.length, ...wrap(words, maxW)); }
  const ty = wide ? h * 0.5 - (lines.length * size * 0.92) / 2 + size * 0.8 : h * 0.16 + size;
  const jitter = flash * 6 * d;
  lines.forEach((ln, i) => {
    const y = ty + i * size * 0.92;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = hexA(palette[0], 0.85); ctx.fillText(ln, tx - jitter, y);
    ctx.fillStyle = hexA(palette[2], 0.85); ctx.fillText(ln, tx + jitter, y);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#fff"; ctx.fillText(ln, tx, y);
  });
  if (meta) {
    ctx.font = `600 ${Math.max(10 * d, size * 0.17)}px "IBM Plex Sans", system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(meta, tx, ty + lines.length * size * 0.92 + size * 0.05);
  }

  // Film grain on top for texture.
  if (grain) { ctx.fillStyle = ctx.createPattern(grain, "repeat"); ctx.fillRect(0, 0, w, h); }
}

function wrap(text, maxW) {
  const out = []; let line = "";
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) { out.push(line); line = word; } else line = test;
  }
  if (line) out.push(line);
  return out.slice(0, 4);
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16), f = (c) => Math.round(c * (1 + amt));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// VISUALS. Owner: Person 2 (after the piano roll works).
// Exports (keep these names): mount, setPalette, pulse, setTitle
// Starter version: glowing blobs in the AI's colours that pulse on every beat, plus the song title.
// Ideas: react to real audio levels (Tone.Analyser), particles on the kick, a full-screen "show mode", cover art export.

let canvas, ctx, palette = ["#ff3d7f", "#7b2ff7", "#00e5ff"], title = "", energy = 0, rings = [], t = 0;

/** @param {HTMLElement} el */
export function mount(el) {
  canvas = document.createElement("canvas");
  el.appendChild(canvas);
  ctx = canvas.getContext("2d");
  const fit = () => { canvas.width = el.clientWidth * devicePixelRatio; canvas.height = el.clientHeight * devicePixelRatio; };
  new ResizeObserver(fit).observe(el);
  fit();
  requestAnimationFrame(frame);
}

/** @param {string[]} colors 3 hex colours */
export function setPalette(colors) { if (colors?.length) palette = colors; }

/** Call on each beat. @param {number} strength 0-1 (1 = downbeat / kick) */
export function pulse(strength = 0.6) {
  energy = Math.min(1, energy + strength);
  rings.push({ r: 0, a: strength, c: palette[rings.length % palette.length] });
}

/** @param {string} text */
export function setTitle(text) { title = text || ""; }

function frame() {
  requestAnimationFrame(frame);
  if (!canvas.width) return;
  const w = canvas.width, h = canvas.height, s = devicePixelRatio;
  t += 0.01;
  energy *= 0.92;
  ctx.fillStyle = "rgba(8,9,14,0.35)";
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "lighter";
  palette.forEach((c, i) => {
    const x = w / 2 + Math.cos(t * (0.7 + i * 0.3) + i * 2) * w * 0.25;
    const y = h / 2 + Math.sin(t * (0.9 + i * 0.2) + i) * h * 0.22;
    const r = Math.min(w, h) * (0.22 + energy * 0.18);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c + "cc");
    g.addColorStop(1, c + "00");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  });
  rings = rings.filter((ring) => ring.a > 0.02);
  for (const ring of rings) {
    ring.r += 6 * s; ring.a *= 0.94;
    ctx.strokeStyle = ring.c; ctx.globalAlpha = ring.a; ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.arc(w / 2, h / 2, ring.r, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  if (title) {
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.font = `800 ${Math.round(Math.min(w / 14, 46 * s) * (1 + energy * 0.06))}px "Bricolage Grotesque", system-ui, sans-serif`;
    ctx.fillText(title, w / 2, h / 2 + 14 * s);
  }
}

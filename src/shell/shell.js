// APP SHELL (v2 producer view): wires the modules together. Owner: Person 1.
import { MOODS, TRACK_COLORS, DRUM_PITCH } from "../shared/contracts.js";
import * as roll from "../pianoroll/index.js";
import * as audio from "../audio/index.js";
import * as voice from "../voice/index.js";
import * as visuals from "../visuals/index.js";
import { applyTip, arrange, ACTION_LABELS } from "./producer.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** @type {import("../shared/contracts.js").Project} */
const project = { bpm: 124, bars: 4, tracks: [{ id: "user", name: "Your beat", type: "keys", source: "user", notes: [] }], clips: [] };
let mood = "dance";
let recording = false;
let playing = false;
let songTitle = "";
let busy = false;

const status = (text, isBusy = false) => { $("status").textContent = text; $("status").classList.toggle("busy", isBusy); };
const userTrack = () => project.tracks.find((t) => t.id === "user");
const userDrums = () => {
  let t = project.tracks.find((x) => x.id === "user-drums");
  if (!t) { t = { id: "user-drums", name: "Your drums", type: "drums", source: "user", notes: [] }; project.tracks.splice(1, 0, t); }
  return t;
};
const loopBeats = () => project.bars * 4;

// ---------- Vibes ----------
$("moods").innerHTML = Object.entries(MOODS)
  .map(([k, m]) => `<button class="vibe" data-mood="${k}" aria-pressed="${k === mood}">${m.label}<span>${m.bpm}</span></button>`).join("");
$("moods").addEventListener("click", (e) => {
  const b = e.target.closest(".vibe");
  if (!b) return;
  mood = b.dataset.mood;
  document.querySelectorAll(".vibe").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  roll.setMood(mood);
  project.bpm = MOODS[mood].bpm;
  $("bpm").value = project.bpm;
  audio.setBpm(project.bpm);
  refreshAll();
  syncPhones();
  status(`${MOODS[mood].label}: ${project.bpm} BPM, key locked to ${MOODS[mood].key}.`);
  explain("STUDIO", `${MOODS[mood].label} vibe: ${project.bpm} BPM, ${MOODS[mood].key}`, "Every pad and key is now locked to this scale, so nothing you play can sound wrong.", 3500);
  remember(`The user picked the ${MOODS[mood].label} vibe (${project.bpm} BPM, ${MOODS[mood].key}).`);
});

// ---------- Modules ----------
roll.mount($("roll"), {
  bars: project.bars,
  onNoteOn: async (pitch) => { await audio.init(); audio.playNote(pitch); },
  isRecording: () => recording && playing,
  getBeat: () => audio.getBeat(),
  onChange: () => { userTrack().notes = roll.getNotes(); audio.loadProject(project); refreshAll(false); },
});
visuals.mount($("stage"));
visuals.setCompact(true);
voice.mountPanel($("panel"), {
  tones: audio.TONES,
  onPreview: async (url, opts) => { await audio.init(); audio.previewClip(url, opts); },
  onAddClip: async ({ url, name, bar, opts }) => {
    await audio.init();
    const id = await audio.addClip(url, (bar - 1) * 4, opts);
    project.clips.push({ id, name, url, startBeat: (bar - 1) * 4 });
    refreshAll(false);
    status(`Added "${name}" at bar ${bar}. Change its pitch or tone any time.`);
    explain("ELEVENLABS", `Vocal “${name}” dropped into bar ${bar}`, `Voiced by ElevenLabs; pitch and ${opts?.tone && opts.tone !== "clean" ? opts.tone : "tone"} effects run live in the studio at no extra cost.`);
    return id;
  },
  onUpdateClip: (id, opts) => audio.updateClip(id, opts),
  currentBar: () => (playing ? Math.floor((audio.getBeat() % loopBeats()) / 4) + 1 : 1),
});
audio.onNote((n) => { visuals.noteOn(n); bumpMeter(n.type, n.vel); });
visuals.setSpectrumSource(() => audio.getSpectrum());
visuals.setClock(() => audio.getBeat());

// ---------- Refresh everything that shows the project ----------
function refreshAll(rebuildMixer = true) {
  roll.setTracks(project.tracks);
  visuals.setTracks(project.tracks, project.bars);
  visuals.setMeta({ mood: MOODS[mood].label, bpm: project.bpm, key: MOODS[mood].key });
  $("lcdKey").textContent = MOODS[mood].key.replace("minor", "MIN").replace("major", "MAJ").toUpperCase();
  $("lcdBars").textContent = `${project.bars} BAR${project.bars > 1 ? "S" : ""}`;
  document.querySelectorAll(".loop-picker [data-bars]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.bars) === project.bars)));
  $("songName").textContent = "/ " + (songTitle || "Untitled");
  $("notesCount").textContent = `${project.tracks.reduce((a, t) => a + t.notes.length, 0)} NOTES`;
  renderLanes();
  renderRack();
  if (rebuildMixer) renderMixer();
}

// ---------- Playlist ----------
function renderLanes() {
  const bars = project.bars;
  $("ruler").style.gridTemplateColumns = `repeat(${bars}, minmax(0, 1fr))`;
  $("ruler").innerHTML = Array.from({ length: bars }, (_, i) => `<span>${i + 1}</span>`).join("");
  const rows = project.tracks.map((t) => {
    // A clip for each run of bars that has notes in it.
    const has = Array.from({ length: bars }, (_, b) => t.notes.some((n) => n.start >= b * 4 && n.start < b * 4 + 4));
    const clips = [];
    for (let b = 0; b < bars; b++) {
      if (!has[b]) continue;
      let e = b;
      while (e + 1 < bars && has[e + 1]) e++;
      const ticks = t.notes.filter((n) => n.start >= b * 4 && n.start < (e + 1) * 4).slice(0, 80)
        .map((n) => {
          const x = ((n.start - b * 4) / ((e - b + 1) * 4)) * 100;
          const y = t.type === "drums" ? ({ 36: 70, 38: 40, 39: 45, 42: 15, 46: 20, 49: 10 }[n.pitch] ?? 30) : 85 - Math.min(80, Math.max(0, (n.pitch - 30) * 1.4));
          return `<i style="left:${x}%;top:${y}%;height:3px"></i>`;
        }).join("");
      clips.push(`<div class="clip-block" style="grid-column:${b + 1}/${e + 2};background:${TRACK_COLORS[t.type]}"><span>${esc(t.name)}</span>${ticks}</div>`);
      b = e;
    }
    const by = t.source === "ai" ? "GEMMA" : t.id === "user-drums" || t.id === "user" ? "YOU" : "";
    const icon = t.type === "drums" ? "drum.png" : t.id === "user" ? "Your beat.png" : "";
    const mark = icon ? `<img class="pix" src="../../Icon/${icon}" alt="">` : `<span class="sw" style="background:${TRACK_COLORS[t.type]}"></span>`;
    return `<div class="lane${t.muted ? " muted" : ""}"><button class="lane-name" data-id="${esc(t.id)}" title="Click to mute">${mark}<b>${esc(t.name)}</b><small>${by}</small></button>
      <div class="lane-clips" style="grid-template-columns:repeat(${bars},minmax(0,1fr))">${clips.join("")}</div></div>`;
  });
  for (const c of project.clips) {
    const bar = Math.floor(c.startBeat / 4);
    rows.push(`<div class="lane"><div class="lane-name"><span class="sw" style="background:var(--lilac)"></span><b>“${esc(c.name)}”</b><small>11LABS</small></div>
      <div class="lane-clips" style="grid-template-columns:repeat(${bars},minmax(0,1fr))"><div class="clip-block" style="grid-column:${bar + 1}/${bar + 2};background:var(--lilac)"><span>Vox</span></div></div></div>`);
  }
  $("lanes").innerHTML = rows.join("") + `<div class="playhead-line" id="plHead" hidden></div>`;
  $("lanes").style.position = "relative";
}
$("lanes").addEventListener("click", (e) => {
  const b = e.target.closest("button.lane-name");
  if (!b) return;
  const t = project.tracks.find((x) => x.id === b.dataset.id);
  if (!t) return;
  t.muted = !t.muted;
  audio.loadProject(project);
  refreshAll();
});

// ---------- Channel rack (drums, editable) ----------
const RACK = [["Kick", DRUM_PITCH.kick], ["Snare", DRUM_PITCH.snare], ["Clap", DRUM_PITCH.clap], ["Hat", DRUM_PITCH.closedHat], ["Open hat", DRUM_PITCH.openHat], ["Crash", DRUM_PITCH.crash]];
let rackBar = 1;
function renderRack() {
  rackBar = Math.min(rackBar, project.bars);
  const base = (rackBar - 1) * 4;
  const mine = project.tracks.find((t) => t.id === "user-drums");
  const ai = project.tracks.filter((t) => t.type === "drums" && t.source === "ai");
  const hit = (t, pitch, step) => t?.notes.some((n) => n.pitch === pitch && Math.abs(n.start - (base + step / 4)) < 0.01);
  const barsBtns = Array.from({ length: project.bars }, (_, i) => `<button data-rackbar="${i + 1}" aria-pressed="${i + 1 === rackBar}">BAR ${i + 1}</button>`).join("");
  $("rack").innerHTML = `<div class="rack-bars">${barsBtns}<span>Amber = yours (tap to change). Dark = the producer's drums.</span></div>` +
    RACK.map(([name, pitch]) => `<div class="rack-row"><b>${name}</b>${Array.from({ length: 16 }, (_, s) =>
      `<button class="step${Math.floor(s / 4) % 2 ? " alt" : ""}${ai.some((t) => hit(t, pitch, s)) ? " ai" : ""}${hit(mine, pitch, s) ? " on" : ""}" data-pitch="${pitch}" data-step="${s}" aria-label="${name} step ${s + 1}"></button>`).join("")}</div>`).join("");
}
$("rack").addEventListener("click", async (e) => {
  const bb = e.target.closest("[data-rackbar]");
  if (bb) { rackBar = Number(bb.dataset.rackbar); renderRack(); return; }
  const st = e.target.closest(".step");
  if (!st) return;
  const pitch = Number(st.dataset.pitch), start = (rackBar - 1) * 4 + Number(st.dataset.step) / 4;
  const t = userDrums();
  const i = t.notes.findIndex((n) => n.pitch === pitch && Math.abs(n.start - start) < 0.01);
  if (i >= 0) t.notes.splice(i, 1);
  else { t.notes.push({ pitch, start, dur: 0.25, vel: 0.9 }); await audio.init(); audio.playNote(pitch, "drums"); }
  audio.loadProject(project);
  refreshAll(!project.tracks.some((x) => x.id === "user-drums" && x.notes.length === 1));
});
function showTab(which) {
  $("tab-roll").setAttribute("aria-selected", String(which === "roll"));
  $("tab-rack").setAttribute("aria-selected", String(which === "rack"));
  $("rollWrap").hidden = which !== "roll";
  $("rack").hidden = which !== "rack";
  $("tabNote").textContent = which === "roll" ? "Your melody, with the producer's parts behind it" : "Drum steps for one bar at a time, quantised to 1/16";
}
$("tab-roll").onclick = () => showTab("roll");
$("tab-rack").onclick = () => showTab("rack");

// ---------- Mixer ----------
const levels = {};
const vols = {};
function mixerChannels() {
  const types = [...new Set(project.tracks.map((t) => t.type))];
  return types.map((type) => ({ type, name: type === "keys" ? "Beat" : type[0].toUpperCase() + type.slice(1), muted: project.tracks.filter((t) => t.type === type).every((t) => t.muted) }));
}
function renderMixer() {
  $("mixer").innerHTML = mixerChannels().map((c) => `
    <div class="chan${c.muted ? " muted" : ""}" data-type="${c.type}">
      <div class="meters"><span class="meter"><i id="mt-${c.type}-l"></i></span><span class="meter"><i id="mt-${c.type}-r"></i></span>
        <input type="range" min="-30" max="6" step="1" value="${vols[c.type] ?? 0}" aria-label="${c.name} volume" data-vol="${c.type}"></div>
      <span class="db" id="db-${c.type}">${(vols[c.type] ?? 0) > 0 ? "+" : ""}${vols[c.type] ?? 0} dB</span>
      <button class="mute" data-mute="${c.type}">${c.muted ? "MUTED" : "M"}</button>
      <span class="cname" style="color:${TRACK_COLORS[c.type]}">${c.name}</span>
    </div>`).join("");
}
$("mixer").addEventListener("input", (e) => {
  const r = e.target.closest("[data-vol]");
  if (!r) return;
  vols[r.dataset.vol] = Number(r.value);
  audio.setVolume(r.dataset.vol, Number(r.value));
  $("db-" + r.dataset.vol).textContent = `${r.value > 0 ? "+" : ""}${r.value} dB`;
});
$("mixer").addEventListener("click", (e) => {
  const m = e.target.closest("[data-mute]");
  if (!m) return;
  const tracks = project.tracks.filter((t) => t.type === m.dataset.mute);
  const mute = !tracks.every((t) => t.muted);
  tracks.forEach((t) => (t.muted = mute));
  audio.loadProject(project);
  refreshAll();
});
function bumpMeter(type, vel = 0.8) { levels[type] = Math.min(1, Math.max(levels[type] || 0, 0.55 + vel * 0.45)); }

// ---------- Analyser + meters + position (every frame) ----------
const spec = $("spectrum"), scope = $("scope");
let lastBeat = -1;
function frame() {
  requestAnimationFrame(frame);
  const beat = audio.getBeat();
  if (playing) {
    const inLoop = beat % loopBeats();
    roll.setPlayhead(inLoop);
    const head = $("plHead");
    if (head) { head.hidden = false; const lanes = $("lanes"); const x0 = 160, w = lanes.clientWidth - x0; head.style.left = `${x0 + (inLoop / loopBeats()) * w}px`; }
    const whole = Math.floor(beat);
    if (whole !== lastBeat) { lastBeat = whole; visuals.beat(whole % loopBeats()); window.api.remote?.beat(whole); highlightRackStep(inLoop); }
    const b = Math.floor(inLoop), bar = Math.floor(b / 4) + 1, bt = (b % 4) + 1, s16 = Math.floor((inLoop % 1) * 4) + 1;
    $("lcdPos").textContent = `${String(bar).padStart(2, "0")}.${bt}.${String(s16).padStart(2, "0")}`;
  }
  // Channel meters fall back down smoothly.
  for (const type of Object.keys(levels)) {
    levels[type] *= 0.9;
    const l = $(`mt-${type}-l`), r = $(`mt-${type}-r`);
    if (l) l.style.height = `${levels[type] * 100}%`;
    if (r) r.style.height = `${levels[type] * 92}%`;
  }
  const sp = audio.getSpectrum();
  drawAnalyser(sp);
}
function drawAnalyser(sp) {
  const dpr = devicePixelRatio;
  for (const c of [spec, scope]) { const w = c.clientWidth * dpr; if (c.width !== w) { c.width = w; c.height = c.clientHeight * dpr; } }
  const g = spec.getContext("2d"), w = spec.width, h = spec.height;
  g.clearRect(0, 0, w, h);
  const s = scope.getContext("2d"), sw = scope.width, sh = scope.height;
  s.clearRect(0, 0, sw, sh);
  if (!sp) return;
  const n = sp.bins.length, bw = w / n;
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(1, (sp.bins[i] + 100) / 80));
    g.fillStyle = i < n * 0.2 ? "#FFB020" : i < n * 0.55 ? "#7FE7FF" : "#C9A2FF";
    g.fillRect(i * bw + 1, h - v * h, bw - 2, v * h);
  }
  s.strokeStyle = "#7FE7FF"; s.lineWidth = 1.5 * dpr; s.beginPath();
  let peak = 0, sum = 0;
  for (let i = 0; i < sp.wave.length; i++) {
    const v = sp.wave[i]; peak = Math.max(peak, Math.abs(v)); sum += v * v;
    const x = (i / (sp.wave.length - 1)) * sw, y = sh / 2 - v * sh * 0.45;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  s.stroke();
  const rms = Math.sqrt(sum / sp.wave.length);
  $("peak").textContent = `PEAK ${peak > 0.0001 ? (20 * Math.log10(peak)).toFixed(1) : "-∞"} dB`;
  const pct = Math.min(100, rms * 260);
  const fill = (p) => `linear-gradient(90deg, #3DDC97 0 ${Math.min(p, 70)}%, #FFB020 ${Math.min(p, 70)}% ${Math.min(p, 90)}%, #FF5A6E ${Math.min(p, 90)}% ${p}%, #2A2C34 ${p}%)`;
  $("mL").style.background = fill(pct);
  $("mR").style.background = fill(pct * 0.94);
}
function highlightRackStep(inLoop) {
  if ($("rack").hidden) return;
  const bar = Math.floor(inLoop / 4) + 1, step = Math.floor((inLoop % 4) * 4);
  document.querySelectorAll(".step.now").forEach((s) => s.classList.remove("now"));
  if (bar === rackBar) document.querySelectorAll(`.step[data-step="${step}"]`).forEach((s) => s.classList.add("now"));
}
requestAnimationFrame(frame);

// ---------- Transport ----------
async function play() {
  await audio.init();
  Object.entries(vols).forEach(([t, db]) => audio.setVolume(t, db));
  userTrack().notes = roll.getNotes();
  audio.loadProject(project);
  audio.play();
  playing = true;
  $("play").classList.add("on");
  syncPhones();
}
function stop() { audio.stop(); playing = false; $("play").classList.remove("on"); roll.setPlayhead(-1); const h = $("plHead"); if (h) h.hidden = true; $("lcdPos").textContent = "01.1.01"; syncPhones(); }
function toggleRec() { recording = !recording; $("rec").setAttribute("aria-pressed", String(recording)); if (recording && !playing) play(); else syncPhones(); }
$("play").onclick = () => (playing ? stop() : play());
$("stop").onclick = stop;
$("rec").onclick = toggleRec;
$("bpm").onchange = () => { project.bpm = Math.min(200, Math.max(60, Number($("bpm").value) || 124)); $("bpm").value = project.bpm; audio.setBpm(project.bpm); refreshAll(false); syncPhones(); };
const nudgeBpm = (d) => { $("bpm").value = Math.min(200, Math.max(60, project.bpm + d)); $("bpm").onchange(); };
$("bpmDown").onclick = () => nudgeBpm(-1);
$("bpmUp").onclick = () => nudgeBpm(1);
$("clear").onclick = () => { roll.clear(); const d = project.tracks.find((t) => t.id === "user-drums"); if (d) d.notes = []; audio.loadProject(project); refreshAll(); status("Cleared what you played. The producer's parts are still there."); };
window.addEventListener("keydown", (e) => {
  if (e.target?.closest?.("input, textarea")) return;
  if (e.code === "Space") { e.preventDefault(); playing ? stop() : play(); }
});

// ---------- Loops ----------
function setLoop(bars) {
  project.bars = bars;
  roll.setBars(bars);
  audio.loadProject(project);
  refreshAll();
  syncPhones();
  status(`Loop is ${bars} bar${bars > 1 ? "s" : ""}. Press Rec and play over it: every pass adds to the loop.`);
}
document.querySelectorAll(".loop-picker [data-bars]").forEach((b) => b.addEventListener("click", () => setLoop(Number(b.dataset.bars))));
$("doubleLoop").onclick = () => {
  if (project.bars >= 8) { status("The loop is already 8 bars, the longest it goes."); return; }
  const len = loopBeats();
  userTrack().notes = roll.getNotes();
  for (const t of project.tracks) {
    const inside = t.notes.filter((n) => n.start < len);
    t.notes = [...inside, ...inside.map((n) => ({ ...n, start: n.start + len }))];
  }
  project.bars *= 2;
  roll.setBars(project.bars);
  roll.setTracks(project.tracks, userTrack().notes);
  audio.loadProject(project);
  refreshAll();
  status(`Doubled: your ${project.bars / 2}-bar loop now plays twice in a ${project.bars}-bar loop. Change the second half to make it move.`);
  explain("STUDIO", `Loop doubled to ${project.bars} bars`, "Copied every track. Record over the second half to make it evolve.", 3500);
};

// ---------- Producer ----------
let currentTips = [];
function renderNotes() {
  if (!currentTips.length) { $("notes").innerHTML = `<p class="muted">Notes from the producer appear here after it hears your beat.</p>`; return; }
  $("notes").innerHTML = currentTips.map((t, i) => t.done
    ? `<div class="note done">${esc(t.done)}</div>`
    : `<div class="note"><p><span class="bar">BAR ${t.bar}</span>${esc(t.tip)}</p>
        <div class="acts">${t.action && t.action !== "none" ? `<button class="apply" data-apply="${i}">Apply: ${esc(ACTION_LABELS[t.action] || "do it")}</button>` : ""}<button class="skip" data-skip="${i}">Skip</button></div></div>`).join("");
}
$("notes").addEventListener("click", (e) => {
  const a = e.target.closest("[data-apply]"), s = e.target.closest("[data-skip]");
  if (a) {
    const tip = currentTips[Number(a.dataset.apply)];
    const did = applyTip(project, tip);
    tip.done = did ? "Applied: " + did : "Couldn't apply that one (the track isn't there).";
    if (did) { explain("AI PRODUCER", "Producer note applied", did + " The AI suggested it; one tap edited the actual notes."); remember(`The user APPLIED the producer note "${tip.tip}" (${tip.action}).`); }
    audio.loadProject(project);
    refreshAll();
    renderNotes();
    status(did || "Nothing to change for that note.");
  } else if (s) {
    const tip = currentTips[Number(s.dataset.skip)];
    remember(`The user SKIPPED the producer note "${tip.tip}" (${tip.action}). They don't want this.`);
    explain("NMAFC MEMORY", "Skipped. The producer will remember that", "Next time it avoids suggesting what you keep rejecting.", 4000);
    currentTips.splice(Number(s.dataset.skip), 1);
    renderNotes();
  }
});

async function produce(instruction = "") {
  const userNotes = roll.getNotes();
  const drums = project.tracks.find((t) => t.id === "user-drums")?.notes || [];
  if (!userNotes.length && !drums.length) { status("Play something first: press Rec, then tap your phone pads or keys A–L."); return; }
  if (busy) return;
  busy = true;
  document.querySelectorAll(".big-btn, .move, .ghost-btn, #askBtn").forEach((b) => (b.disabled = true));
  const lines = ["Listening to your beat", "Finding the groove", "Programming the drums", "Writing the bassline", "Layering synths", "Naming the track"];
  const t0 = Date.now();
  const cook = setInterval(() => {
    const secs = Math.round((Date.now() - t0) / 1000);
    const line = lines[Math.min(lines.length - 1, Math.floor(secs / 3))];
    status(`Producer: ${line}… ${secs}s`, true);
    $("prodSub").textContent = `Gemma 4 · ${line.toLowerCase()}`;
  }, 500);
  visuals.setCooking(true);
  explain("GEMMA 4", instruction ? `Producer is remixing: “${instruction}”` : "The AI producer is listening to your beat",
    "Gemma 4 gets your notes plus a picture of your piano roll (multimodal), and writes drums, bass and synths as real notes you can edit.", 7000);
  if (instruction) remember(`The user asked the producer: "${instruction}".`);
  try {
    /** @type {import("../shared/contracts.js").AiResult} */
    const result = await window.api.produce({ bpm: project.bpm, bars: project.bars, userNotes: userNotes.length ? userNotes : drums, screenshotPng: roll.screenshot(), mood, instruction });
    project.tracks = [...project.tracks.filter((t) => t.source === "user"), ...result.tracks];
    songTitle = result.title;
    visuals.setPalette(result.palette);
    visuals.setTitle(result.title);
    currentTips = (result.timelineTips || []).map((t) => ({ ...t }));
    renderNotes();
    refreshAll();
    await play();
    const by = { ollama: "local Gemma", gemini: "Gemma 4", mock: "the demo producer" }[result.source] || result.source;
    $("prodSub").textContent = `${by} · produced "${result.title}"`;
    status(`"${result.title}" produced by ${by}.${result.note ? " " + result.note : ""} Check the producer notes.`);
    explain("GEMMA 4", `Produced “${result.title}”`, `${result.tracks.length} new tracks, a song title, a colour theme for the visuals, vocal ideas and producer notes, all from your beat.`);
    if (result.memories?.length) setTimeout(() => explain("NMAFC MEMORY", "The producer remembered you", result.memories.slice(0, 2).map((m) => m.fact).join(" · ")), 1200);
    voice.showResult(result);
    syncPhones();
  } catch (err) {
    status("Something went wrong: " + err.message);
  } finally {
    clearInterval(cook);
    visuals.setCooking(false);
    busy = false;
    document.querySelectorAll(".big-btn, .move, .ghost-btn, #askBtn").forEach((b) => (b.disabled = false));
  }
}
$("produce").onclick = () => produce("");
document.querySelectorAll(".move").forEach((b) => b.addEventListener("click", () => produce(b.dataset.ins)));
$("askBtn").onclick = () => { const v = $("instruction").value.trim(); if (v) { produce(v); $("instruction").value = ""; } };
$("instruction").addEventListener("keydown", (e) => { if (e.key === "Enter") $("askBtn").click(); });
$("arrange").onclick = () => {
  userTrack().notes = roll.getNotes();
  const did = arrange(project);
  if (!did) { status("Already 8 bars. Use the loop buttons to change the length."); return; }
  roll.setBars(project.bars);
  roll.setTracks(project.tracks, userTrack().notes);
  audio.loadProject(project);
  refreshAll();
  syncPhones();
  status(did);
  explain("AI PRODUCER", "Arranged into a full section", did);
  remember("The user used Arrange my beat to make an 8-bar intro + drop.");
};

// ---------- Performance mode ----------
$("perfBtn").onclick = () => { $("perfSlot").appendChild($("stage")); visuals.setCompact(false); $("perf").hidden = false; $("perf").requestFullscreen?.().catch(() => {}); };
function exitPerf() { document.querySelector(".monitor").prepend($("stage")); visuals.setCompact(true); $("perf").hidden = true; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
$("perfClose").onclick = exitPerf;
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && !$("perf").hidden) exitPerf(); });
window.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("perf").hidden) exitPerf(); });

// ---------- Phone pads (Wi-Fi or USB) ----------
function syncPhones() {
  const m = MOODS[mood];
  window.api.remote?.setState({ title: songTitle, mood, moodLabel: m.label, key: m.key, root: m.root, scale: m.scale, bpm: project.bpm, playing, recording });
}
const held = new Map(); // pitch -> { note, t }
window.api.remote?.onMessage(async (msg) => {
  if (msg.type === "note") {
    await audio.init();
    if (msg.kind === "drums") {
      if (!msg.on) return;
      audio.playNote(msg.pitch, "drums");
      if (recording && playing) {
        userDrums().notes.push({ pitch: msg.pitch, start: (Math.round(audio.getBeat() * 4) / 4) % loopBeats(), dur: 0.25, vel: msg.vel ?? 0.9 });
        audio.loadProject(project);
        refreshAll(!mixerChannels().some((c) => c.type === "drums"));
      }
    } else if (msg.on) {
      held.set(msg.pitch, { note: roll.hit(msg.pitch), t: performance.now() });
    } else {
      const h = held.get(msg.pitch);
      held.delete(msg.pitch);
      if (h?.note) roll.setLength(h.note, ((msg.ms ?? performance.now() - h.t) / 1000) * (project.bpm / 60));
    }
  } else if (msg.type === "transport") {
    if (msg.action === "play") play();
    else if (msg.action === "stop") stop();
    else if (msg.action === "rec") toggleRec();
  }
});
window.api.remote?.onClients((n) => {
  $("phoneDot").classList.toggle("on", n > 0);
  $("phoneBtn").classList.toggle("on", n > 0);
  $("phoneLabel").textContent = n ? (n === 1 ? "Pads connected" : `${n} pads connected`) : "Connect phone";
  $("phoneCount").textContent = n ? `${n} phone${n > 1 ? "s" : ""} connected. Start tapping!` : "No phones connected yet.";
  if (n) {
    syncPhones();
    status(n === 1 ? "Phone pads connected. Press Rec on the phone and tap a beat." : `${n} phones connected.`);
    explain("PHONE PADS", "Phone connected as a MIDI controller", "Every tap is sent to the studio in milliseconds over USB or Wi-Fi. The pads follow the song's key, so every note fits.");
  }
});
async function openPhoneDialog() {
  $("phoneDialog").showModal();
  const info = await window.api.remote.info();
  $("qr").src = info.qr;
  $("wifiUrl").textContent = info.wifiUrl || "No Wi-Fi network found";
  $("usbState").textContent = !info.usb.adb ? "USB needs Android platform tools (adb) on this computer."
    : info.usb.linked ? `Phone plugged in and linked over USB (${info.usb.devices}).`
    : "No phone found on USB yet.";
}
$("phoneBtn").onclick = openPhoneDialog;

refreshAll();
syncPhones();

// ---------- Sample pack (./samples) ----------
const KIT_PARTS = ["kick", "snare", "clap", "hat", "openHat", "crash"];
const CAT_LABELS = { kick: "Kicks", snare: "Snares", clap: "Claps", hat: "Hats", openHat: "Open hats", crash: "Crashes", loop: "Loops", bass: "808 / bass", vocal: "Vocals", perc: "Percussion", fx: "FX", other: "Other" };
let samples = [];
const kitChoice = {};
async function loadSamples() {
  const res = await window.api.listSamples?.();
  samples = res?.samples || [];
  if (!samples.length) {
    $("samples").innerHTML = `<div class="s-empty">Drop a sample pack into the <b>samples</b> folder, then <button class="s-btn" id="rescan">Rescan</button></div>`;
    $("rescan").onclick = loadSamples;
    return;
  }
  const byCat = {};
  samples.forEach((s, i) => (byCat[s.category] ||= []).push(i));
  // Default kit: the first sample of each drum type.
  for (const part of KIT_PARTS) if (!(part in kitChoice) && byCat[part]) kitChoice[part] = byCat[part][0];
  const row = (i, cat) => {
    const s = samples[i];
    const isKit = KIT_PARTS.includes(cat);
    const action = cat === "loop" ? `<button class="mini" data-addloop="${i}" title="Add at the current bar, looped to the end">Add</button>`
      : isKit ? `<button class="mini${kitChoice[cat] === i ? " on" : ""}" data-kit="${cat}" data-i="${i}">Use</button>` : `<button class="mini" data-addloop="${i}" title="Add once at the current bar">Add</button>`;
    return `<li><button class="nm" data-preview="${i}" title="${esc(s.rel)}">${esc(s.name)}${s.bpm ? ` · ${s.bpm}` : ""}</button>${action}</li>`;
  };
  $("samples").innerHTML = `<div class="s-head"><button class="s-btn amber" id="useKit">Use pack drums</button><button class="s-btn" id="rescan">Rescan</button></div>` +
    Object.keys(CAT_LABELS).filter((c) => byCat[c]).map((c) =>
      `<details${c === "loop" ? " open" : ""}><summary>${CAT_LABELS[c]}<span>${byCat[c].length}</span></summary><ul>${byCat[c].slice(0, 120).map((i) => row(i, c)).join("")}</ul></details>`).join("");
  $("rescan").onclick = loadSamples;
  $("useKit").onclick = async () => {
    const urls = Object.fromEntries(KIT_PARTS.filter((p) => kitChoice[p] !== undefined).map((p) => [p, samples[kitChoice[p]].url]));
    const loaded = await audio.loadKit(urls);
    status(loaded.length ? `Drums now use the pack: ${loaded.join(", ")}. Phone drum pads too.` : "No drum samples found in the pack.");
    if (loaded.length) explain("SAMPLES", "Real drum samples loaded", `The kit now uses your sample pack (${loaded.join(", ")}), including the phone's drum pads and the AI's drums.`);
  };
}
$("samples").addEventListener("click", async (e) => {
  const pv = e.target.closest("[data-preview]"), kitB = e.target.closest("[data-kit]"), add = e.target.closest("[data-addloop]");
  if (pv) { await audio.init(); audio.previewClip(samples[Number(pv.dataset.preview)].url, {}); }
  else if (kitB) {
    kitChoice[kitB.dataset.kit] = Number(kitB.dataset.i);
    kitB.closest("ul").querySelectorAll(".mini").forEach((b) => b.classList.toggle("on", b === kitB));
    $("useKit").click();
  } else if (add) {
    await audio.init();
    const s = samples[Number(add.dataset.addloop)];
    const bar = playing ? Math.floor((audio.getBeat() % loopBeats()) / 4) + 1 : 1;
    const loopBars = s.category === "loop" ? project.bars - bar + 1 : 0;
    const id = await audio.addClip(s.url, (bar - 1) * 4, { sourceBpm: s.bpm || 0, loopBars });
    project.clips.push({ id, name: s.name, url: s.url, startBeat: (bar - 1) * 4 });
    refreshAll(false);
    status(`Added "${s.name}" at bar ${bar}${loopBars ? `, looping to bar ${project.bars}` : ""}${s.bpm ? `, stretched from ${s.bpm} to ${project.bpm} BPM` : ""}.`);
  }
});
loadSamples();

// ---------- Explain callouts (what each click is doing, for judges) ----------
const TAG_COLORS = { "GEMMA 4": "var(--amber)", "AI PRODUCER": "var(--amber)", ELEVENLABS: "var(--lilac)", "NMAFC MEMORY": "var(--green)", "PHONE PADS": "var(--cyan)", STUDIO: "var(--text)", SAMPLES: "var(--pink)" };
let explainOn = true;
try { explainOn = localStorage.getItem("explain") !== "off"; } catch (_) {}
function renderExplainBtn() { $("explainBtn").setAttribute("aria-pressed", String(explainOn)); $("explainBtn").textContent = explainOn ? "Explain: on" : "Explain: off"; }
$("explainBtn").onclick = () => { explainOn = !explainOn; try { localStorage.setItem("explain", explainOn ? "on" : "off"); } catch (_) {} renderExplainBtn(); };
renderExplainBtn();
/** Pop up a short card saying what just happened and which tech did it. */
function explain(tag, title, text, ms = 5500) {
  if (!explainOn) return;
  const box = document.querySelector("#perf:not([hidden])") ? $("perf") : document.body;
  if ($("callouts").parentElement !== box) box.appendChild($("callouts"));
  const el = document.createElement("div");
  el.className = "callout";
  el.style.setProperty("--c", TAG_COLORS[tag] || "var(--amber)");
  el.innerHTML = `<span class="ctag">${esc(tag)}</span><b>${esc(title)}</b>${text ? `<span>${esc(text)}</span>` : ""}`;
  $("callouts").prepend(el);
  while ($("callouts").children.length > 3) $("callouts").lastElementChild.remove();
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, ms);
}
window.addEventListener("explain", (e) => explain(e.detail.tag, e.detail.title, e.detail.text));

// ---------- Producer memory (NMAFC) ----------
const remember = (text) => window.api.memory?.remember(text);
async function refreshMemory() {
  const r = await window.api.memory?.list();
  if (!r) return;
  $("memState").textContent = r.online ? "online" : "offline";
  $("memState").classList.toggle("on", r.online);
  if (!r.online) { $("memory").innerHTML = `<p class="muted">Memory is off. Start it with scripts/start-memory.ps1 and the producer will remember your taste between sessions.</p>`; return; }
  $("memory").innerHTML = r.facts.length
    ? r.facts.slice(0, 8).map((f) => `<div class="mem-fact${/core/i.test(f.type) ? " core" : ""}"><small>${/core/i.test(f.type) ? "PERMANENT" : /ephemeral/i.test(f.type) ? "FADING FAST" : "REMEMBERED"}</small>${esc(f.fact)}</div>`).join("")
    : `<p class="muted">Nothing remembered yet. Apply or skip a producer note and it starts learning your taste.</p>`;
}
window.api.memory?.onStored((r) => {
  if (r.ok && r.stored) {
    explain("NMAFC MEMORY", `Remembered ${r.stored} thing${r.stored > 1 ? "s" : ""} about your taste`, "Neuromorphic memory: facts you repeat get stronger, contradicted ones are replaced, passing moods fade.");
    refreshMemory();
  }
});
refreshMemory();
setInterval(refreshMemory, 30000);

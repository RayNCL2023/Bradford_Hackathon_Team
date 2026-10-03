// APP SHELL: wires the modules together. Owner: Person 1.
import { MOODS, TRACK_COLORS } from "../shared/contracts.js";
import * as roll from "../pianoroll/index.js";
import * as audio from "../audio/index.js";
import * as voice from "../voice/index.js";
import * as visuals from "../visuals/index.js";

const $ = (id) => document.getElementById(id);

/** @type {import("../shared/contracts.js").Project} */
const project = { bpm: 124, bars: 4, tracks: [{ id: "user", name: "Your Beat", type: "keys", source: "user", notes: [] }], clips: [] };
let mood = "dance";
let recording = false;
let playing = false;

const status = (text, busy = false) => { $("status").textContent = text; $("status").classList.toggle("busy", busy); };
const userTrack = () => project.tracks.find((t) => t.source === "user");

// ---- Moods ----
$("moods").innerHTML = Object.entries(MOODS)
  .map(([k, m]) => `<button class="mood" id="mood-${k}" data-mood="${k}" aria-pressed="${k === mood}">${m.label}</button>`).join("");
$("moods").addEventListener("click", (e) => {
  const b = e.target.closest(".mood");
  if (!b) return;
  mood = b.dataset.mood;
  document.querySelectorAll(".mood").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  roll.setMood(mood);
  project.bpm = MOODS[mood].bpm;
  $("bpm").value = project.bpm;
  audio.setBpm(project.bpm);
  refreshVisuals();
  status(`${MOODS[mood].label} mood: ${project.bpm} BPM. Every key now plays notes that fit.`);
});

// ---- Modules ----
roll.mount($("roll"), {
  bars: project.bars,
  onNoteOn: async (pitch) => { await audio.init(); audio.playNote(pitch); },
  isRecording: () => recording && playing,
  getBeat: () => audio.getBeat(),
  onChange: () => { userTrack().notes = roll.getNotes(); audio.loadProject(project); refreshVisuals?.(); },
});
visuals.mount($("stage"));
voice.mountPanel($("panel"), {
  tones: audio.TONES,
  onPreview: async (url, opts) => { await audio.init(); audio.previewClip(url, opts); },
  onAddClip: async ({ url, name, bar, opts }) => {
    await audio.init();
    const id = await audio.addClip(url, (bar - 1) * 4, opts);
    project.clips.push({ id, name, url, startBeat: (bar - 1) * 4 });
    status(`Added "${name}" at bar ${bar}. Change its pitch or tone any time.`);
    return id;
  },
  onUpdateClip: (id, opts) => audio.updateClip(id, opts),
});
// Every note heard drives the visuals; the live spectrum feeds the ring.
audio.onNote((n) => visuals.noteOn(n));
visuals.setSpectrumSource(() => audio.getSpectrum());
visuals.setClock(() => audio.getBeat());
const refreshVisuals = () => {
  visuals.setTracks(project.tracks, project.bars);
  visuals.setMeta({ mood: MOODS[mood].label, bpm: project.bpm, key: MOODS[mood].key });
};
refreshVisuals();

function renderTracks() {
  $("trackList").innerHTML = project.tracks.map((t) => `
    <li class="${t.muted ? "muted" : ""}" data-id="${t.id}" title="Click to mute">
      <span class="sw" style="background:${TRACK_COLORS[t.type]}"></span>${t.name}<span class="src">${t.source === "ai" ? "AI" : "you"}</span>
    </li>`).join("");
}
$("trackList").addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  const t = project.tracks.find((x) => x.id === li.dataset.id);
  t.muted = !t.muted;
  renderTracks();
  roll.setTracks(project.tracks);
  audio.loadProject(project);
  refreshVisuals();
});
renderTracks();

// ---- Transport ----
async function play() {
  await audio.init();
  userTrack().notes = roll.getNotes();
  audio.loadProject(project);
  audio.play();
  playing = true;
}
function stop() { audio.stop(); playing = false; roll.setPlayhead(-1); }
$("play").onclick = play;
$("stop").onclick = stop;
$("rec").onclick = () => { recording = !recording; $("rec").setAttribute("aria-pressed", String(recording)); if (recording && !playing) play(); };
$("bpm").onchange = () => { project.bpm = Math.min(200, Math.max(60, Number($("bpm").value) || 124)); audio.setBpm(project.bpm); };
$("clear").onclick = () => roll.clear();
window.addEventListener("keydown", (e) => {
  if (e.target?.closest?.("input, textarea")) return;
  if (e.code === "Space") { e.preventDefault(); playing ? stop() : play(); }
});

// Playhead + beat pulses for the visuals.
let lastBeat = -1;
(function tick() {
  requestAnimationFrame(tick);
  if (!playing) return;
  const beat = audio.getBeat();
  roll.setPlayhead(beat % (project.bars * 4));
  const whole = Math.floor(beat);
  if (whole !== lastBeat) { lastBeat = whole; visuals.beat(whole % (project.bars * 4)); }
})();

// ---- The magic button ----
$("produce").onclick = async () => {
  const userNotes = roll.getNotes();
  if (!userNotes.length) { status("Tap out a beat first: press Rec, then ▶, and hit some keys."); return; }
  $("produce").disabled = true;
  const lines = ["Listening to your beat", "Finding the groove", "Cooking up the drums", "Laying down the bass", "Adding some sparkle", "Naming your track"];
  const t0 = Date.now();
  const cook = setInterval(() => {
    const secs = Math.round((Date.now() - t0) / 1000);
    status(`${lines[Math.min(lines.length - 1, Math.floor(secs / 3))]}… ${secs}s`, true);
  }, 500);
  visuals.setCooking(true);
  status("Listening to your beat…", true);
  try {
    /** @type {import("../shared/contracts.js").AiResult} */
    const result = await window.api.produce({ bpm: project.bpm, bars: project.bars, userNotes, screenshotPng: roll.screenshot(), mood });
    project.tracks = [userTrack(), ...result.tracks];
    renderTracks();
    roll.setTracks(project.tracks);
    visuals.setPalette(result.palette);
    visuals.setTitle(result.title);
    refreshVisuals();
    await play();
    const by = { ollama: "local Gemma", gemini: "Gemma (Gemini API)", mock: "the demo track" }[result.source] || result.source;
    status(`"${result.title}" is ready, made by ${by}.${result.note ? " " + result.note : ""}`);
    voice.showResult(result);
  } catch (err) {
    status("Something went wrong: " + err.message);
  } finally {
    clearInterval(cook);
    visuals.setCooking(false);
    $("produce").disabled = false;
  }
};

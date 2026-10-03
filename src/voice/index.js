// VOCALS PANEL (page side). Owner: Person 5.
// Exports (keep these names): mountPanel, showResult
// Top: "Your ad-lib": record (max 5 s) or type a line, pick a style, ElevenLabs re-voices it to fit.
// Below: the AI's vocal ideas. Clips are only made (and paid for) on a click.
// Pitch and tone are free effects applied in the app.

let root, options;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const STYLES = ["hype male shout", "deep MC", "breathy female hook", "crowd chant", "soft whisper", "robot voice"];
const MAX_SECONDS = 5;

/**
 * @param {HTMLElement} el
 * @param {{ tones: Record<string,{label:string}>,
 *           onPreview:(url:string, opts:object)=>void,
 *           onAddClip:(clip:{url:string,name:string,bar:number,opts:object})=>Promise<string>,
 *           onUpdateClip:(id:string, opts:object)=>void,
 *           currentBar?:()=>number }} opts
 */
export function mountPanel(el, opts) {
  root = el;
  options = opts;
  root.innerHTML = `
    <div class="clip adlib" id="adlib">
      <div class="clip-top"><b>Your ad-lib</b><span class="tag">ELEVENLABS</span></div>
      <p>Record it or type it. ElevenLabs turns it into a voice that fits the track.</p>
      <div class="adlib-row">
        <button class="btn rec-adlib" id="adlibRec" aria-pressed="false" title="Hold to record, up to ${MAX_SECONDS} seconds">● Hold to record</button>
        <span class="status" id="adlibTimer"></span>
      </div>
      <input class="adlib-text" id="adlibText" maxlength="80" placeholder="or type it: “Bradford, let's go!”" autocomplete="off">
      <div class="tones" id="adlibStyles" role="group" aria-label="Voice style">${STYLES.map((s, i) =>
        `<button class="tone" data-style="${esc(s)}" aria-pressed="${i === 0}">${esc(s)}</button>`).join("")}</div>
      <div class="clip-actions"><button class="btn accent" id="adlibGo">Make it fit</button><span class="status" id="adlibStatus"></span></div>
    </div>
    <div id="adlibResults" class="clips"></div>
    <div id="ideas"><div class="panel-empty">The producer suggests vocal ideas after it hears your beat.</div></div>`;
  wireAdlib();
}

// ---------- Your ad-lib ----------
function wireAdlib() {
  let style = STYLES[0], recorder = null, chunks = [], recorded = null, startedAt = 0, timer = null, held = false, starting = false;
  const $ = (id) => root.querySelector("#" + id);
  $("adlibStyles").addEventListener("click", (e) => {
    const b = e.target.closest(".tone"); if (!b) return;
    style = b.dataset.style;
    $("adlibStyles").querySelectorAll(".tone").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  });

  const stopRec = () => {
    held = false;
    if (recorder?.state === "recording") recorder.stop();
    clearInterval(timer);
    $("adlibRec").setAttribute("aria-pressed", "false");
    $("adlibRec").textContent = "● Hold to record";
  };
  const startRec = async (e) => {
    e.preventDefault();
    if (starting || recorder?.state === "recording") return;
    held = true;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      $("adlibTimer").textContent = "Recording isn't available here. Type your line instead.";
      return;
    }
    let stream;
    starting = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!held) { stream.getTracks().forEach((t) => t.stop()); $("adlibTimer").textContent = "Hold the button while you speak."; return; }
      recorder = new MediaRecorder(stream);
      chunks = [];
      recorder.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const secs = Math.min(MAX_SECONDS, (performance.now() - startedAt) / 1000);
        recorded = { blob: new Blob(chunks, { type: recorder.mimeType || "audio/webm" }), seconds: secs };
        $("adlibTimer").textContent = secs < 0.4 ? "Too short, hold the button while you speak." : `Recorded ${secs.toFixed(1)} s. Press Make it fit.`;
        if (secs < 0.4) recorded = null;
      };
      recorder.start();
      startedAt = performance.now();
      $("adlibRec").setAttribute("aria-pressed", "true");
      $("adlibRec").textContent = "● Recording… let go to stop";
      timer = setInterval(() => {
        const s = (performance.now() - startedAt) / 1000;
        $("adlibTimer").textContent = `${s.toFixed(1)} / ${MAX_SECONDS} s`;
        if (s >= MAX_SECONDS) stopRec();
      }, 100);
    } catch (err) {
      stream?.getTracks().forEach((t) => t.stop());
      recorder = null;
      $("adlibTimer").textContent = "Couldn't use the microphone: " + err.message;
    } finally { starting = false; }
  };
  $("adlibRec").addEventListener("pointerdown", startRec);
  ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => $("adlibRec").addEventListener(ev, stopRec));

  $("adlibGo").onclick = async () => {
    const text = $("adlibText").value.trim();
    if (!recorded && !text) { $("adlibStatus").textContent = "Record something or type a line first."; return; }
    $("adlibGo").disabled = true;
    $("adlibStatus").textContent = recorded ? "Re-voicing your recording…" : "Voicing your line…";
    let clip;
    try {
      const req = { text, style };
      if (recorded) { req.audio = new Uint8Array(await recorded.blob.arrayBuffer()); req.mime = recorded.blob.type; req.seconds = recorded.seconds; }
      clip = await window.api.makeAdlib(req);
    } catch (err) { clip = { url: "", error: err.message }; }
    $("adlibGo").disabled = false;
    if (!clip?.url) { $("adlibStatus").textContent = clip?.error || "Couldn't make that one."; return; }
    $("adlibStatus").textContent = "";
    window.dispatchEvent(new CustomEvent("explain", { detail: { tag: "ELEVENLABS", title: recorded ? "Your voice, re-voiced to fit" : "Your line, voiced to fit",
      text: recorded ? `ElevenLabs speech-to-speech kept your timing and delivery and swapped in a ${style} voice.` : `ElevenLabs spoke your words as a ${style}.` } }));
    recorded = null; $("adlibTimer").textContent = ""; $("adlibText").value = "";
    const card = document.createElement("div");
    card.className = "clip";
    card.innerHTML = `<div class="clip-top"><b>“${esc(clip.lyric)}”</b><span class="tag">YOURS</span></div><p>${esc(style)}</p><div class="clip-actions"></div>`;
    $("adlibResults").prepend(card);
    renderControls({ lyric: clip.lyric, bar: options.currentBar?.() ?? 1 }, clip, card);
  };
}

// ---------- The AI's ideas ----------
/** @param {import("../shared/contracts.js").AiResult} result */
export function showResult(result) {
  const box = root.querySelector("#ideas");
  box.innerHTML = `
    <div class="clips">${(result?.vocalIdeas || []).map((v, i) => `
      <div class="clip" data-i="${i}">
        <div class="clip-top"><b>"${esc(v.lyric)}"</b><span class="tag">bar ${v.bar}</span></div>
        <p>${esc(v.style)} · ${esc(v.reason)}</p>
        <div class="clip-actions"><button class="btn small" data-act="make">Make clip</button></div>
      </div>`).join("")}
    </div>`;
  box.querySelectorAll('[data-act="make"]').forEach((btn) => {
    const card = btn.closest(".clip");
    btn.onclick = () => makeClip(result?.vocalIdeas[Number(card.dataset.i)], card);
  });
}

async function makeClip(idea, card) {
  const box = card.querySelector(".clip-actions");
  box.innerHTML = `<span class="status">Making clip…</span>`;
  let clip;
  try { [clip] = await window.api.makeVocalClips([idea]); }
  catch (e) { clip = { url: "", error: e.message }; }
  if (!clip?.url) {
    box.innerHTML = `<span class="status">${esc(clip?.error || "Couldn't make this clip")}</span> <button class="btn small" data-act="retry">Try again</button>`;
    box.querySelector('[data-act="retry"]').onclick = () => makeClip(idea, card);
    return;
  }
  window.dispatchEvent(new CustomEvent("explain", { detail: { tag: "ELEVENLABS", title: `Vocal made: “${idea.lyric}”`,
    text: `Gemma suggested the line; ElevenLabs picked a matching voice for “${idea.style}” and performed it.` } }));
  renderControls(idea, clip, card);
}

function renderControls(idea, clip, card) {
  const state = { pitch: 0, speed: 1, tone: "clean", addedId: "" };
  const box = card.querySelector(".clip-actions");
  box.outerHTML = `
    <div class="fx">
      <label class="fx-row"><span>Pitch</span><input type="range" min="-12" max="12" step="1" value="0" data-fx="pitch"><output>0</output></label>
      <label class="fx-row"><span>Speed</span><input type="range" min="0.5" max="2" step="0.05" value="1" data-fx="speed"><output>1×</output></label>
      <div class="tones" role="group" aria-label="Tone">${Object.entries(options.tones).map(([k, t]) =>
        `<button class="tone" data-tone="${k}" aria-pressed="${k === "clean"}">${esc(t.label)}</button>`).join("")}</div>
    </div>
    <div class="clip-actions">
      <button class="btn small" data-act="play">▶ Play</button>
      <button class="btn small accent" data-act="add">Add to track</button>
      ${clip.note ? `<span class="status">${esc(clip.note)}</span>` : ""}
    </div>`;

  const opts = () => ({ pitch: state.pitch, speed: state.speed, tone: state.tone });
  const changed = () => {
    if (state.addedId) options.onUpdateClip(state.addedId, opts());
    options.onPreview(clip.url, opts());
  };
  const slider = card.querySelector('[data-fx="pitch"]');
  slider.oninput = () => { state.pitch = Number(slider.value); slider.nextElementSibling.textContent = (state.pitch > 0 ? "+" : "") + state.pitch; };
  slider.onchange = changed;
  const sp = card.querySelector('[data-fx="speed"]');
  sp.oninput = () => { state.speed = Number(sp.value); sp.nextElementSibling.textContent = String(Number(state.speed.toFixed(2))) + "×"; };
  sp.onchange = changed;
  card.querySelectorAll(".fx .tone").forEach((b) => b.onclick = () => {
    state.tone = b.dataset.tone;
    card.querySelectorAll(".fx .tone").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    changed();
  });
  card.querySelector('[data-act="play"]').onclick = () => options.onPreview(clip.url, opts());
  const add = card.querySelector('[data-act="add"]');
  add.onclick = async () => {
    if (state.addedId) return;
    add.disabled = true;
    try { state.addedId = await options.onAddClip({ url: clip.url, name: idea.lyric, bar: idea.bar ?? 1, opts: opts() }); }
    catch (err) { console.warn("Add to track failed:", err); state.addedId = ""; }
    add.textContent = state.addedId ? `On track at bar ${idea.bar ?? 1}` : "Couldn't add, try again";
    if (!state.addedId) add.disabled = false;
  };
}

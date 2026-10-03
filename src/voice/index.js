// VOCALS + TIPS PANEL (page side). Owner: Person 5.
// Exports (keep these names): mountPanel, showResult
// Lists the AI's vocal ideas and tips. A clip is only made (and paid for) when the user clicks "Make clip".
// Pitch and tone are free effects applied in the app, so trying them costs no ElevenLabs credit.

let root, options;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/**
 * @param {HTMLElement} el
 * @param {{ tones: Record<string,{label:string}>,
 *           onPreview:(url:string, opts:object)=>void,
 *           onAddClip:(clip:{url:string,name:string,bar:number,opts:object})=>Promise<string>,
 *           onUpdateClip:(id:string, opts:object)=>void }} opts
 */
export function mountPanel(el, opts) {
  root = el;
  options = opts;
  root.innerHTML = `<div class="panel-empty">Play a beat, then press <b>Make it a banger</b>. Vocal ideas and tips will appear here.</div>`;
}

/** @param {import("../shared/contracts.js").AiResult} result */
export function showResult(result) {
  root.innerHTML = `
    <h3 class="panel-h">Vocal ideas</h3>
    <div class="clips">${result.vocalIdeas.map((v, i) => `
      <div class="clip" data-i="${i}">
        <div class="clip-top"><b>"${esc(v.lyric)}"</b><span class="tag">bar ${v.bar}</span></div>
        <p>${esc(v.style)} · ${esc(v.reason)}</p>
        <div class="clip-actions"><button class="btn small" data-act="make">Make clip</button></div>
      </div>`).join("")}
    </div>
    <h3 class="panel-h">Tips for your timeline</h3>
    <ul class="tips">${result.timelineTips.map((t) => `<li><span class="tag">bar ${t.bar}</span> ${esc(t.tip)}</li>`).join("")}</ul>`;

  root.querySelectorAll('[data-act="make"]').forEach((btn) => {
    const card = btn.closest(".clip");
    btn.onclick = () => makeClip(result.vocalIdeas[Number(card.dataset.i)], card);
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
  renderControls(idea, clip, card);
}

function renderControls(idea, clip, card) {
  const state = { pitch: 0, tone: "clean", addedId: "" };
  const box = card.querySelector(".clip-actions");
  box.outerHTML = `
    <div class="fx">
      <label class="fx-row"><span>Pitch</span><input type="range" min="-12" max="12" step="1" value="0" data-fx="pitch"><output>0</output></label>
      <div class="tones" role="group" aria-label="Tone">${Object.entries(options.tones).map(([k, t]) =>
        `<button class="tone" data-tone="${k}" aria-pressed="${k === "clean"}">${esc(t.label)}</button>`).join("")}</div>
    </div>
    <div class="clip-actions">
      <button class="btn small" data-act="play">▶ Play</button>
      <button class="btn small accent" data-act="add">Add to track</button>
      ${clip.note ? `<span class="status">${esc(clip.note)}</span>` : ""}
    </div>`;

  const opts = () => ({ pitch: state.pitch, tone: state.tone });
  const changed = () => {
    if (state.addedId) options.onUpdateClip(state.addedId, opts());
    options.onPreview(clip.url, opts());
  };
  const slider = card.querySelector('[data-fx="pitch"]');
  slider.oninput = () => { state.pitch = Number(slider.value); slider.nextElementSibling.textContent = (state.pitch > 0 ? "+" : "") + state.pitch; };
  slider.onchange = changed;
  card.querySelectorAll(".tone").forEach((b) => b.onclick = () => {
    state.tone = b.dataset.tone;
    card.querySelectorAll(".tone").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    changed();
  });
  card.querySelector('[data-act="play"]').onclick = () => options.onPreview(clip.url, opts());
  const add = card.querySelector('[data-act="add"]');
  add.onclick = async () => {
    if (state.addedId) return;
    add.disabled = true;
    state.addedId = await options.onAddClip({ url: clip.url, name: idea.lyric, bar: idea.bar ?? 1, opts: opts() });
    add.textContent = state.addedId ? `On track at bar ${idea.bar ?? 1}` : "Couldn't add";
  };
}

// VOCALS + TIPS PANEL (page side). Owner: Person 5.
// Exports (keep these names): mountPanel, showResult
// Starter version: lists the AI's vocal ideas and tips, asks the main process to make the clips.

let root, options;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** @param {HTMLElement} el @param {{ onAddClip:(clip:{url:string,name:string,bar:number})=>void }} opts */
export function mountPanel(el, opts) {
  root = el;
  options = opts;
  root.innerHTML = `<div class="panel-empty">Play a beat, then press <b>AI Produce</b>. Vocal ideas and tips will appear here.</div>`;
}

/** @param {import("../shared/contracts.js").AiResult} result */
export async function showResult(result) {
  root.innerHTML = `
    <h3 class="panel-h">Vocal ideas</h3>
    <div class="clips">${result.vocalIdeas.map((v) => `
      <div class="clip" data-id="${esc(v.id)}">
        <div class="clip-top"><b>"${esc(v.lyric)}"</b><span class="tag">bar ${v.bar}</span></div>
        <p>${esc(v.style)} · ${esc(v.reason)}</p>
        <div class="clip-actions"><span class="status">Making clip…</span></div>
      </div>`).join("")}
    </div>
    <h3 class="panel-h">Tips for your timeline</h3>
    <ul class="tips">${result.timelineTips.map((t) => `<li><span class="tag">bar ${t.bar}</span> ${esc(t.tip)}</li>`).join("")}</ul>`;

  let clips;
  try { clips = await window.api.makeVocalClips(result.vocalIdeas); }
  catch (e) { clips = result.vocalIdeas.map((v) => ({ ideaId: v.id, url: "", error: e.message })); }
  for (const c of clips) {
    const idea = result.vocalIdeas.find((v) => v.id === c.ideaId);
    const box = root.querySelector(`.clip[data-id="${CSS.escape(c.ideaId)}"] .clip-actions`);
    if (!box) continue;
    if (!c.url) { box.innerHTML = `<span class="status">${esc(c.error || "Couldn't make this clip")}</span>`; continue; }
    box.innerHTML = `<button class="btn small" data-act="play">Play</button><button class="btn small accent" data-act="add">Add to track</button>`;
    const audio = new Audio(c.url);
    box.querySelector('[data-act="play"]').onclick = () => { audio.currentTime = 0; audio.play(); };
    box.querySelector('[data-act="add"]').onclick = () => options.onAddClip({ url: c.url, name: c.lyric, bar: idea?.bar ?? 1 });
  }
}

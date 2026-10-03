// VOCALS + TIPS PANEL (page side). Owner: Person 5.
// Exports (keep these names): mountPanel, showResult
// Lists the AI's vocal ideas and tips. A clip is only made (and paid for) when the user clicks "Make clip".

let root, options;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** @param {HTMLElement} el @param {{ onAddClip:(clip:{url:string,name:string,bar:number})=>void }} opts */
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
    btn.onclick = () => makeClip(result.vocalIdeas[Number(btn.closest(".clip").dataset.i)], btn.closest(".clip-actions"));
  });
}

async function makeClip(idea, box) {
  box.innerHTML = `<span class="status">Making clip…</span>`;
  let clip;
  try { [clip] = await window.api.makeVocalClips([idea]); }
  catch (e) { clip = { url: "", error: e.message }; }
  if (!clip?.url) {
    box.innerHTML = `<span class="status">${esc(clip?.error || "Couldn't make this clip")}</span> <button class="btn small" data-act="retry">Try again</button>`;
    box.querySelector('[data-act="retry"]').onclick = () => makeClip(idea, box);
    return;
  }
  box.innerHTML = `<button class="btn small" data-act="play">Play</button><button class="btn small accent" data-act="add">Add to track</button>${clip.note ? `<span class="status">${esc(clip.note)}</span>` : ""}`;
  const audio = new Audio(clip.url);
  box.querySelector('[data-act="play"]').onclick = () => { audio.currentTime = 0; audio.play(); };
  box.querySelector('[data-act="add"]').onclick = () => options.onAddClip({ url: clip.url, name: idea.lyric, bar: idea.bar ?? 1 });
}

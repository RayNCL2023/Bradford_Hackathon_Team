// PRODUCER MEMORY via NMAFC (the organisers' neuromorphic memory, "Openloft" challenge). Owner: Person 4.
// NMAFC runs as its own server (see scripts/start-memory.ps1). If it isn't running, everything here
// quietly does nothing, so the app never breaks.
//   remember(events)  -> NMAFC extracts lasting facts (slow, ~30 s, so it runs in the background)
//   recall(query)     -> instant: the facts that matter now, already ranked/decayed by NMAFC
const URL_ = () => (process.env.NMAFC_URL || "http://127.0.0.1:8765").replace(/\/$/, "");
const AGENT = () => process.env.NMAFC_AGENT || "ai-beat-studio-producer";
const headers = () => ({ "Content-Type": "application/json", ...(process.env.NMAFC_API_KEY ? { Authorization: `Bearer ${process.env.NMAFC_API_KEY}` } : {}) });

async function call(path, body, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(URL_() + path, { method: body ? "POST" : "GET", headers: headers(), body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
    if (!res.ok) throw new Error(`NMAFC HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** What the producer remembers that matters for this request. @returns {Promise<{facts:{fact:string,type:string}[], context:string}|null>} */
async function recall(query) {
  try {
    const r = await call("/v1/memories/search", { agent_id: AGENT(), query, limit: 8 }, 4000);
    const facts = (r.results || []).map((h) => ({ fact: String(h.fact || ""), type: String(h.memory_type || "") })).filter((f) => f.fact);
    return { facts, context: facts.map((f) => `- ${f.fact}`).join("\n") };
  } catch {
    return null;
  }
}

// Batch events and send at most one remember call every 20 s (each call costs one Gemini request).
let queue = [];
let timer = null;
let lastSent = 0;
const listeners = [];
function flush() {
  timer = null;
  if (!queue.length) return;
  const messages = queue.splice(0).map((content) => ({ role: "user", content }));
  lastSent = Date.now();
  call("/v1/memories", { agent_id: AGENT(), messages }, 180000)
    .then((r) => listeners.forEach((fn) => fn({ ok: true, stored: r.updates_ingested || 0 })))
    .catch((e) => listeners.forEach((fn) => fn({ ok: false, error: e.message })));
}
/** Tell the memory what the producer just saw the user do (plain English). */
function remember(event) {
  if (!event) return;
  queue.push(String(event).slice(0, 400));
  if (!timer) timer = setTimeout(flush, Math.max(0, 20000 - (Date.now() - lastSent)));
}
function onStored(fn) { listeners.push(fn); }

/** Everything currently remembered (for the Producer memory panel). */
async function list() {
  try {
    const r = await call(`/v1/memories?agent_id=${encodeURIComponent(AGENT())}&limit=30`, null, 4000);
    return { online: true, facts: (r.results || []).map((m) => ({ fact: String(m.fact || m.fact_content || m.memory || ""), type: String(m.memory_type || "") })).filter((f) => f.fact) };
  } catch {
    return { online: false, facts: [] };
  }
}

module.exports = { recall, remember, list, onStored };

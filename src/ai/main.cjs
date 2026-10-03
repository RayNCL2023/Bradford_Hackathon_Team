// AI PRODUCER (main process). Owner: Person 4.
// Export (keep this name): produce(AiRequest) -> AiResult   (shapes in src/shared/contracts.js)
//
// Order: 1) local Gemma via Ollama (free)  2) Gemma via the Gemini API (GEMINI_API_KEY, 1 call per press)
//        3) built-in demo track, so the app never breaks.
// Every answer is cleaned: notes snapped into the mood's scale and the bar range, bad fields dropped.
// CREDIT: identical requests reuse the last answer; the Gemini API is never retried in a loop.
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const DRUM = { kick: 36, snare: 38, clap: 39, closedHat: 42, openHat: 46 };
const TYPES = ["drums", "bass", "lead", "pad", "pluck"];
// Producer-note actions the app knows how to apply (see src/shell/producer.js).
const ACTIONS = ["drop_kick", "add_crash", "fill", "more_hats", "octave_up", "octave_down", "thin_bass"];
let MOODS = null;
const loadMoods = async () => (MOODS ??= (await import(pathToFileURL(path.join(__dirname, "../shared/contracts.js")).href)).MOODS);

// ---------- Prompt ----------
// SPEED: the model writes ONE BAR per instrument plus a 4-bar chord progression; code repeats and transposes it.
// That is ~4x fewer tokens than writing every note (a full track went from ~48 s to well under 20 s).
function buildPrompt(req, mood) {
  const bars = req.bars || 4;
  const riff = (req.userNotes || []).slice(0, 120).map((n) => [n.pitch, n.start, n.dur]);
  return `You are an expert dance-music producer in a beginner-friendly beat app. The user tapped a riff with no music knowledge. Make it a catchy ${bars}-bar loop.

Mood: ${mood.label}. Scale: root MIDI ${mood.root}, intervals ${JSON.stringify(mood.scale)}. ${req.bpm} BPM, 4/4.
User riff [pitch, startBeat, lengthBeats] over beats 0-${bars * 4}: ${JSON.stringify(riff)}
${req.instruction ? `The user asks: "${String(req.instruction).slice(0, 200)}". Apply it.` : ""}${req.screenshotPng ? "\nThe attached image is the piano roll; pink notes are the user's riff." : ""}

Write each instrument as ONE BAR only (beats 0 to 4, starts on multiples of 0.25). The app repeats it for every bar and moves pitched parts along "progression" (scale steps added to every note, one number per bar, first is 0). Always include drums and bass, plus 1-3 of pad, lead, pluck. Pitched notes in the scale. Drums: 36 kick, 38 snare, 39 clap, 42 closed hat, 46 open hat. Give drums a "fill" bar for the last bar.

Reply with ONLY compact JSON, no prose:
{"title":"2-5 word catchy name","palette":["#hex","#hex","#hex"],"progression":[0,s,s,s],"tracks":[{"name":"AI Drums","type":"drums","pattern":[[pitch,start,length,velocity]],"fill":[[pitch,start,length,velocity]]},{"name":"Bass","type":"bass|pad|lead|pluck","pattern":[[pitch,start,length,velocity]]}],"vocalIdeas":[{"lyric":"short ad-lib or hook","style":"e.g. hype male shout, breathy female hook","bar":1,"reason":"one line"}],"timelineTips":[{"bar":1,"tip":"short producer note in plain English","action":"one of ${ACTIONS.join("|")}","track":"drums|bass|pad|lead|pluck (for octave moves)"}]}
Exactly 3 vocalIdeas, palette = 3 vivid colours for the mood. Give 3 timelineTips written like a real producer advising the user; each MUST use an action the app can apply: drop_kick (remove the kick in that bar to build tension), add_crash (crash at the start of that bar), fill (snare fill at the end of that bar), more_hats (16th-note hats in that bar), octave_up / octave_down (move a track), thin_bass (remove bass in that bar).`;
}

// ---------- Parse + clean ----------
function extractJson(text) {
  if (!text) throw new Error("empty reply");
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const a = body.indexOf("{"), b = body.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON in reply");
  return JSON.parse(body.slice(a, b + 1));
}

const inScale = (p, mood) => mood.scale.includes((((p - mood.root) % 12) + 12) % 12);
function snapToScale(pitch, mood) {
  for (let d = 0; d < 7; d++) for (const p of [pitch - d, pitch + d]) if (inScale(p, mood)) return p;
  return pitch;
}

/** Move an in-scale pitch up/down by `steps` scale degrees (so chords stay in key). */
function moveByDegrees(pitch, steps, mood) {
  if (!steps) return pitch;
  const len = mood.scale.length, rel = pitch - mood.root;
  const oct = Math.floor(rel / 12), semi = ((rel % 12) + 12) % 12;
  let idx = mood.scale.indexOf(semi);
  if (idx < 0) return pitch;
  idx += oct * len + Math.round(steps);
  return mood.root + 12 * Math.floor(idx / len) + mood.scale[((idx % len) + len) % len];
}

const toNote = (n) => (Array.isArray(n) ? { pitch: n[0], start: n[1], dur: n[2], vel: n[3] } : n);
const tidy = (n) => ({ pitch: Math.round(Number(n.pitch)), start: Math.round(Number(n.start) * 4) / 4, dur: Number(n.dur), vel: Math.min(1, Math.max(0.2, Number(n.vel) || 0.8)) });

/** Turn one track from the reply into full-length notes. Accepts the 1-bar "pattern" form or a full "notes" list. */
function expandTrack(t, type, mood, bars, progression) {
  const total = bars * 4;
  if (Array.isArray(t.pattern)) {
    const bar1 = t.pattern.slice(0, 64).map(toNote).map(tidy).filter((n) => n.start >= 0 && n.start < 4 && n.dur > 0);
    const fill = Array.isArray(t.fill) ? t.fill.slice(0, 64).map(toNote).map(tidy).filter((n) => n.start >= 0 && n.start < 4 && n.dur > 0) : null;
    const out = [];
    for (let b = 0; b < bars; b++) {
      const src = b === bars - 1 && fill?.length ? fill : bar1;
      const shift = type === "drums" ? 0 : Number(progression[b % progression.length]) || 0;
      for (const n of src) {
        const pitch = type === "drums" ? n.pitch : moveByDegrees(snapToScale(n.pitch, mood), shift, mood);
        out.push({ ...n, pitch, start: b * 4 + n.start, dur: Math.min(n.dur, 4 - n.start) });
      }
    }
    return out;
  }
  return (Array.isArray(t.notes) ? t.notes : []).slice(0, 500).map(toNote).map(tidy)
    .filter((n) => n.start >= 0 && n.start < total && n.dur > 0)
    .map((n) => ({ ...n, dur: Math.min(n.dur, total - n.start), pitch: type === "drums" ? n.pitch : snapToScale(n.pitch, mood) }));
}

function clean(raw, req, mood, source) {
  const bars = req.bars || 4;
  if (!raw || !Array.isArray(raw.tracks)) throw new Error("reply has no tracks");
  const progression = Array.isArray(raw.progression) && raw.progression.length ? raw.progression.slice(0, 16) : [0];
  const tracks = raw.tracks.slice(0, 6).map((t, i) => {
    const type = TYPES.includes(t.type) ? t.type : "lead";
    const notes = expandTrack(t, type, mood, bars, progression).filter((n) => n.pitch >= 24 && n.pitch <= 108);
    return { id: `ai-${type}-${i}`, name: String(t.name || `AI ${type}`).slice(0, 24), type, source: "ai", notes };
  }).filter((t) => t.notes.length);
  if (!tracks.length) throw new Error("reply had no usable notes");
  const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : null);
  const palette = (Array.isArray(raw.palette) ? raw.palette : []).map(hex).filter(Boolean);
  const bar = (v) => Math.min(bars, Math.max(1, Math.round(Number(v)) || 1));
  return {
    source, tracks,
    title: String(raw.title || "Untitled Banger").slice(0, 40),
    palette: palette.length >= 2 ? palette.slice(0, 3) : ["#ff3d7f", "#7b2ff7", "#00e5ff"],
    vocalIdeas: (Array.isArray(raw.vocalIdeas) ? raw.vocalIdeas : []).slice(0, 3)
      .map((v, i) => ({ id: `v${i + 1}`, lyric: String(v.lyric || "").slice(0, 60), style: String(v.style || "").slice(0, 60), bar: bar(v.bar), reason: String(v.reason || "").slice(0, 120) }))
      .filter((v) => v.lyric),
    timelineTips: (Array.isArray(raw.timelineTips) ? raw.timelineTips : []).slice(0, 3)
      .map((t) => ({ bar: bar(t.bar), tip: String(t.tip || "").slice(0, 160), action: ACTIONS.includes(t.action) ? t.action : "none", track: TYPES.includes(t.track) ? t.track : "" }))
      .filter((t) => t.tip),
  };
}

// ---------- Models ----------
const b64 = (dataUrl) => (dataUrl || "").replace(/^data:image\/\w+;base64,/, "");

async function askOllama(prompt, req) {
  const url = process.env.OLLAMA_URL || "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL;
  if (!model) throw new Error("OLLAMA_MODEL not set");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Number(process.env.OLLAMA_TIMEOUT_MS) || 90000);
  try {
    const msg = { role: "user", content: prompt };
    if (req.screenshotPng) msg.images = [b64(req.screenshotPng)];
    const res = await fetch(`${url}/api/chat`, {
      method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [msg], stream: false, format: "json", options: { temperature: 0.8 } }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()).message?.content;
  } finally {
    clearTimeout(timer);
  }
}

let gemini = null, geminiModel = null;
/** Use GEMINI_MODEL if the API knows it, otherwise the best Gemma 4 model the key can see. */
async function resolveGeminiModel(ai) {
  if (geminiModel) return geminiModel;
  const wanted = (process.env.GEMINI_MODEL || "gemma-4-26b-a4b-it").replace(/^models\//, "");
  const names = [];
  try { for await (const m of await ai.models.list()) names.push(String(m.name).replace(/^models\//, "")); } catch { /* listing not allowed: trust the setting */ }
  if (!names.length || names.includes(wanted)) return (geminiModel = wanted);
  const gemma = names.filter((n) => /gemma/i.test(n));
  // Prefer small/fast Gemma 4 variants: e4b, then the 26B mixture-of-experts (only 4B active), then anything Gemma 4.
  const pick = gemma.find((n) => /gemma-4.*e4b/i.test(n)) || gemma.find((n) => /gemma-4.*a4b/i.test(n)) || gemma.find((n) => /gemma-4/i.test(n)) || gemma[0];
  if (!pick) throw new Error(`No Gemma model available to this key. Models: ${names.slice(0, 8).join(", ")}`);
  console.log(`[ai] GEMINI_MODEL "${wanted}" not found, using "${pick}"`);
  return (geminiModel = pick);
}

async function askGemini(prompt, req) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");
  const { GoogleGenAI } = require("@google/genai");
  gemini ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = await resolveGeminiModel(gemini);
  // Gemma models take everything in the user turn (no system prompt or JSON mode), so the prompt asks for JSON itself.
  const parts = [{ text: prompt }];
  if (req.screenshotPng) parts.unshift({ inlineData: { mimeType: "image/png", data: b64(req.screenshotPng) } });
  // Gemma 4 on the API "thinks" by default, which took ~3 minutes and used up the reply. Minimal thinking answers in seconds.
  const call = (config) => gemini.models.generateContent({ model, contents: [{ role: "user", parts }], config });
  let res;
  try { res = await call({ temperature: 0.8, maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: "minimal" } }); }
  catch (e) {
    if (!/thinking/i.test(e.message)) throw e;
    res = await call({ temperature: 0.8, maxOutputTokens: 4096 }); // model without thinking controls
  }
  if (!res.text) throw new Error(`empty reply (finish reason: ${res.candidates?.[0]?.finishReason || "unknown"})`);
  return res.text;
}

// ---------- Demo fallback ----------
function mockResult(req) {
  const bars = req.bars || 4;
  const n = (pitch, start, dur = 0.25, vel = 0.9) => ({ pitch, start, dur, vel });
  const drums = [], bass = [], pad = [];
  const roots = [45, 41, 48, 43];                      // Am F C G
  const chords = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
  for (let bar = 0; bar < bars; bar++) {
    for (let b = 0; b < 4; b++) {
      const beat = bar * 4 + b;
      drums.push(n(DRUM.kick, beat, 0.25, 1), n(DRUM.closedHat, beat + 0.5, 0.25, 0.6));
      if (b % 2 === 1) drums.push(n(DRUM.clap, beat));
      bass.push(n(roots[bar % 4], beat + 0.5, 0.4));
    }
    for (const p of chords[bar % 4]) pad.push(n(p, bar * 4, 4, 0.5));
  }
  const looks = { chill: ["#5ee6a8", "#3a86ff", "#1b6b8f"], dance: ["#ff3d7f", "#7b2ff7", "#00e5ff"], hype: ["#ff5400", "#ffbd00", "#ff0054"], dreamy: ["#cdb4db", "#ffc8dd", "#a2d2ff"] };
  const titles = { chill: "Sunday on the Canal", dance: "Midnight on Manningham Lane", hype: "Bradford Bounce", dreamy: "Clouds Over Ilkley" };
  return {
    source: "mock",
    title: titles[req.mood] || titles.dance,
    palette: looks[req.mood] || looks.dance,
    tracks: [
      { id: "ai-drums", name: "AI Drums", type: "drums", source: "ai", notes: drums },
      { id: "ai-bass", name: "AI Bass", type: "bass", source: "ai", notes: bass },
      { id: "ai-pad", name: "AI Pad", type: "pad", source: "ai", notes: pad },
    ],
    vocalIdeas: [
      { id: "v1", lyric: "Let's go!", style: "hype male shout", bar: 1, reason: "Big energy to open the drop" },
      { id: "v2", lyric: "Feel the night", style: "breathy female hook", bar: 3, reason: "Matches the minor chords" },
      { id: "v3", lyric: "Hey! Hey! Hey!", style: "crowd chant", bar: 4, reason: "Fills the gap before the loop restarts" },
    ],
    timelineTips: [
      { bar: 2, tip: "Your kick never stops. Drop it here and the next bar hits twice as hard.", action: "drop_kick", track: "" },
      { bar: bars, tip: "End the loop with a snare fill so it rolls back to bar 1.", action: "fill", track: "" },
      { bar: 3, tip: "Push the hats to 16ths here to lift the energy.", action: "more_hats", track: "" },
    ],
  };
}

// ---------- Main ----------
const cache = new Map();
const cacheKey = (req) => JSON.stringify([req.mood, req.bpm, req.bars, req.instruction || "", req.userNotes]);

/** @param {import("../shared/contracts.js").AiRequest} req @returns {Promise<import("../shared/contracts.js").AiResult>} */
async function produce(req) {
  const key = cacheKey(req);
  if (cache.has(key)) return { ...cache.get(key), note: "Same beat as last time, so the saved answer was reused (no credit used)." };

  const moods = await loadMoods();
  const mood = moods[req.mood] || moods.dance;
  const prompt = buildPrompt(req, mood);
  const problems = [];

  // 1) Local Gemma: free, so allow one retry on bad JSON.
  if (process.env.OLLAMA_MODEL) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = clean(extractJson(await askOllama(prompt, req)), req, mood, "ollama");
        cache.set(key, result);
        return result;
      } catch (e) {
        problems.push(`Local Gemma: ${e.message}`);
        if (/ECONNREFUSED|fetch failed|abort/i.test(e.message)) break; // not running or too slow: go to backup
      }
    }
  }

  // 2) Gemma via the Gemini API: costs credit, one call only.
  if (process.env.GEMINI_API_KEY) {
    try {
      const result = clean(extractJson(await askGemini(prompt, req)), req, mood, "gemini");
      cache.set(key, result);
      return result;
    } catch (e) {
      let msg = e.message;
      try { msg = JSON.parse(msg).error?.message || msg; } catch { /* not JSON */ }
      problems.push(`Gemini API: ${msg}`);
    }
  }

  // 3) Demo track.
  if (problems.length) console.log("[ai] falling back to demo:", problems.join(" | "));
  return { ...mockResult(req), note: problems.length ? `AI unavailable (${problems[problems.length - 1].slice(0, 140)}), so this is the demo track.` : "No AI connected yet (set OLLAMA_MODEL or GEMINI_API_KEY in .env), so this is the demo track." };
}

module.exports = { produce, mockResult, buildPrompt, clean, extractJson, moveByDegrees };

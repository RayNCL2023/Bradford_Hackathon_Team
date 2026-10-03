// VOCALS (main process side). Owner: Person 5.
// Export (keep this name): makeVocalClips(ideas, saveDir) -> VocalClip[]
// Turns the AI's vocal ideas into short audio clips with ElevenLabs, plus a sound effect when asked.
const fs = require("node:fs");
const path = require("node:path");

const API = "https://api.elevenlabs.io/v1";
const key = () => process.env.ELEVENLABS_API_KEY;
const headers = () => ({ "xi-api-key": key(), "Content-Type": "application/json" });

let voicesCache = null;

/** The account's voices, fetched once. */
async function listVoices() {
  if (voicesCache) return voicesCache;
  const res = await fetch(`${API}/voices`, { headers: headers() });
  if (!res.ok) throw new Error(await errorText(res));
  voicesCache = (await res.json()).voices || [];
  return voicesCache;
}

/** Pick a voice whose labels match the requested style ("breathy female hook" -> a female voice). */
function pickVoice(voices, style, index) {
  const s = style.toLowerCase();
  const want = /female|woman|girl|diva|her\b/.test(s) ? "female" : /male|man|guy|deep|mc|rapper|his\b/.test(s) ? "male" : null;
  const text = (v) => `${v.name} ${Object.values(v.labels || {}).join(" ")} ${v.description || ""}`.toLowerCase();
  let pool = want ? voices.filter((v) => (v.labels?.gender || "").toLowerCase() === want) : voices;
  if (!pool.length) pool = voices;
  const flavour = s.match(/breathy|soft|energetic|deep|raspy|young|warm|hype|calm|confident/g) || [];
  const scored = pool.map((v) => ({ v, score: flavour.filter((f) => text(v).includes(f)).length }));
  scored.sort((a, b) => b.score - a.score);
  const best = scored.filter((x) => x.score === scored[0].score);
  return best[index % best.length].v;
}

/** Add expressive audio tags for the v3 model based on the style. */
function performance(lyric, style) {
  const s = style.toLowerCase();
  const tag = /shout|hype|chant|crowd|energetic/.test(s) ? "[excited]"
    : /sing|hook|melod/.test(s) ? "[sings]"
    : /breathy|whisper|soft/.test(s) ? "[whispers]"
    : /laugh/.test(s) ? "[laughs]" : "";
  return tag ? `${tag} ${lyric}` : lyric;
}

async function errorText(res) {
  try { const j = await res.json(); return j.detail?.message || j.detail?.status || JSON.stringify(j.detail || j); }
  catch { return `HTTP ${res.status}`; }
}

/** Text to speech. Tries the expressive v3 model first, then multilingual v2. Returns an mp3 Buffer. */
async function speak(voiceId, lyric, style) {
  const attempts = [
    { model_id: "eleven_v3", text: performance(lyric, style) },
    { model_id: "eleven_multilingual_v2", text: lyric, voice_settings: { stability: 0.3, similarity_boost: 0.8, style: 0.7 } },
  ];
  let lastErr;
  for (const body of attempts) {
    const res = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    lastErr = await errorText(res);
    if (res.status === 401) break; // bad key: no point retrying
  }
  throw new Error(lastErr);
}

/** Sound effect from a text prompt ("riser build-up", "crowd cheering"). Returns an mp3 Buffer. */
async function soundEffect(prompt, seconds = 3) {
  const res = await fetch(`${API}/sound-generation`, { method: "POST", headers: headers(), body: JSON.stringify({ text: prompt, duration_seconds: seconds, prompt_influence: 0.6 }) });
  if (!res.ok) throw new Error(await errorText(res));
  return Buffer.from(await res.arrayBuffer());
}

// Ideas whose style asks for an effect, not a voice.
const isEffect = (style) => /\b(sfx|sound effect|riser|sweep|impact|crowd noise|cheer|drop fx)\b/i.test(style);

function save(buf, saveDir, name) {
  const dir = path.join(saveDir, "vocals");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${Date.now()}.mp3`);
  fs.writeFileSync(file, buf);
  // Data URL so the page can play and load it into Tone.js without file:// fetch restrictions.
  return { file, url: `data:audio/mpeg;base64,${buf.toString("base64")}` };
}

/**
 * @param {import("../shared/contracts.js").VocalIdea[]} ideas
 * @param {string} saveDir
 * @returns {Promise<import("../shared/contracts.js").VocalClip[]>}
 */
async function makeVocalClips(ideas, saveDir) {
  const empty = (v, error) => ({ id: `clip-${v.id}`, ideaId: v.id, lyric: v.lyric, url: "", reason: v.reason, error });
  if (!key()) return ideas.map((v) => empty(v, "Add ELEVENLABS_API_KEY to .env to make audio"));

  let voices = [];
  try { voices = await listVoices(); } catch (e) { return ideas.map((v) => empty(v, e.message)); }

  // All clips in parallel so the panel fills quickly.
  return Promise.all(ideas.map(async (v, i) => {
    try {
      const buf = isEffect(v.style)
        ? await soundEffect(`${v.lyric}, ${v.style}, for a dance track`)
        : await speak(pickVoice(voices, v.style, i).voice_id, v.lyric, v.style);
      const { file, url } = save(buf, saveDir, v.id);
      return { id: `clip-${v.id}`, ideaId: v.id, lyric: v.lyric, url, file, reason: v.reason };
    } catch (e) {
      return empty(v, e.message);
    }
  }));
}

module.exports = { makeVocalClips, soundEffect, pickVoice, performance };

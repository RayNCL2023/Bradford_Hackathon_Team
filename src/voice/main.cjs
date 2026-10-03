// VOCALS (main process side). Owner: Person 5.
// Export (keep this name): makeVocalClips(ideas, saveDir) -> VocalClip[]
// Turns the AI's vocal ideas into short audio clips with ElevenLabs, plus a sound effect when asked.
//
// CREDIT SAVING (ElevenLabs bills per character / per second of sound effect):
// - Clips are only made when the user clicks "Make clip" (the page asks for one idea at a time).
// - Same lyric + style = the saved mp3 is reused, never paid for twice (cache in saveDir/vocals/cache).
// - Hard caps per app session: ELEVENLABS_MAX_CHARS (default 600) and ELEVENLABS_MAX_SFX (default 3).
// - ELEVENLABS_MOCK=1 makes a free beep instead of calling the API (use it while building the UI).
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const API = "https://api.elevenlabs.io/v1";
const key = () => process.env.ELEVENLABS_API_KEY;
const headers = () => ({ "xi-api-key": key(), "Content-Type": "application/json" });

let voicesCache = null;
const spent = { chars: 0, sfx: 0 };
const maxChars = () => Number(process.env.ELEVENLABS_MAX_CHARS) || 600;
const maxSfx = () => Number(process.env.ELEVENLABS_MAX_SFX ?? 3);
const mock = () => process.env.ELEVENLABS_MOCK === "1";
const SFX_SECONDS = 2;

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
  if (!voices?.length) throw new Error("No voices found on this ElevenLabs account.");
  const s = String(style || "").toLowerCase();
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
async function soundEffect(prompt, seconds = SFX_SECONDS) {
  const res = await fetch(`${API}/sound-generation`, { method: "POST", headers: headers(), body: JSON.stringify({ text: prompt, duration_seconds: seconds, prompt_influence: 0.6 }) });
  if (!res.ok) throw new Error(await errorText(res));
  return Buffer.from(await res.arrayBuffer());
}

// Ideas whose style asks for an effect, not a voice.
const isEffect = (style) => /\b(sfx|sound effect|riser|sweep|impact|crowd noise|cheer|drop fx)\b/i.test(style);

const cacheFile = (saveDir, idea) => {
  const dir = path.join(saveDir, "vocals", "cache");
  fs.mkdirSync(dir, { recursive: true });
  const hash = crypto.createHash("sha1").update(`${idea.lyric.trim().toLowerCase()}|${idea.style.trim().toLowerCase()}`).digest("hex").slice(0, 16);
  return path.join(dir, `${hash}.mp3`);
};
// Data URL so the page can play and load it into Tone.js without file:// fetch restrictions.
const toUrl = (buf, mime = "audio/mpeg") => `data:${mime};base64,${buf.toString("base64")}`;

/** A free 0.4 s beep as a WAV, used in mock mode. */
function beepWav() {
  const rate = 22050, n = Math.floor(rate * 0.4), data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 660) * 8000 * (1 - i / n)), i * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVEfmt ", 8); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

/**
 * Make clips for the given ideas. The page calls this with ONE idea per "Make clip" click.
 * @param {import("../shared/contracts.js").VocalIdea[]} ideas
 * @param {string} saveDir
 * @returns {Promise<import("../shared/contracts.js").VocalClip[]>}
 */
async function makeVocalClips(ideas, saveDir) {
  // Ideas come from the AI: never trust lyric/style to be strings.
  ideas = (Array.isArray(ideas) ? ideas : []).map((v) => ({ ...v, lyric: String(v?.lyric ?? "").trim() || "Hey", style: String(v?.style ?? "") }));
  const base = (v) => ({ id: `clip-${v.id}`, ideaId: v.id, lyric: v.lyric, reason: v.reason });
  const empty = (v, error) => ({ ...base(v), url: "", error });

  if (mock()) return ideas.map((v) => ({ ...base(v), url: toUrl(beepWav(), "audio/wav"), note: "Test beep (ELEVENLABS_MOCK=1, no credit used)" }));

  // Free first: anything already made is reused from the cache.
  const todo = [];
  const out = ideas.map((v) => {
    const f = cacheFile(saveDir, v);
    if (fs.existsSync(f)) return { ...base(v), url: toUrl(fs.readFileSync(f)), file: f, note: "Reused saved clip (no credit used)" };
    todo.push(v);
    return null;
  });
  if (!todo.length) return out;
  if (!key()) return out.map((c, i) => c || empty(ideas[i], "Add ELEVENLABS_API_KEY to .env to make audio"));

  let voices = [];
  try { voices = await listVoices(); } catch (e) { return out.map((c, i) => c || empty(ideas[i], e.message)); }

  for (let i = 0; i < ideas.length; i++) {
    if (out[i]) continue;
    const v = ideas[i];
    const sfx = isEffect(v.style);
    if (sfx && spent.sfx >= maxSfx()) { out[i] = empty(v, `Sound-effect limit reached (${maxSfx()} this session). Raise ELEVENLABS_MAX_SFX to allow more.`); continue; }
    if (!sfx && spent.chars + Math.min(80, v.lyric.length) > maxChars()) { out[i] = empty(v, `Credit cap reached (${maxChars()} characters this session). Raise ELEVENLABS_MAX_CHARS to allow more.`); continue; }
    try {
      const buf = sfx
        ? await soundEffect(`${v.lyric}, ${v.style}, for a dance track`)
        : await speak(pickVoice(voices, v.style, i).voice_id, v.lyric.slice(0, 80), v.style);
      if (sfx) spent.sfx++; else spent.chars += Math.min(80, v.lyric.length);
      const f = cacheFile(saveDir, v);
      fs.writeFileSync(f, buf);
      out[i] = { ...base(v), url: toUrl(buf), file: f, note: sfx ? `Sound effect (${spent.sfx}/${maxSfx()} this session)` : `${spent.chars}/${maxChars()} characters used this session` };
    } catch (e) {
      out[i] = empty(v, e.message);
    }
  }
  return out;
}

/** What has been spent this session, for showing in the UI. */
function usage() { return { chars: spent.chars, maxChars: maxChars(), sfx: spent.sfx, maxSfx: maxSfx(), mock: mock() }; }

// ---------- Your own ad-libs ----------
// A recording is re-voiced with ElevenLabs speech-to-speech (keeps your timing and delivery, swaps the voice);
// a typed line is spoken in the chosen style. Capped: 5 s per recording, ELEVENLABS_MAX_STS conversions per session.
const maxSts = () => Number(process.env.ELEVENLABS_MAX_STS ?? 3);
spent.sts = 0;
let adlibCount = 0;

async function speechToSpeech(voiceId, audio, mime) {
  const form = new FormData();
  form.append("audio", new Blob([audio], { type: mime || "audio/webm" }), "adlib.webm");
  form.append("model_id", "eleven_multilingual_sts_v2");
  form.append("remove_background_noise", "true");
  const res = await fetch(`${API}/speech-to-speech/${voiceId}?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": key() }, body: form });
  if (!res.ok) throw new Error(await errorText(res));
  return Buffer.from(await res.arrayBuffer());
}

/**
 * @param {{ text?:string, audio?:Uint8Array, mime?:string, style:string, seconds?:number }} req
 * @param {string} saveDir
 * @returns {Promise<import("../shared/contracts.js").VocalClip>}
 */
async function makeAdlib(req, saveDir) {
  req = req || {};
  const style = String(req.style || "hype shout").slice(0, 60);
  const lyric = String(req.text || "").trim().slice(0, 80) || "Your ad-lib";
  const id = `adlib-${Date.now()}-${++adlibCount}`;
  const base = { id, ideaId: id, lyric, reason: `Your ad-lib, voiced as ${style}` };
  if (mock()) return { ...base, url: toUrl(beepWav(), "audio/wav"), note: "Test beep (ELEVENLABS_MOCK=1, no credit used)" };
  if (!key()) return { ...base, url: "", error: "Add ELEVENLABS_API_KEY to .env to make audio" };

  if (!req.audio) {
    // Typed line: same path as the AI's ideas (cached by lyric + style, character cap applies).
    const [clip] = await makeVocalClips([{ id, lyric, style, bar: 1, reason: base.reason }], saveDir);
    return { ...clip, id, ideaId: id, reason: base.reason };
  }
  if ((req.seconds || 0) > 5.5) return { ...base, url: "", error: "Keep recordings under 5 seconds." };
  if (spent.sts >= maxSts()) return { ...base, url: "", error: `Recording limit reached (${maxSts()} this session). Raise ELEVENLABS_MAX_STS to allow more.` };
  try {
    const voices = await listVoices();
    const buf = await speechToSpeech(pickVoice(voices, style, 0).voice_id, Buffer.from(req.audio), req.mime);
    spent.sts++;
    const dir = path.join(saveDir, "vocals");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${id}.mp3`);
    fs.writeFileSync(file, buf);
    return { ...base, lyric: req.text?.trim() || "Your recording", url: toUrl(buf), file, note: `Re-voiced by ElevenLabs (${spent.sts}/${maxSts()} recordings this session)` };
  } catch (e) {
    return { ...base, url: "", error: e.message };
  }
}

module.exports = { makeVocalClips, makeAdlib, soundEffect, pickVoice, performance, usage };

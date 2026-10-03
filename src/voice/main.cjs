// VOCALS (main process side). Owner: Person 5.
// Export (keep this name): makeVocalClips(ideas, saveDir) -> VocalClip[]
// TODO Person 5: call the ElevenLabs API here with process.env.ELEVENLABS_API_KEY,
// save each clip as an .mp3 in saveDir, and return its file:// URL.
// Starter version: returns clips with an empty url (the panel shows a "needs key" message).

async function makeVocalClips(ideas, saveDir) {
  if (!process.env.ELEVENLABS_API_KEY) {
    return ideas.map((v) => ({ id: `clip-${v.id}`, ideaId: v.id, lyric: v.lyric, url: "", reason: v.reason }));
  }
  // TODO: real ElevenLabs call per idea (text = v.lyric, voice/settings chosen from v.style).
  return ideas.map((v) => ({ id: `clip-${v.id}`, ideaId: v.id, lyric: v.lyric, url: "", reason: v.reason }));
}

module.exports = { makeVocalClips };

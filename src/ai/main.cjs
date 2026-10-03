// AI PRODUCER (main process). Owner: Person 4.
// Export (keep this name): produce(AiRequest) -> AiResult   (shapes in src/shared/contracts.js)
// TODO Person 4: 1) call local Gemma via Ollama, 2) fall back to the Gemini API, 3) validate the JSON.
// Starter version: returns a fixed mock backing track after a short delay, so the app works end to end.

const DRUM = { kick: 36, clap: 39, closedHat: 42 };

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
  const looks = { chill: ["#5ee6a8", "#3a86ff", "#1b2a49"], dance: ["#ff3d7f", "#7b2ff7", "#00e5ff"], hype: ["#ff5400", "#ffbd00", "#ff0054"], dreamy: ["#cdb4db", "#ffc8dd", "#a2d2ff"] };
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
      { id: "v1", lyric: "Let's go!", style: "hype shout", bar: 1, reason: "Big energy to open the drop" },
      { id: "v2", lyric: "Feel the night", style: "breathy female hook", bar: 3, reason: "Matches the minor chords" },
      { id: "v3", lyric: "Hey! Hey! Hey!", style: "crowd chant", bar: 4, reason: "Fills the gap before the loop restarts" },
    ],
    timelineTips: [
      { bar: 2, tip: "Drop the kick for 2 beats here to build tension" },
      { bar: bars, tip: "Add a riser leading back to bar 1" },
    ],
  };
}

async function produce(req) {
  // TODO: try Ollama (process.env.OLLAMA_URL, process.env.OLLAMA_MODEL) with req.screenshotPng + req.userNotes,
  // then Gemini (process.env.GEMINI_API_KEY) on failure. Use mockResult only when both are unavailable.
  await new Promise((r) => setTimeout(r, 700));
  return mockResult(req);
}

module.exports = { produce, mockResult };

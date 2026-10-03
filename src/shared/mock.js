// Fake data so every module can be built and tested alone. Owner: Person 1.
import { DRUM_PITCH } from "./contracts.js";

const n = (pitch, start, dur = 0.25, vel = 0.9) => ({ pitch, start, dur, vel });

// A simple 4-bar user beat in A minor (A C E G riff).
export const MOCK_USER_NOTES = [0, 4, 8, 12].flatMap((bar) => [
  n(69, bar, 0.5), n(72, bar + 0.75, 0.25), n(76, bar + 1.5, 0.5), n(74, bar + 2.5, 0.25), n(72, bar + 3, 0.5),
]);

const drums = [];
for (let b = 0; b < 16; b++) {
  drums.push(n(DRUM_PITCH.kick, b, 0.25, 1));
  drums.push(n(DRUM_PITCH.closedHat, b + 0.5, 0.25, 0.6));
  if (b % 2 === 1) drums.push(n(DRUM_PITCH.clap, b, 0.25, 0.9));
}

// Am - F - C - G
const roots = [45, 41, 48, 43];
const bass = roots.flatMap((r, bar) => [0.5, 1.5, 2.5, 3.5].map((o) => n(r, bar * 4 + o, 0.4, 0.9)));
const chords = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
const pad = chords.flatMap((c, bar) => c.map((p) => n(p, bar * 4, 4, 0.5)));

/** @type {import("./contracts.js").AiResult} */
export const MOCK_AI_RESULT = {
  source: "mock",
  title: "Midnight on Manningham Lane",
  palette: ["#ff3d7f", "#7b2ff7", "#00e5ff"],
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
    { bar: 4, tip: "Add a riser leading back to bar 1" },
  ],
};

/** @type {import("./contracts.js").Project} */
export const MOCK_PROJECT = {
  bpm: 128,
  bars: 4,
  clips: [],
  tracks: [
    { id: "user", name: "Your Beat", type: "keys", source: "user", notes: MOCK_USER_NOTES },
    ...MOCK_AI_RESULT.tracks,
  ],
};

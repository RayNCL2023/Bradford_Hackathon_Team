// THE CONTRACT. Data shapes passed between modules. Owner: Person 1. Only Person 1 edits this file.
// Time is always measured in BEATS (quarter notes) from the start of the song. Bar 1 = beats 0-3.

/**
 * @typedef {Object} Note
 * @property {number} pitch  MIDI note 0-127 (60 = middle C). Drums use DRUM_PITCH below.
 * @property {number} start  Start time in beats (0 = start of bar 1). Snap to 0.25 (a 16th).
 * @property {number} dur    Length in beats (> 0).
 * @property {number} vel    Velocity 0-1.
 */

/**
 * @typedef {Object} Track
 * @property {string} id
 * @property {string} name
 * @property {TrackType} type
 * @property {Note[]} notes
 * @property {boolean} [muted]
 * @property {number} [volume]  0-1, default 0.8
 * @property {"user"|"ai"} source
 */

/** @typedef {"keys"|"drums"|"bass"|"lead"|"pad"|"pluck"} TrackType */

/**
 * @typedef {Object} Clip   An audio sample on the timeline (e.g. an ElevenLabs vocal)
 * @property {string} id
 * @property {string} name
 * @property {string} url       file:// URL of the audio file
 * @property {number} startBeat
 */

/**
 * @typedef {Object} Project
 * @property {number} bpm
 * @property {number} bars        Loop length in bars (4/4 time)
 * @property {Track[]} tracks
 * @property {Clip[]} clips
 */

/**
 * @typedef {Object} AiRequest   What the shell sends to the AI producer
 * @property {number} bpm
 * @property {number} bars
 * @property {Note[]} userNotes      The beat the user played
 * @property {string} screenshotPng  data:image/png;base64,... of the piano roll
 * @property {Mood} mood             The vibe the user picked
 * @property {string} [instruction]  Optional, e.g. "make it darker"
 */

/** @typedef {"chill"|"dance"|"hype"|"dreamy"} Mood */

/**
 * @typedef {Object} VocalIdea
 * @property {string} id
 * @property {string} lyric   Short: an ad-lib, hook or chant ("Let's go!", "Feel the night")
 * @property {string} style   How to deliver it ("hype shout", "breathy female hook")
 * @property {number} bar     Suggested bar to drop it in (1-based)
 * @property {string} reason  One line on why it fits
 */

/**
 * @typedef {Object} TimelineTip
 * @property {number} bar     1-based
 * @property {string} tip
 */

/**
 * @typedef {Object} AiResult   What the AI producer returns
 * @property {Track[]} tracks           New backing tracks (source: "ai")
 * @property {VocalIdea[]} vocalIdeas   2-3 ideas
 * @property {TimelineTip[]} timelineTips
 * @property {string} title            A catchy song name the AI invents
 * @property {string[]} palette         3 hex colours for the visuals, e.g. ["#ff3d7f","#7b2ff7","#00e5ff"]
 * @property {"ollama"|"gemini"|"mock"} source  Which model answered
 * @property {string} [note]            Extra info for the status bar (fallbacks, reused answers)
 */

/**
 * @typedef {Object} VocalClip   What the vocals module returns per idea
 * @property {string} id
 * @property {string} ideaId
 * @property {string} lyric
 * @property {string} url    Playable URL (data:audio/mpeg;base64,...), or "" if generation failed
 * @property {string} reason
 * @property {string} [file]   Where the mp3 was saved on disk
 * @property {string} [error]  Why it failed, shown to the user
 */

export const TRACK_TYPES = ["keys", "drums", "bass", "lead", "pad", "pluck"];

// General MIDI drum map, used by drum tracks.
export const DRUM_PITCH = { kick: 36, snare: 38, clap: 39, closedHat: 42, openHat: 46, crash: 49 };

export const TRACK_COLORS = {
  keys: "#ff5c8a",
  drums: "#ffb547",
  bass: "#4cc9f0",
  lead: "#b388ff",
  pad: "#5ee6a8",
  pluck: "#f9f871",
};

export const BEATS_PER_BAR = 4;

// Moods replace music jargon for beginners. Each sets a BPM and a scale so every key sounds good.
export const MOODS = {
  chill:  { label: "Chill",  bpm: 90,  root: 57, scale: [0, 3, 5, 7, 10],       key: "A minor" },
  dance:  { label: "Dance",  bpm: 124, root: 57, scale: [0, 2, 3, 5, 7, 8, 10], key: "A minor" },
  hype:   { label: "Hype",   bpm: 140, root: 52, scale: [0, 3, 5, 6, 7, 10],    key: "E minor" },
  dreamy: { label: "Dreamy", bpm: 100, root: 60, scale: [0, 2, 4, 7, 9],        key: "C major" },
};

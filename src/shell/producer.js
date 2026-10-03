// PRODUCER ACTIONS: what "Apply" does on a producer note, and "Arrange my beat". Owner: Person 1.
// Each function edits the project in place and returns a short sentence describing what changed.
import { DRUM_PITCH } from "../shared/contracts.js";

const drumTrack = (project) => project.tracks.find((t) => t.type === "drums" && t.source === "ai") || project.tracks.find((t) => t.type === "drums");
const inBar = (n, bar) => n.start >= (bar - 1) * 4 && n.start < bar * 4;

export const ACTION_LABELS = {
  drop_kick: "Drop the kick",
  add_crash: "Add a crash",
  fill: "Snare fill",
  more_hats: "16th hats",
  octave_up: "Up an octave",
  octave_down: "Down an octave",
  thin_bass: "Remove bass",
};

/**
 * @param {import("../shared/contracts.js").Project} project
 * @param {{action:string, bar:number, track?:string}} tip
 * @returns {string} what changed ("" if nothing could be done)
 */
export function applyTip(project, tip) {
  const bar = Math.min(project.bars, Math.max(1, tip.bar || 1));
  const start = (bar - 1) * 4;
  const drums = drumTrack(project);
  switch (tip.action) {
    case "drop_kick": {
      if (!drums) return "";
      const before = drums.notes.length;
      drums.notes = drums.notes.filter((n) => !(n.pitch === DRUM_PITCH.kick && inBar(n, bar)));
      return before !== drums.notes.length ? `Took the kick out of bar ${bar}.` : "";
    }
    case "add_crash": {
      if (!drums) return "";
      drums.notes.push({ pitch: DRUM_PITCH.crash, start, dur: 1, vel: 0.9 });
      return `Added a crash at the start of bar ${bar}.`;
    }
    case "fill": {
      if (!drums) return "";
      drums.notes = drums.notes.filter((n) => !(n.start >= start + 3 && n.start < start + 4 && n.pitch !== DRUM_PITCH.kick));
      for (let i = 0; i < 4; i++) drums.notes.push({ pitch: DRUM_PITCH.snare, start: start + 3 + i * 0.25, dur: 0.25, vel: 0.6 + i * 0.12 });
      return `Added a snare fill at the end of bar ${bar}.`;
    }
    case "more_hats": {
      if (!drums) return "";
      drums.notes = drums.notes.filter((n) => !(n.pitch === DRUM_PITCH.closedHat && inBar(n, bar)));
      for (let i = 0; i < 16; i++) drums.notes.push({ pitch: DRUM_PITCH.closedHat, start: start + i * 0.25, dur: 0.25, vel: i % 2 ? 0.45 : 0.7 });
      return `Pushed the hats to 16ths in bar ${bar}.`;
    }
    case "octave_up":
    case "octave_down": {
      const t = project.tracks.find((x) => x.type === tip.track && x.type !== "drums") || project.tracks.find((x) => x.source === "ai" && x.type !== "drums" && x.type !== "bass");
      if (!t) return "";
      const shift = tip.action === "octave_up" ? 12 : -12;
      t.notes = t.notes.map((n) => ({ ...n, pitch: Math.min(100, Math.max(28, n.pitch + shift)) }));
      return `Moved ${t.name} ${tip.action === "octave_up" ? "up" : "down"} an octave.`;
    }
    case "thin_bass": {
      const bass = project.tracks.find((x) => x.type === "bass");
      if (!bass) return "";
      bass.notes = bass.notes.filter((n) => !inBar(n, bar));
      return `Cleared the bass in bar ${bar} to make room.`;
    }
    default:
      return "";
  }
}

/**
 * Arrange my beat: turn the 4-bar loop into 8 bars with an intro and a drop.
 * Bars 1-2: intro (no kick, no bass). Bar 4: snare fill. Bar 5: crash into the full drop.
 * @returns {string}
 */
export function arrange(project) {
  if (project.bars >= 8) return "";
  const len = project.bars * 4;
  for (const t of project.tracks) {
    // Only the notes inside the current loop (a shorter loop can leave notes past its end).
    const inside = t.notes.filter((n) => n.start < len);
    const copy = inside.map((n) => ({ ...n, start: n.start + len }));
    let first = inside;
    if (t.source === "ai") {
      // Intro: strip the kick and bass from the first two bars so the drop lands.
      if (t.type === "bass") first = first.filter((n) => n.start >= 8);
      if (t.type === "drums") first = first.filter((n) => !(n.pitch === DRUM_PITCH.kick && n.start < 8));
    }
    t.notes = [...first, ...copy];
  }
  project.bars *= 2;
  applyTip(project, { action: "fill", bar: project.bars / 2 });
  applyTip(project, { action: "add_crash", bar: project.bars / 2 + 1 });
  return `Arranged to ${project.bars} bars: a stripped-back intro, a fill in bar ${project.bars / 2}, and a crash into the drop at bar ${project.bars / 2 + 1}.`;
}

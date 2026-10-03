// `npm run check`: syntax-checks every JS file and makes sure each module still exports its contract.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "out", "dist"].includes(f.name)) continue;
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p);
    else if (/\.(c|m)?js$/.test(f.name)) files.push(p);
  }
})(root);

let failed = 0;
for (const f of files) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (e) {
    failed++;
    console.error(`✗ ${path.relative(root, f)}\n${e.stderr}`);
  }
}

// Each module must keep exporting the functions other modules rely on.
const REQUIRED = {
  "src/pianoroll/index.js": ["mount", "getNotes", "setTracks", "screenshot", "setPlayhead", "setMood", "clear", "hit", "setLength"],
  "src/audio/index.js": ["init", "loadProject", "play", "stop", "setBpm", "playNote", "getBeat", "addClip", "updateClip", "previewClip", "onNote", "getSpectrum", "TONES"],
  "src/voice/index.js": ["mountPanel", "showResult"],
  "src/visuals/index.js": ["mount", "setPalette", "pulse", "setTitle", "setTracks", "setMeta", "noteOn", "beat", "setSpectrumSource", "setClock", "setCooking"],
};
for (const [file, names] of Object.entries(REQUIRED)) {
  const src = fs.readFileSync(path.join(root, file), "utf8");
  for (const n of names) {
    if (!new RegExp(`export\\s+(async\\s+)?(function|const|let)\\s+${n}\\b`).test(src)) {
      failed++;
      console.error(`✗ ${file} no longer exports ${n}()`);
    }
  }
}
const REQUIRED_CJS = { "src/ai/main.cjs": ["produce"], "src/voice/main.cjs": ["makeVocalClips"] };
for (const [file, names] of Object.entries(REQUIRED_CJS)) {
  const mod = (await import("node:module")).createRequire(import.meta.url)(path.join(root, file));
  for (const n of names) if (typeof mod[n] !== "function") { failed++; console.error(`✗ ${file} no longer exports ${n}()`); }
}

if (failed) { console.error(`\n${failed} problem(s). Fix before merging.`); process.exit(1); }
console.log(`✓ ${files.length} files OK, all module contracts present.`);

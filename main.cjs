// Electron main process. Owner: Person 1 (shell).
// AI and ElevenLabs calls run here so API keys never reach the page.
const { app, BrowserWindow, ipcMain, protocol, net } = require("electron");
const { pathToFileURL } = require("node:url");

// Sample packs live in ./samples (any folder layout). Served to the page as sample://<path> so Tone.js can fetch them.
protocol.registerSchemesAsPrivileged([{ scheme: "sample", privileges: { standard: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const path = require("node:path");
const fs = require("node:fs");

// Load .env (KEY=VALUE lines) without extra packages.
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const ai = require("./src/ai/main.cjs");
const voice = require("./src/voice/main.cjs");
const { startRemote } = require("./src/remote/server.cjs");

// Phone pads: notes from the phone go straight to the studio window.
const toWindow = (channel, data) => BrowserWindow.getAllWindows()[0]?.webContents.send(channel, data);
const remote = startRemote({
  onMessage: (m) => { if (process.env.REMOTE_LOG) console.log("[remote] in:", JSON.stringify(m)); toWindow("remote:msg", m); },
  onClients: (n) => { if (process.env.REMOTE_LOG) console.log("[remote] phones:", n); toWindow("remote:clients", n); },
});
ipcMain.handle("remote:info", () => remote.info());
ipcMain.on("remote:state", (_e, s) => remote.broadcast(s));
ipcMain.on("remote:beat", (_e, n) => remote.send({ type: "beat", n }));

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: "#0c0e14",
    title: "AI Beat Studio",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, "src/shell/index.html"));
  // Page errors show in the terminal too, so AI agents can see them.
  win.webContents.on("console-message", (e) => {
    if (e.level === "error" || e.level === "warning") console.log(`[page] ${e.message}`);
  });
}

// SMOKE=1 npm start: drives the app automatically (no paid calls), saves a screenshot, logs errors, quits.
if (process.env.SMOKE) {
  app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
  app.whenReady().then(() => setTimeout(async () => {
    const win = BrowserWindow.getAllWindows()[0];
    const js = (code) => win.webContents.executeJavaScript(code, true);
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const key = (k) => js(`window.dispatchEvent(new KeyboardEvent("keydown",{key:"${k}"})); window.dispatchEvent(new KeyboardEvent("keyup",{key:"${k}"}))`);
    try {
      await js(`document.querySelector('[data-mood="hype"]').click(); document.getElementById("rec").click()`);
      for (const k of "asdfgasdhj") { await key(k); await wait(180); }
      await js(`document.getElementById("produce").click()`);
      for (let i = 0; i < 60 && !(await js(`!!document.querySelector('[data-act="make"]')`)); i++) await wait(1000);
      await js(`document.querySelector('[data-act="make"]')?.click()`);
      for (let i = 0; i < 30 && !(await js(`!!document.querySelector('[data-fx="pitch"]')`)); i++) await wait(500);
      await js(`document.querySelector('.tone[data-tone="robot"]')?.click(); document.querySelector('[data-fx="pitch"]').value = 5; document.querySelector('[data-fx="pitch"]').dispatchEvent(new Event("change")); document.querySelector('[data-act="add"]')?.click()`);
      await wait(1500);
      // v2 producer features: apply a note, arrange, open the channel rack and add a step.
      await js(`document.querySelector('[data-apply]')?.click()`);
      await wait(300);
      await js(`document.getElementById("arrange")?.click()`);
      await wait(300);
      await js(`document.getElementById("tab-rack")?.click(); document.querySelector('.step[data-pitch="39"][data-step="4"]')?.click()`);
      console.log("[smoke] after v2:", await js(`JSON.stringify({ bars: document.getElementById("lcdBars").textContent, notes: document.getElementById("notesCount").textContent, done: [...document.querySelectorAll('.note.done')].map(n => n.textContent.trim()), steps: document.querySelectorAll('.step.on').length })`));
      // Sample pack (only if one is in ./samples): load the kit and add a loop.
      if (await js(`!!document.getElementById("useKit")`)) {
        await js(`document.getElementById("useKit").click()`);
        await wait(1500);
        console.log("[smoke] kit:", await js(`document.getElementById("status").textContent`));
        await js(`document.querySelector('[data-addloop]')?.click()`);
        await wait(1500);
        console.log("[smoke] loop:", await js(`document.getElementById("status").textContent`));
      }
      await wait(2500);
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.SMOKE_SHOT || path.join(app.getPath("temp"), "beat-smoke.png"), img.toPNG());
      console.log("[smoke] status:", await js(`document.getElementById("status").textContent`));
      console.log("[smoke] panel:", (await js(`document.getElementById("panel").innerText`)).replace(/\s+/g, " ").slice(0, 300));
    } catch (e) { console.log("[smoke] FAILED:", e.message); }
    app.quit();
  }, 2500));
}

ipcMain.handle("ai:produce", (_e, req) => ai.produce(req));
// Producer memory (NMAFC): events in, facts out.
ipcMain.on("memory:remember", (_e, text) => ai.memory.remember(text));
ipcMain.handle("memory:list", () => ai.memory.list());
ai.memory.onStored((r) => BrowserWindow.getAllWindows()[0]?.webContents.send("memory:stored", r));
ipcMain.handle("voice:clips", (_e, ideas) => voice.makeVocalClips(ideas, app.getPath("userData")));
ipcMain.handle("voice:adlib", (_e, req) => voice.makeAdlib(req, app.getPath("userData")));

const SAMPLE_DIR = path.join(__dirname, "samples");
const AUDIO_EXT = /\.(wav|mp3|ogg|flac|aif|aiff|m4a)$/i;
/** Guess what a sample is from its file and folder names. */
function categorise(rel) {
  const s = rel.toLowerCase().replace(/[\\_\-.]/g, " ");
  if (/\bloops?\b|\bamen|\bbreaks?\b|breakbeat/.test(s)) return "loop";
  if (/open ?h(i ?)?hat|\bohh?\b|open hat/.test(s)) return "openHat";
  if (/h(i ?)?hat|\bhh\b|\bchh?\b/.test(s)) return "hat";
  if (/kick|\bbd\b|bass ?drum/.test(s)) return "kick";
  if (/snare|\bsd\b|\brim/.test(s)) return "snare";
  if (/clap|\bcp\b/.test(s)) return "clap";
  if (/crash|cymbal|\bride\b/.test(s)) return "crash";
  if (/808|\bbass\b|sub/.test(s)) return "bass";
  if (/vox|vocal|voice|chant|adlib/.test(s)) return "vocal";
  if (/perc|tom|shaker|conga|bongo|tamb/.test(s)) return "perc";
  if (/fx|riser|sweep|impact|noise|uplifter|downlifter/.test(s)) return "fx";
  return "other";
}
ipcMain.handle("samples:list", () => {
  if (!fs.existsSync(SAMPLE_DIR)) return { dir: SAMPLE_DIR, samples: [] };
  const out = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (AUDIO_EXT.test(f.name) && out.length < 2000) {
        const rel = path.relative(SAMPLE_DIR, p).split(path.sep).join("/");
        const bpm = Number((rel.match(/(\d{2,3})\s?bpm/i) || [])[1]) || null;
        out.push({ rel, name: f.name.replace(AUDIO_EXT, ""), folder: path.dirname(rel), category: categorise(rel), bpm, url: "sample://pack/" + rel.split("/").map(encodeURIComponent).join("/") });
      }
    }
  })(SAMPLE_DIR);
  return { dir: SAMPLE_DIR, samples: out };
});

app.whenReady().then(() => {
  protocol.handle("sample", (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, "");
    const file = path.join(SAMPLE_DIR, rel);
    if (!file.startsWith(SAMPLE_DIR) || !fs.existsSync(file)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());

// Electron main process. Owner: Person 1 (shell).
// AI and ElevenLabs calls run here so API keys never reach the page.
const { app, BrowserWindow, ipcMain } = require("electron");
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
      await wait(4000);
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.SMOKE_SHOT || path.join(app.getPath("temp"), "beat-smoke.png"), img.toPNG());
      console.log("[smoke] status:", await js(`document.getElementById("status").textContent`));
      console.log("[smoke] panel:", (await js(`document.getElementById("panel").innerText`)).replace(/\s+/g, " ").slice(0, 300));
    } catch (e) { console.log("[smoke] FAILED:", e.message); }
    app.quit();
  }, 2500));
}

ipcMain.handle("ai:produce", (_e, req) => ai.produce(req));
ipcMain.handle("voice:clips", (_e, ideas) => voice.makeVocalClips(ideas, app.getPath("userData")));

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());

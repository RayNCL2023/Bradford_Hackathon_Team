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
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
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

ipcMain.handle("ai:produce", (_e, req) => ai.produce(req));
ipcMain.handle("voice:clips", (_e, ideas) => voice.makeVocalClips(ideas, app.getPath("userData")));

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});
app.on("window-all-closed", () => process.platform !== "darwin" && app.quit());

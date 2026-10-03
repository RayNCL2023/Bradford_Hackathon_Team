// Safe bridge between the page and the main process. Owner: Person 1 (shell).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // AiRequest -> AiResult (see src/shared/contracts.js)
  produce: (req) => ipcRenderer.invoke("ai:produce", req),
  // VocalIdea[] -> VocalClip[]
  makeVocalClips: (ideas) => ipcRenderer.invoke("voice:clips", ideas),
});

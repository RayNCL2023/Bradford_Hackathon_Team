// Safe bridge between the page and the main process. Owner: Person 1 (shell).
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // AiRequest -> AiResult (see src/shared/contracts.js)
  produce: (req) => ipcRenderer.invoke("ai:produce", req),
  // VocalIdea[] -> VocalClip[]
  makeVocalClips: (ideas) => ipcRenderer.invoke("voice:clips", ideas),
  // { text?, audio?: Uint8Array, mime?, style, seconds? } -> VocalClip (your own ad-lib, re-voiced to fit)
  makeAdlib: (req) => ipcRenderer.invoke("voice:adlib", req),
  // Phone pads (src/remote): connection info, incoming notes, and studio state sent back to phones.
  remote: {
    info: () => ipcRenderer.invoke("remote:info"),
    onMessage: (fn) => ipcRenderer.on("remote:msg", (_e, m) => fn(m)),
    onClients: (fn) => ipcRenderer.on("remote:clients", (_e, n) => fn(n)),
    setState: (s) => ipcRenderer.send("remote:state", s),
    beat: (n) => ipcRenderer.send("remote:beat", n),
  },
});

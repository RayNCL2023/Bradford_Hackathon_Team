// PHONE REMOTE SERVER (main process). Serves the phone pad page and a WebSocket for live notes.
// Wi-Fi: phone scans the QR code (http://<laptop-ip>:PORT).  USB: `adb reverse` maps the phone's
// localhost:PORT to this computer, so the phone opens http://localhost:PORT over the cable.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");
const { WebSocketServer } = require("ws");
const QRCode = require("qrcode");

const PORT = Number(process.env.REMOTE_PORT) || 7777;
const PAGE_DIR = __dirname;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };

/** Local network IPv4 addresses, Wi-Fi first. */
function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === "IPv4" && !a.internal) out.push({ name, address: a.address });
  }
  out.sort((x, y) => (/wi-?fi|wlan|wireless/i.test(y.name) ? 1 : 0) - (/wi-?fi|wlan|wireless/i.test(x.name) ? 1 : 0));
  return out.map((a) => a.address);
}

function findAdb() {
  const candidates = [
    process.env.ADB,
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, "platform-tools", "adb.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", "adb.exe"),
    process.env.HOME && path.join(process.env.HOME, "Android", "Sdk", "platform-tools", "adb"),
    "adb",
  ].filter(Boolean);
  return candidates.find((c) => c === "adb" || fs.existsSync(c));
}

/**
 * Start the server.
 * @param {{ onMessage:(msg:object)=>void, onClients:(count:number)=>void }} hooks
 */
function startRemote(hooks) {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    const file = path.join(PAGE_DIR, url === "/" ? "pad.html" : url);
    if (!file.startsWith(PAGE_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory() || file.endsWith(".cjs")) {
      res.writeHead(404); res.end("Not found"); return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });

  const wss = new WebSocketServer({ server, path: "/ws" });
  let lastState = null;
  wss.on("connection", (sock, req) => {
    const who = `${req.socket.remoteAddress} ${String(req.headers["user-agent"] || "").slice(0, 60)}`;
    if (process.env.REMOTE_LOG) console.log(`[remote] open: ${who}`);
    sock.on("close", (code, reason) => { if (process.env.REMOTE_LOG) console.log(`[remote] close ${code} ${reason}: ${who}`); });
    sock.on("error", (e) => console.log(`[remote] socket error: ${e.message}`));
    hooks.onClients(wss.clients.size);
    if (lastState) sock.send(JSON.stringify(lastState));
    sock.on("message", (data) => {
      try { hooks.onMessage(JSON.parse(String(data))); } catch { /* ignore bad frames */ }
    });
    sock.on("close", () => hooks.onClients(wss.clients.size));
  });

  server.on("error", (e) => console.log(`[remote] server error: ${e.message}`));
  server.listen(PORT, "0.0.0.0", () => console.log(`[remote] phone pads on port ${PORT}`));

  let usb = { adb: !!findAdb(), linked: false, devices: 0 };
  /** Map the phone's localhost:PORT to ours over USB (needs USB debugging). */
  function linkUsb() {
    const adb = findAdb();
    if (!adb) { usb = { adb: false, linked: false, devices: 0 }; return Promise.resolve(usb); }
    return new Promise((resolve) => {
      execFile(adb, ["devices"], { timeout: 5000 }, (err, out) => {
        const devices = err ? 0 : String(out).split(/\r?\n/).filter((l) => /\tdevice$/.test(l)).length;
        if (!devices) { usb = { adb: true, linked: false, devices: 0 }; return resolve(usb); }
        execFile(adb, ["reverse", `tcp:${PORT}`, `tcp:${PORT}`], { timeout: 5000 }, (e2) => {
          usb = { adb: true, linked: !e2, devices };
          resolve(usb);
        });
      });
    });
  }
  linkUsb();
  setInterval(linkUsb, 5000).unref();

  return {
    /** Send the studio state (mood, scale, bpm, playing, recording) to every phone. */
    broadcast(state) {
      lastState = { type: "state", ...state };
      const msg = JSON.stringify(lastState);
      for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
    },
    /** Send a tiny message (e.g. a beat tick) without storing it. */
    send(msg) {
      const s = JSON.stringify(msg);
      for (const c of wss.clients) if (c.readyState === 1) c.send(s);
    },
    async info() {
      const ips = lanAddresses();
      const wifiUrl = ips[0] ? `http://${ips[0]}:${PORT}` : "";
      await linkUsb();
      return {
        port: PORT,
        wifiUrl,
        otherUrls: ips.slice(1).map((ip) => `http://${ip}:${PORT}`),
        usbUrl: `http://localhost:${PORT}`,
        usb,
        qr: wifiUrl ? await QRCode.toDataURL(wifiUrl, { margin: 1, width: 360, color: { dark: "#0E0D14", light: "#F3EFE6" } }) : "",
        phones: wss.clients.size,
      };
    },
  };
}

module.exports = { startRemote, lanAddresses };

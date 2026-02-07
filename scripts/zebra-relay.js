/**
 * Local relay: receives POST { printerIp, port, zpl } and sends ZPL to the Zebra on port 9100.
 * Run on a machine that can reach the printer: node scripts/zebra-relay.js
 * Then set "Zebra endpoint" in the key tag modal to http://localhost:9101/print
 */
const net = require("net");
const http = require("http");

const PORT = 9101;

function sendZpl(printerIp, port, zpl) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, printerIp, () => {
      socket.write(zpl, "utf8", () => {
        socket.end();
        resolve();
      });
    });
    socket.setTimeout(5000);
    socket.on("error", reject);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Timeout"));
    });
  });
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "POST" || req.url !== "/print") {
    res.writeHead(405, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "POST /print only" }));
    return;
  }
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }
    const { printerIp, port = 9100, zpl } = data;
    if (!printerIp || !zpl) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing printerIp or zpl" }));
      return;
    }
    sendZpl(printerIp, port, zpl)
      .then(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      })
      .catch((err) => {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      });
  });
});

server.listen(PORT, () => {
  console.log(`Zebra relay: http://localhost:${PORT}/print`);
});

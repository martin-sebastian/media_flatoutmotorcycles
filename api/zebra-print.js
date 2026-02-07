/**
 * Sends ZPL to a Zebra label printer at a given IP (port 9100).
 * Use when the server can reach the printer (e.g. local dev on same network).
 * For cloud deployment, run scripts/zebra-relay.js on a machine that can reach the printer.
 */
const net = require("net");

function sendZplToPrinter(printerIp, port, zpl) {
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
      reject(new Error("Connection timeout"));
    });
  });
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  let body;
  try {
    body = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }
  const { printerIp, port = 9100, zpl } = body;
  if (!printerIp || !zpl) {
    return res.status(400).json({ error: "Missing printerIp or zpl" });
  }
  // Basic IP validation
  const ipMatch = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(printerIp);
  if (!ipMatch) {
    return res.status(400).json({ error: "Invalid printer IP address" });
  }
  const portNum = parseInt(port, 10);
  if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
    return res.status(400).json({ error: "Invalid port" });
  }
  try {
    await sendZplToPrinter(printerIp, portNum, zpl);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Zebra print error:", err.message);
    return res.status(502).json({ error: err.message || "Printer connection failed" });
  }
};

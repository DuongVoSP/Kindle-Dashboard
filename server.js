// Serves the dashboard, fully rendered, to devices on the local network.
"use strict";

var http = require("http");
var sources = require("./sources");
var page = require("./page");

var PORT = Number(process.env.PORT) || 7972;
var HOST = process.env.HOST || "0.0.0.0"; // reachable from the LAN (IPv4)

function send(res, status, type, body) {
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function handle(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "text/plain", "Method not allowed");
  var parts = String(req.url).split("?");
  var path = parts[0];
  var landscape = /(^|&)view=landscape(&|$)/.test(parts[1] || "");
  if (path !== "/" && path !== "/index.html") return send(res, 404, "text/plain", "Not found");

  // Only reads data/latest.json; the collector does the fetching.
  sources
    .readLatest()
    .then(function (latest) {
      var html = page.render(latest.data, sources.STOCKS, new Date(), landscape, latest.updated);
      send(res, 200, "text/html; charset=utf-8", html);
    })
    .catch(function (e) {
      console.error(new Date().toISOString() + " render failed: " + (e && e.stack));
      send(res, 500, "text/plain", "Error");
    });
}

// Log each device once per run, to tell "never reached the Mac" from "page broken".
var seen = {};
function logOnce(key) {
  if (seen[key] || Object.keys(seen).length > 200) return;
  seen[key] = true;
  console.log(new Date().toISOString() + " " + key);
}

var server = http.createServer(function (req, res) {
  logOnce("request " + req.socket.remoteAddress + " UA=" + String(req.headers["user-agent"]).slice(0, 200));
  handle(req, res);
});
server.on("connection", function (socket) {
  logOnce("connect " + socket.remoteAddress);
});
server.on("clientError", function (err, socket) {
  if (socket.destroyed) return;
  // A TLS handshake (0x16 first byte) means the browser tried https://
  var tls = err.rawPacket && err.rawPacket[0] === 0x16;
  logOnce("bad request " + socket.remoteAddress + (tls ? " (browser used https, use http)" : " " + err.code));
  socket.destroy();
});
server.listen(PORT, HOST, function () {
  console.log(new Date().toISOString() + " listening on " + HOST + ":" + PORT);
  sources.start(); // fetch now, then every minute, into data/latest.json
});

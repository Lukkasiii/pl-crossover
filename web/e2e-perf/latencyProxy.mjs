#!/usr/bin/env node
// A fixed one-way delay in front of the API, for e2e-perf/deep-link.spec.ts.
// Localhost round trips cost well under a millisecond, which hides exactly
// the cost a per-frame seek walk pays over a real network: every awaited
// round trip is a full RTT. Every HTTP response and every WebSocket message,
// in both directions, is held for DELAY_MS before being passed on, so the
// page sees an RTT of 2 x DELAY_MS on everything it talks to. Equal-delay
// timers fire in insertion order, so message order is preserved.
//
// Usage: node latencyProxy.mjs <listenPort> <upstreamPort> <oneWayDelayMs>
import http from "node:http";
import { WebSocket, WebSocketServer } from "ws";

const [listenPort, upstreamPort, delayArg] = process.argv.slice(2).map(Number);
const DELAY_MS = delayArg;
const later = (fn) => setTimeout(fn, DELAY_MS);

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () =>
    later(() => {
      const upstream = http.request(
        { host: "127.0.0.1", port: upstreamPort, path: req.url, method: req.method, headers: req.headers },
        (up) => {
          const body = [];
          up.on("data", (c) => body.push(c));
          up.on("end", () =>
            later(() => {
              res.writeHead(up.statusCode ?? 502, up.headers);
              res.end(Buffer.concat(body));
            }),
          );
        },
      );
      upstream.on("error", () => later(() => res.writeHead(502).end()));
      upstream.end(Buffer.concat(chunks));
    }),
  );
});

const wss = new WebSocketServer({ server });
wss.on("connection", (client, req) => {
  const upstream = new WebSocket(`ws://127.0.0.1:${upstreamPort}${req.url}`, { headers: { origin: req.headers.origin } });
  const pending = [];
  upstream.on("open", () => pending.splice(0).forEach((m) => upstream.send(m)));
  client.on("message", (data, isBinary) =>
    later(() => {
      const m = isBinary ? data : data.toString();
      if (upstream.readyState === WebSocket.OPEN) upstream.send(m);
      else pending.push(m);
    }),
  );
  upstream.on("message", (data, isBinary) => later(() => client.readyState === WebSocket.OPEN && client.send(isBinary ? data : data.toString())));
  client.on("close", () => upstream.close());
  upstream.on("close", () => client.close());
  upstream.on("error", () => client.close());
});

server.listen(listenPort, () => console.log(`latency proxy :${listenPort} -> :${upstreamPort}, ${DELAY_MS}ms each way`));

#!/usr/bin/env node
const http = require('http');
const os = require('os');

function chooseHost() {
  if (process.env.HTS_HOST) return process.env.HTS_HOST;
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

const bindHost = process.env.HTS_BIND || '0.0.0.0';
const listenPort = parseInt(process.env.HTS_PORT, 10) || 0;
const targetHost = chooseHost();
const pathName = process.env.HTS_PATH || '/hts';
let stopped = false;

function emitFixtures(port) {
  const payload = {
    host: targetHost,
    port,
    path: pathName,
  };
  console.log('__HTS_FIXTURES__' + JSON.stringify(payload));
  console.log('__HTS_READY__');
}

const server = http.createServer((req, res) => {
  if (req.url !== pathName) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, ts: Date.now() }));
});

server.listen(listenPort, bindHost, () => {
  const address = server.address();
  emitFixtures(address.port);
});

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => {
    if (stopped) return;
    stopped = true;
    try {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 100);
    } catch (err) {
      process.exit(0);
    }
  });
});

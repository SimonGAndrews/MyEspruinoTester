#!/usr/bin/env node
const http = require('http');
const url = require('url');

const PROBE_URL = process.env.HTS_POLL_URL || 'http://192.168.4.1/status';
const EXPECT_BODY = process.env.HTS_EXPECT_BODY || null;
const EXPECT_STATUS = Number(process.env.HTS_EXPECT_STATUS || 200);
const INTERVAL_MS = Number(process.env.HTS_INTERVAL_MS || 1000);
const LOG = (...args) => process.stdout.write(args.join(' ') + '\n');
let stopped = false;

function emitFixtures(extra) {
  const payload = Object.assign({
    http_ap_poll: {
      target: PROBE_URL,
    },
  }, extra || {});
  LOG('__HTS_FIXTURES__' + JSON.stringify(payload));
}

function emitReady() {
  LOG('__HTS_READY__');
}

function pollOnce() {
  if (stopped) return;
  const target = url.parse(PROBE_URL);
  const options = {
    method: 'GET',
    hostname: target.hostname,
    port: target.port || 80,
    path: target.path || '/',
    timeout: Number(process.env.HTS_REQUEST_TIMEOUT_MS || 3000),
  };
  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => {
      LOG(`[HTS] ${res.statusCode} ${options.path}`);
      if (res.statusCode !== EXPECT_STATUS) {
        LOG(`[HTS] unexpected status ${res.statusCode}`);
      }
      if (EXPECT_BODY && body.indexOf(EXPECT_BODY) === -1) {
        LOG(`[HTS] unexpected body`);
      }
    });
  });
  req.on('error', (err) => {
    LOG(`[HTS] error ${err && err.message ? err.message : err}`);
  });
  req.end();

  setTimeout(pollOnce, INTERVAL_MS);
}

process.on('SIGTERM', () => {
  stopped = true;
  setTimeout(() => process.exit(0), 100);
});
process.on('SIGINT', () => {
  stopped = true;
  setTimeout(() => process.exit(0), 100);
});

emitFixtures();
emitReady();
pollOnce();

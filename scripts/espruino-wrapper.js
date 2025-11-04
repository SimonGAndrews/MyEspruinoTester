#!/usr/bin/env node
const { spawn } = require('child_process');

const args = process.argv.slice(2);
console.log('[wrapper] invoked with:', JSON.stringify(args));

const child = spawn('espruino', args, { stdio: 'inherit' });
child.on('exit', (code, signal) => {
  process.exitCode = code;
  if (signal) {
    process.kill(process.pid, signal);
  }
});

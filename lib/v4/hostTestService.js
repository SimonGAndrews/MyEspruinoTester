const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { REPO_ROOT } = require('./boardProfile');

const HOST_SERVICE_DEFAULT_TIMEOUT_MS = 5000;
const activeHostServices = new Set();
let hostServiceSignalHandlersInstalled = false;
let stoppingAllHostServices = false;

function clonePlain(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(target, source) {
  const base = target && typeof target === 'object' && !Array.isArray(target) ? clonePlain(target) : {};
  if (!source || typeof source !== 'object') return base;
  Object.entries(source).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      base[key] = value.slice();
    } else if (value && typeof value === 'object') {
      base[key] = deepMerge(base[key], value);
    } else {
      base[key] = value;
    }
  });
  return base;
}

function processHostTestServiceFixturePayload(handle, payload) {
  try {
    const trimmed = (payload || '').trim();
    const parsed = trimmed ? JSON.parse(trimmed) : {};
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('fixture payload must be an object');
    }
    const clone = clonePlain(parsed);
    let globalPayload = null;
    if (clone.global && typeof clone.global === 'object') {
      globalPayload = clone.global;
      delete clone.global;
    }
    if (Object.keys(clone).length) {
      handle.fixtureData = deepMerge(handle.fixtureData, clone);
    }
    if (globalPayload && Object.keys(globalPayload).length) {
      handle.globalFixtureData = deepMerge(handle.globalFixtureData, globalPayload);
    }
  } catch (err) {
    handle.fixtureErrors.push(`HTS fixture parse failed: ${err && err.message ? err.message : err}`);
  }
}

function markHostServiceReady(handle) {
  if (handle.ready) return;
  if (handle.readyTimeout) {
    clearTimeout(handle.readyTimeout);
    handle.readyTimeout = null;
  }
  if (handle.readyResolve) {
    handle.readyResolve(handle);
    handle.readyResolve = null;
    handle.readyReject = null;
  } else {
    handle.ready = true;
  }
}

function processHostTestServiceOutput(handle, chunk) {
  handle.lineBuffer += chunk;
  let newlineIndex = handle.lineBuffer.indexOf('\n');
  while (newlineIndex >= 0) {
    let line = handle.lineBuffer.slice(0, newlineIndex);
    handle.lineBuffer = handle.lineBuffer.slice(newlineIndex + 1);
    line = line.replace(/\r$/, '').trim();
    if (line.startsWith('__HTS_FIXTURES__')) {
      const payload = line.slice('__HTS_FIXTURES__'.length);
      processHostTestServiceFixturePayload(handle, payload);
    } else if (line.startsWith('__HTS_READY__')) {
      markHostServiceReady(handle);
    }
    newlineIndex = handle.lineBuffer.indexOf('\n');
  }
}

function waitForHostServiceReady(handle) {
  if (!handle) return Promise.resolve(null);
  if (handle.ready || handle.error) return Promise.resolve(handle);
  return handle.readyPromise
    .then(() => handle)
    .catch((err) => {
      if (!handle.error) {
        handle.error = err && err.code ? err.code : 'hts_startup_error';
        handle.errorMessage = err && err.message ? err.message : String(err);
      }
      return handle;
    });
}

function resolveHostTestServiceScript(scriptPath) {
  if (typeof scriptPath !== 'string' || !scriptPath.trim()) {
    throw new Error('hostTestService.script must be a non-empty string');
  }
  const resolved = path.isAbsolute(scriptPath)
    ? path.normalize(scriptPath)
    : path.normalize(path.join(REPO_ROOT, scriptPath));
  if (!resolved.startsWith(REPO_ROOT)) {
    throw new Error(`hostTestService script must live within the repository: ${scriptPath}`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`hostTestService script not found: ${resolved}`);
  }
  return resolved;
}

function normaliseHostTestServiceConfig(rawConfig, contextLabel) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error(`Invalid hostTestService config (${contextLabel || 'unknown'})`);
  }
  if (rawConfig.disabled) return null;
  const scriptPath = resolveHostTestServiceScript(rawConfig.script);
  const name = rawConfig.name || path.basename(scriptPath, path.extname(scriptPath));
  const startupTimeoutMs =
    rawConfig.startupTimeoutMs && Number(rawConfig.startupTimeoutMs) > 0
      ? Number(rawConfig.startupTimeoutMs)
      : HOST_SERVICE_DEFAULT_TIMEOUT_MS;
  const env = {};
  if (rawConfig.env && typeof rawConfig.env === 'object') {
    Object.entries(rawConfig.env).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      env[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
    });
  }
  return {
    name,
    script: rawConfig.script,
    scriptPath,
    env,
    startupTimeoutMs,
  };
}

function installHostServiceSignalHandlers() {
  if (hostServiceSignalHandlersInstalled) return;
  ['SIGINT', 'SIGTERM'].forEach((signal) => {
    process.on(signal, () => {
      if (stoppingAllHostServices) return;
      stoppingAllHostServices = true;
      stopAllHostTestServices(`signal:${signal}`)
        .catch(() => {})
        .finally(() => {
          process.exit(signal === 'SIGINT' ? 130 : 0);
        });
    });
  });
  process.on('exit', () => {
    activeHostServices.forEach((handle) => {
      if (handle && handle.process && !handle.process.killed) {
        try {
          handle.process.kill('SIGKILL');
        } catch (_) {}
      }
    });
  });
  hostServiceSignalHandlersInstalled = true;
}

function startHostTestService(config, scopeLabel) {
  installHostServiceSignalHandlers();
  return new Promise((resolve, reject) => {
    try {
      const args = [config.scriptPath];
      const env = {
        ...process.env,
        ...config.env,
        HTS_NAME: config.name,
        HTS_SCOPE: scopeLabel,
      };
      const child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
      const stdoutChunks = [];
      const stderrChunks = [];
      const handle = {
        config,
        scope: scopeLabel,
        process: child,
        stdout: stdoutChunks,
        stderr: stderrChunks,
        stopPromise: null,
        stopped: false,
        lineBuffer: '',
        fixtureData: {},
        globalFixtureData: {},
        fixtureErrors: [],
        ready: false,
        readyPromise: null,
        readyResolve: null,
        readyReject: null,
        readyTimeout: null,
        error: null,
        errorMessage: null,
      };
      activeHostServices.add(handle);
      handle.readyPromise = new Promise((resolveReady, rejectReady) => {
        handle.readyResolve = () => {
          if (handle.ready) return;
          handle.ready = true;
          if (handle.readyTimeout) {
            clearTimeout(handle.readyTimeout);
            handle.readyTimeout = null;
          }
          resolveReady(handle);
          handle.readyResolve = null;
          handle.readyReject = null;
        };
        handle.readyReject = (err) => {
          if (handle.readyTimeout) {
            clearTimeout(handle.readyTimeout);
            handle.readyTimeout = null;
          }
          rejectReady(err);
          handle.readyResolve = null;
          handle.readyReject = null;
        };
      });
      handle.readyTimeout = setTimeout(() => {
        if (handle.ready) return;
        const timeoutErr = new Error(
          `hostTestService (${scopeLabel}) timed out waiting for __HTS_READY__`,
        );
        timeoutErr.code = 'hts_startup_timeout';
        handle.error = 'hts_startup_timeout';
        handle.errorMessage = timeoutErr.message;
        if (handle.readyReject) handle.readyReject(timeoutErr);
        stopHostTestService(handle, 'startup-timeout').catch(() => {});
      }, config.startupTimeoutMs);

      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdoutChunks.push(chunk);
        processHostTestServiceOutput(handle, chunk);
      });
      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderrChunks.push(chunk);
      });
      child.once('error', (err) => {
        handle.error = 'hts_spawn_error';
        handle.errorMessage = err && err.message ? err.message : String(err);
        if (handle.readyReject) handle.readyReject(err);
        activeHostServices.delete(handle);
        reject(new Error(`hostTestService (${scopeLabel}) spawn error: ${handle.errorMessage}`));
      });
      child.once('close', () => {
        if (!handle.ready && !handle.error) {
          const exitErr = new Error(`hostTestService (${scopeLabel}) exited before signalling ready`);
          exitErr.code = 'hts_startup_exit';
          handle.error = exitErr.code;
          handle.errorMessage = exitErr.message;
          if (handle.readyReject) handle.readyReject(exitErr);
        }
        handle.stopped = true;
        activeHostServices.delete(handle);
      });
      resolve(handle);
    } catch (err) {
      reject(err);
    }
  });
}

function stopHostTestService(handle) {
  if (!handle || handle.stopped) return Promise.resolve();
  if (handle.stopPromise) return handle.stopPromise;
  handle.stopPromise = new Promise((resolve) => {
    const child = handle.process;
    if (handle.readyTimeout) {
      clearTimeout(handle.readyTimeout);
      handle.readyTimeout = null;
    }
    if (!child || child.killed) {
      handle.stopped = true;
      activeHostServices.delete(handle);
      resolve();
      return;
    }
    const killTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch (_) {}
    }, 2000);
    child.once('close', () => {
      clearTimeout(killTimer);
      handle.stopped = true;
      activeHostServices.delete(handle);
      resolve();
    });
    try {
      child.kill('SIGTERM');
    } catch (_) {
      clearTimeout(killTimer);
      handle.stopped = true;
      activeHostServices.delete(handle);
      resolve();
    }
  });
  return handle.stopPromise;
}

function stopAllHostTestServices(reason) {
  const handles = Array.from(activeHostServices);
  if (!handles.length) return Promise.resolve();
  return Promise.all(handles.map((handle) => stopHostTestService(handle, reason))).then(() => {});
}

module.exports = {
  clonePlain,
  deepMerge,
  normaliseHostTestServiceConfig,
  startHostTestService,
  stopHostTestService,
  stopAllHostTestServices,
  waitForHostServiceReady,
  processHostTestServiceOutput,
};

const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./boardProfile');

function createEmptyConfig() {
  return { loader: {}, cli: {}, fixture: {}, hostTestService: null };
}

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config || createEmptyConfig()));
}

function loadJSON(filePath, optional = false) {
  if (!fs.existsSync(filePath)) {
    if (optional) return null;
    throw new Error(`Required JSON file not found: ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse JSON (${filePath}): ${err.message}`);
  }
}

function loadSessionDefaults(root = REPO_ROOT) {
  const defaultsPath = path.join(root, 'EspruinoTools', 'configDefaults.json');
  let raw;
  try {
    raw = loadJSON(defaultsPath, true);
  } catch (err) {
    throw err;
  }
  if (!raw) return createEmptyConfig();

  const layer = createEmptyConfig();

  if (Array.isArray(raw.ports) && raw.ports.length) {
    layer.cli.ports = raw.ports.slice();
  }
  if (typeof raw.baudRate === 'number' && Number.isFinite(raw.baudRate) && raw.baudRate > 0) {
    layer.cli.BAUD_RATE = raw.baudRate;
  }
  if (raw.espruino && typeof raw.espruino === 'object') {
    layer.cli.espruinoConfig = Object.entries(raw.espruino).map(([key, value]) => ({ key, value }));
  }

  return layer;
}

function loadSuiteConfig(repoRoot, suiteName) {
  const suiteConfigPath = path.join(repoRoot, 'tests', suiteName, 'testConfig.json');
  const json = loadJSON(suiteConfigPath, true);
  if (!json) {
    return {
      layer: createEmptyConfig(),
      meta: {},
    };
  }
  const cfg = json.config && typeof json.config === 'object' ? json.config : {};
  const layerInput = { ...cfg };
  if (json.hostTestService && typeof json.hostTestService === 'object') {
    layerInput.hostTestService = json.hostTestService;
  }
  return {
    layer: normaliseLayer(layerInput),
    meta: json,
  };
}

function normaliseLayer(layerInput) {
  if (!layerInput || typeof layerInput !== 'object') return createEmptyConfig();
  const layer = createEmptyConfig();
  if (layerInput.loader && typeof layerInput.loader === 'object') {
    layer.loader = clonePlain(layerInput.loader);
  }
  if (layerInput.cli && typeof layerInput.cli === 'object') {
    layer.cli = clonePlain(layerInput.cli);
  }
  if (layerInput.fixture && typeof layerInput.fixture === 'object') {
    layer.fixture = clonePlain(layerInput.fixture);
  }
  if (layerInput.fixtures && typeof layerInput.fixtures === 'object') {
    layer.fixture = { ...layer.fixture, ...clonePlain(layerInput.fixtures) };
  }
  if (layerInput.hostTestService && typeof layerInput.hostTestService === 'object') {
    layer.hostTestService = clonePlain(layerInput.hostTestService);
  }
  return layer;
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeConfig(target, source, provenance = [], label = 'unknown') {
  if (!source) return target;
  if (source.loader) mergeLoader(target, source.loader, provenance, label);
  if (source.cli) mergeCli(target, source.cli, provenance, label);
  if (source.fixture) mergeFixture(target, source.fixture, provenance, label);
  if (Object.prototype.hasOwnProperty.call(source, 'hostTestService') && source.hostTestService !== undefined) {
    target.hostTestService = source.hostTestService ? clonePlain(source.hostTestService) : null;
    provenance.push({ source: label, path: 'hostTestService', value: target.hostTestService });
  }
  return target;
}

function mergeLoader(target, loaderSource, provenance, label) {
  const loaderTarget = target.loader || (target.loader = {});
  Object.entries(loaderSource).forEach(([key, value]) => {
    if (value === undefined) return;
    let clonedValue = clonePlain(value);
    if (key === 'storagePreload') {
      if (!Array.isArray(loaderTarget.storagePreload)) loaderTarget.storagePreload = [];
      loaderTarget.storagePreload = loaderTarget.storagePreload.concat(clonedValue);
    } else if (Array.isArray(clonedValue)) {
      loaderTarget[key] = clonedValue.slice();
    } else if (clonedValue && typeof clonedValue === 'object') {
      loaderTarget[key] = mergeObjects(loaderTarget[key], clonedValue);
    } else {
      loaderTarget[key] = clonedValue;
    }
    provenance.push({ source: label, path: `loader.${key}`, value: clonedValue });
  });
}

function mergeCli(target, cliSource, provenance, label) {
  const cliTarget = target.cli || (target.cli = {});
  Object.entries(cliSource).forEach(([key, value]) => {
    if (value === undefined) return;
    let clonedValue = clonePlain(value);
    if (key === 'cliArgs') {
      if (!Array.isArray(cliTarget.cliArgs)) cliTarget.cliArgs = [];
      cliTarget.cliArgs = cliTarget.cliArgs.concat(clonedValue);
    } else if (key === 'espruinoConfig') {
      const existing = Array.isArray(cliTarget.espruinoConfig) ? cliTarget.espruinoConfig : [];
      const map = new Map(existing.map(({ key: k, value: v }) => [k, v]));
      clonedValue.forEach(({ key: cfgKey, value: cfgVal }) => {
        if (cfgKey) map.set(cfgKey, cfgVal);
      });
      cliTarget.espruinoConfig = Array.from(map.entries()).map(([cfgKey, cfgVal]) => ({ key: cfgKey, value: cfgVal }));
    } else if (Array.isArray(clonedValue)) {
      cliTarget[key] = clonedValue.slice();
    } else if (clonedValue && typeof clonedValue === 'object') {
      cliTarget[key] = mergeObjects(cliTarget[key], clonedValue);
    } else {
      cliTarget[key] = clonedValue;
    }
    provenance.push({ source: label, path: `cli.${key}`, value: clonedValue });
  });
}

function mergeFixture(target, fixtureSource, provenance, label) {
  const fixtureTarget = target.fixture || (target.fixture = {});
  Object.entries(fixtureSource).forEach(([key, value]) => {
    if (value === undefined) return;
    const clonedValue = clonePlain(value);
    fixtureTarget[key] = clonedValue;
    provenance.push({ source: label, path: `fixture.${key}`, value: clonedValue });
  });
}

function mergeObjects(targetObj, sourceObj) {
  const base = targetObj && typeof targetObj === 'object' ? clonePlain(targetObj) : {};
  return deepAssign(base, sourceObj);
}

function deepAssign(target, source) {
  Object.entries(source).forEach(([key, value]) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = deepAssign(target[key] && typeof target[key] === 'object' ? target[key] : {}, value);
    } else {
      target[key] = clonePlain(value);
    }
  });
  return target;
}

function parseTestMetadata(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const BOM = '\ufeff';
  const contents = raw.startsWith(BOM) ? raw.slice(1) : raw;
  const metaPattern = /^\s*\/\*\s*JSON\s*(\{[\s\S]*?\})\s*\*\//;
  const match = contents.match(metaPattern);
  if (!match) {
    return { layer: createEmptyConfig(), metadata: {}, rawSource: raw };
  }
  let parsed;
  try {
    parsed = JSON.parse(match[1]);
  } catch (err) {
    throw new Error(`Invalid JSON metadata block in ${filePath}: ${err.message || err}`);
  }
  if (!parsed || typeof parsed !== 'object') {
    return { layer: createEmptyConfig(), metadata: {}, rawSource: raw };
  }

  if (parsed.config && typeof parsed.config === 'object') {
    return { layer: normaliseLayer(parsed.config), metadata: parsed, rawSource: raw };
  }

  return {
    layer: normaliseLayer(parsed),
    metadata: parsed,
    rawSource: raw,
  };
}

module.exports = {
  createEmptyConfig,
  cloneConfig,
  loadSessionDefaults,
  loadSuiteConfig,
  mergeConfig,
  parseTestMetadata,
};

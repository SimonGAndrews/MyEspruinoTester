const fs = require('fs');
const path = require('path');

function escapeForGlobRegex(value) {
  return value
    .replace(/([.+^=!:${}()|[\]\\])/g, '\\$1')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
}

function resolvePortPattern(portPattern, logger = console) {
  if (!portPattern || (typeof portPattern !== 'string')) return portPattern;
  if (!portPattern.includes('*') && !portPattern.includes('?')) return portPattern;

  const dir = path.dirname(portPattern);
  const basename = path.basename(portPattern);
  const root = dir && dir !== '.' ? dir : '.';

  let entries = [];
  try {
    entries = fs.readdirSync(root);
  } catch (err) {
    logger.warn?.(`[ports] Unable to read ${root} to resolve port pattern ${portPattern}: ${err.message}`);
    return portPattern;
  }

  const regex = new RegExp(`^${escapeForGlobRegex(basename)}$`);
  const matches = entries.filter((entry) => regex.test(entry)).sort();
  if (!matches.length) {
    logger.warn?.(`[ports] No ports matched pattern ${portPattern}; using raw pattern.`);
    return portPattern;
  }

  const resolved = path.join(root, matches[0]);
  logger.log?.(`[ports] Resolved ${portPattern} -> ${resolved}`);
  return resolved;
}

module.exports = {
  resolvePortPattern,
};

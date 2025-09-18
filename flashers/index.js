// Flashing adapters registry
//
// Central place to register pluggable flashing backends. Each adapter
// should export a consistent interface (e.g., `{ type, flash(opts) }`).

const esp32Esptool = require('./esp32-esptool');

const adapters = {
  'esp32-esptool': esp32Esptool,
};

/**
 * Return a flashing adapter by type.
 * @param {string} type - Adapter ID (e.g., "esp32-esptool")
 * @returns {{type:string, flash:function}} Adapter module
 * @throws if no adapter is registered for the given type
 */
function getAdapter(type) {
  const adapter = adapters[type];
  if (!adapter) {
    throw new Error(`No flashing adapter registered for type: ${type}`);
  }
  return adapter;
}

/**
 * List registered adapter types.
 * @returns {string[]} adapter type IDs
 */
function listAdapters() {
  return Object.keys(adapters);
}

module.exports = {
  getAdapter,
  listAdapters,
};

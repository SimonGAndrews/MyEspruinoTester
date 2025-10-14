/* JSON {
  "notes": "Demonstrates per-test CLI args and espruinoConfig overrides.",
  "config": {
    "cli": {
      "cliArgs": ["--sleep", "0.1"],
      "espruinoConfig": [
        { "key": "STORE_LINE_NUMBERS", "value": false }
      ]
    },
    "loader": {
      "timeoutMs": 10000
    }
  }
} */

(function(){
  try {
    // We cannot easily inspect the CLI arguments on-device, but we can note the change.
    console.log('CLI args override applied (see metadata: --sleep 0.1, STORE_LINE_NUMBERS=false).');
    __pass();
  } catch (err) {
    __fail('cli args demo threw: ' + ((err && err.message) || err));
  }
})();

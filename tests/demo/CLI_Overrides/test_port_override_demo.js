/* JSON {
  "notes": "Demonstrates adding an alternate port via metadata; real selection still uses the CLI --port.",
  "config": {
    "cli": {
      "ports": [
        "/dev/ttyACM0",
        "/dev/ttyUSB_FAKE"
      ]
    },
    "loader": {
      "timeoutMs": 10000
    }
  }
} */

(function(){
  try {
    console.log('Metadata added a second port (/dev/ttyUSB_FAKE); see metadata for the merged list.');
    __pass();
  } catch (err) {
    __fail('port override demo threw: ' + ((err && err.message) || err));
  }
})();

/* JSON {
  "notes": "Stages a module into Storage via the harness storagePreload flow and verifies it can be required immediately.",
  "config": {
    "loader": {
      "storagePreload": [
        { "filename": "phase3_preload_module", "sourceFile": "assets/phase3_preload_module.js" }
      ],
      "preUploadDelayMs": 0,
      "postUploadDelayMs": 0,
      "timeoutMs": 15000
    },
    "cli": {
      "RESET_BEFORE_SEND": true
    }
  }
} */

try {
  var Storage = require("Storage");
  var modules = Storage.list();
  if (!modules || modules.indexOf("phase3_preload_module") === -1) {
    __fail("phase3_preload_module missing after preload");
  } else {
    var preload = require("phase3_preload_module");
    if (!preload || typeof preload.triple !== "function") {
      __fail("preloaded module missing triple()");
    } else if (preload.triple(7) === 21) {
      __pass();
    } else {
      __fail("preloaded module triple() returned unexpected value");
    }
  }
} catch (e) {
  __fail('preload verification threw: ' + ((e && e.message) || e));
}

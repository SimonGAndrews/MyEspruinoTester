/* JSON {
  "notes": "Loads the helper module written by test_write_module.js without resetting the device.",
  "config": {
    "cli": {
      "RESET_BEFORE_SEND": false
    },
    "loader": {
      "noReset": true,
      "timeoutMs": 15000
    }
  }
} */

try {
  var Storage = require("Storage");
  var moduleList = Storage.list();
  if (!moduleList || moduleList.indexOf("phase3_helper") === -1) {
    __fail("phase3_helper not found in Storage");
  } else {
    var helper = require("phase3_helper");
    if (!helper || typeof helper.double !== "function") {
      __fail("helper module missing export");
    } else {
      var computed = helper.double(21);
      if (computed === 42) {
        __pass();
      } else {
        __fail("phase3_helper.double did not return 42");
      }
    }
  }
} catch (err) {
  __fail('use module test threw: ' + ((err && err.message) || err));
}

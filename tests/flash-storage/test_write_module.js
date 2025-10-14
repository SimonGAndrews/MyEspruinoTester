/* JSON {
  "notes": "Writes a simple helper module into Storage and verifies it loads immediately.",
  "config": {
    "cli": {
      "SAVE_ON_SEND": 0,
      "RESET_BEFORE_SEND": true
    },
    "loader": {
      "noReset": false,
      "timeoutMs": 15000
    }
  }
} */

try {
  var Storage = require("Storage");
  try {
    Storage.erase("phase3_helper");
  } catch (e) {
    // ignore erase errors (file may not exist yet)
  }
  Storage.write("phase3_helper", "exports.double=function(n){return n+n;};\n");
  var helper = require("phase3_helper");
  if (helper && typeof helper.double === "function" && helper.double(5) === 10) {
    __pass();
  } else {
    __fail("phase3_helper double() did not return expected result");
  }
} catch (e) {
  __fail('write module test threw: ' + ((e && e.message) || e));
}

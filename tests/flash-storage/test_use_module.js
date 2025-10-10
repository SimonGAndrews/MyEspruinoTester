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

var Storage = require("Storage");

var moduleList = Storage.list();
if (!moduleList || moduleList.indexOf("phase3_helper") === -1) {
  result = { status: "fail", reason: "phase3_helper not found in Storage" };
} else {
  var helper = require("phase3_helper");
  if (!helper || typeof helper.double !== "function") {
    result = { status: "fail", reason: "helper module missing export" };
  } else {
    var computed = helper.double(21);
    result = computed === 42;
  }
}

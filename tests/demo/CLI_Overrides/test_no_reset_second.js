/* JSON {
  "notes": "Disables reset and relies on the flag created by the previous test.",
  "config": {
    "cli": {
      "RESET_BEFORE_SEND": false
    },
    "loader": {
      "noReset": true,
      "timeoutMs": 10000
    }
  }
} */

(function(){
  try {
    if (global.__demo_no_reset_flag === 1) {
      __pass('flag persisted across no-reset boundary');
    } else if (global.__demo_no_reset_flag === undefined) {
      __fail('flag missing (reset may have occurred)');
    } else {
      __fail('flag had unexpected value: ' + global.__demo_no_reset_flag);
    }
  } catch (err) {
    __fail('no-reset second test threw: ' + ((err && err.message) || err));
  }
})();

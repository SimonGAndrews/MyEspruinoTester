/* JSON {
  "notes": "Disables reset and seeds a global flag for the following test.",
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
    global.__demo_no_reset_flag = (global.__demo_no_reset_flag || 0) + 1;
    __pass('flag initialised to ' + global.__demo_no_reset_flag);
  } catch (err) {
    __fail('no-reset first test threw: ' + ((err && err.message) || err));
  }
})();

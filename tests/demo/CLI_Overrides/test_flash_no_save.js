/* JSON {
  "notes": "Runs a simple addition while forcing SAVE_ON_SEND=0 (RAM only).",
  "config": {
    "cli": {
      "SAVE_ON_SEND": 0
    },
    "loader": {
      "timeoutMs": 10000
    }
  }
} */

(function(){
  try {
    var sum = 21 + 21;
    if (sum === 42) {
      __pass('addition succeeded with SAVE_ON_SEND=0');
    } else {
      __fail('unexpected sum: ' + sum);
    }
  } catch (err) {
    __fail('flash no-save test threw: ' + ((err && err.message) || err));
  }
})();

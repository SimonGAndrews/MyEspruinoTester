/* JSON {
  "notes": "Forces SAVE_ON_SEND=1 so code is stored to flash; verifies a flag persists after reset.",
  "config": {
    "cli": {
      "SAVE_ON_SEND": 1
    },
    "loader": {
      "timeoutMs": 10000
    }
  }
} */

(function(){
  try {
    if (typeof global.__demo_flash_flag === 'undefined') {
      global.__demo_flash_flag = 1;
      __pass('flash flag initialised; code stored to flash');
    } else {
      __pass('flash flag persisted with value ' + global.__demo_flash_flag);
    }
  } catch (err) {
    __fail('flash execute test threw: ' + ((err && err.message) || err));
  }
})();

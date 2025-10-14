/* JSON {
  "notes": "Demonstrates storagePreload: writes a module to flash and requires it immediately.",
  "config": {
    "loader": {
      "storagePreload": [
        { "filename": "demo_storage_module", "sourceFile": "assets/demo_module.js" }
      ],
      "timeoutMs": 15000
    }
  }
} */

(function(){
  try {
    var mod = require('demo_storage_module.js');
    if (!mod || typeof mod.sayHello !== 'function') {
      __fail('storage module missing sayHello export');
      return;
    }
    var result = mod.sayHello('demo');
    if (result === 'hello-demo') {
      __pass('storage module executed');
    } else {
      __fail('storage module returned unexpected result: ' + result);
    }
  } catch (err) {
    __fail('storage preload demo threw: ' + ((err && err.message) || err));
  }
})();

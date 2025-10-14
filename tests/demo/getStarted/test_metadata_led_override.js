/* JSON {
  "notes": "Shows per-test metadata: overrides demo.ledPin so the LED check passes.",
  "config": {
    "fixture": {
      "demo": {
        "ledPin": 2
      }
    }
  }
} */

(function(){
  try {
    var fixtures = global.ESPRUINO_FIXTURES || {};
    var demo = fixtures.demo || {};
    if (demo.ledPin === undefined || demo.ledPin === null) {
      __fail('demo.ledPin missing');
      return;
    }
    console.log('Would toggle LED on pin', demo.ledPin);
    __pass('LED pin present (' + demo.ledPin + ') via metadata override');
  } catch (err) {
    __fail('metadata LED test threw: ' + ((err && err.message) || err));
  }
})();

/* JSON {
  "notes": "Demonstrates skipping when a required fixture field (demo.ledPin) is missing." ,
  "config": {
    "loader": { "timeoutMs": 5000 }
  }
} */

(function(){
  try {
    var fixtures = global.ESPRUINO_FIXTURES || {};
    var demo = fixtures.demo || {};
    if (demo.ledPin === undefined || demo.ledPin === null) {
      __skip('demo.ledPin not defined; skipping LED test');
      return;
    }
    // Pretend to drive the LED; in this demo we just log a message.
    console.log('Would toggle LED on pin', demo.ledPin);
    __pass('LED pin present (' + demo.ledPin + ')');
  } catch (err) {
    __fail('LED demo threw: ' + ((err && err.message) || err));
  }
})();

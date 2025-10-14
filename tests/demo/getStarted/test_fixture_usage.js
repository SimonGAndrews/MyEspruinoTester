/* JSON {
  "notes": "Reads fixture data from global.ESPRUINO_FIXTURES.demo and verifies fields."
} */

(function(){
  try {
    var fixtures = global.ESPRUINO_FIXTURES || {};
    var demo = fixtures.demo;
    if (!demo) {
      __skip('demo fixture missing');
      return;
    }
    if (demo.message === 'Hello from fixture' && demo.number === 42) {
      __pass('fixture values matched');
    } else {
      __fail('fixture values unexpected: ' + JSON.stringify(demo));
    }
  } catch (e) {
    __fail('fixture usage threw: ' + ((e && e.message) || e));
  }
})();

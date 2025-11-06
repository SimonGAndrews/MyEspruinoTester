/**
 * Scope: Exercise multiple start/stop cycles to ensure Wifi.startAP /
 * Wifi.stopAP can be invoked back-to-back without errors, and that Wifi.getAPDetails
 * reflects the most recent SSID (per https://www.espruino.com/Reference#Wifi).
 */
(function () {
  try {
    var wifi = require('Wifi');
    if (typeof wifi.startAP !== 'function' || typeof wifi.stopAP !== 'function') {
      __skip('AP lifecycle helpers not available on this build');
      return;
    }
    var finished = false;
    var guard = setTimeout(function () {
      finish(false, 'restart cycle guard timeout');
    }, 25000);

    function finish(ok, reason) {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      try {
        wifi.stopAP();
      } catch (_) {}
      if (ok) __pass();
      else __fail(reason || 'unknown restart failure');
    }

    var ssidFirst = 'EspruinoAP-R1-' + Math.floor(Math.random() * 100000);
    var ssidSecond = 'EspruinoAP-R2-' + Math.floor(Math.random() * 100000);

    function startSecond() {
      try {
        wifi.stopAP();
      } catch (_) {}
      wifi.startAP(ssidSecond, { authMode: 'open' }, function (err) {
        if (err) return finish(false, 'second start error: ' + err);
        setTimeout(function () {
          var details = typeof wifi.getAPDetails === 'function' ? wifi.getAPDetails() : null;
          if (details && (details.ssid || '').trim() !== ssidSecond) {
            finish(false, 'getAPDetails did not report second SSID (' + (details && details.ssid) + ')');
            return;
          }
          finish(true);
        }, 400);
      });
    }

    try {
      wifi.stopAP();
    } catch (_) {}
    wifi.startAP(ssidFirst, { authMode: 'open' }, function (err) {
      if (err) return finish(false, 'first start error: ' + err);
      setTimeout(function () {
        try {
          wifi.stopAP();
        } catch (stopErr) {
          finish(false, 'stopAP after first start threw: ' + (stopErr && stopErr.message || stopErr));
          return;
        }
        startSecond();
      }, 400);
    });
  } catch (outerErr) {
    __fail('AP restart test threw: ' + (outerErr && outerErr.message || outerErr));
  }
})();

/**
 * Scope: Start a WPA2-protected soft AP and confirm Wifi.getAPDetails reports
 * the requested SSID/authMode/password metadata. Validates auth handling and
 * ensures the details API reflects the configuration (per https://www.espruino.com/Reference#Wifi).
 */
(function () {
  try {
    var wifi = require('Wifi');
    if (typeof wifi.startAP !== 'function' || typeof wifi.getAPDetails !== 'function') {
      __skip('AP detail helpers not available on this build');
      return;
    }
    var finished = false;
    var guard = setTimeout(function () {
      conclude(false, 'WPA2 detail guard timeout');
    }, 20000);
    var ssid = 'EspruinoAP-WPA2-' + Math.floor(Math.random() * 100000);
    var password = 'Pass' + Math.floor(Math.random() * 1000000);

    function conclude(ok, reason) {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      try {
        wifi.stopAP();
      } catch (_) {}
      if (ok) {
        __pass();
      } else {
        __fail(reason || 'unknown WPA2 detail failure');
      }
    }

    try {
      wifi.stopAP();
    } catch (_) {}
    wifi.startAP(
      ssid,
      {
        authMode: 'wpa2',
        password: password,
        hidden: false,
      },
      function (err) {
        if (err) return conclude(false, 'startAP error: ' + err);
        setTimeout(function () {
          var details;
          try {
            details = wifi.getAPDetails();
          } catch (detailErr) {
            conclude(false, 'wifi.getAPDetails threw: ' + (detailErr && detailErr.message || detailErr));
            return;
          }
          if (!details || typeof details !== 'object') return conclude(false, 'wifi.getAPDetails returned non-object');
          if ((details.ssid || '').trim() !== ssid) return conclude(false, 'SSID mismatch (' + details.ssid + ')');
          var auth = String(details.authMode || '').toLowerCase();
          if (auth.indexOf('wpa') === -1) return conclude(false, 'authMode did not reflect WPA (' + details.authMode + ')');
          if (typeof details.password !== 'string' || details.password.length < 8) {
            return conclude(false, 'details.password missing or too short');
          }
          if ((details.status || '').toLowerCase() !== 'enabled') return conclude(false, 'AP not enabled per details.status (' + details.status + ')');
          conclude(true);
        }, 600);
      }
    );
  } catch (outerErr) {
    __fail('AP WPA2 detail test threw: ' + (outerErr && outerErr.message || outerErr));
  }
})();

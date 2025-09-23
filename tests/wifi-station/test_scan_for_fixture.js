// Scan for the fixture-provided SSID (or BSSID) to confirm visibility before connecting
(function(){
  try {
    var fixtures = global.ESPRUINO_WIFI_FIXTURES || {};
    var wifiCfg = fixtures.wifi;
    var wifi;
    var finished = false;
    var timeout = null;

    function finish(status, pass, reason) {
      if (finished) return;
      finished = true;
      if (timeout) clearTimeout(timeout);
      result = { status: status, pass: !!pass, reason: reason || null };
    }

    if (!wifiCfg || !wifiCfg.ssid) {
      finish('skip', false, 'wifi-station scan skipped (fixtures.wifi.ssid not provided)');
    }

    if (!finished) {
      wifi = require('Wifi');
      if (!wifi || typeof wifi.scan !== 'function') {
        finish('skip', false, 'wifi.scan not available on this build');
      }
    }

    if (!finished) {
      try { wifi.disconnect(); } catch (e) {}
      try { wifi.stopAP(); } catch (e) {}

      var attempts = 0;
      var maxAttempts = wifiCfg.scanAttempts || 3;
      var delayMs = wifiCfg.scanIntervalMs || 2000;
      timeout = setTimeout(function(){ finish('fail', false, 'scan timeout'); }, (delayMs * maxAttempts) + 5000);

      function normalize(val) {
        return (val || '').toString().trim().toUpperCase();
      }
      var targetSsid = wifiCfg.ssid;
      var targetBssid = wifiCfg.bssid ? normalize(wifiCfg.bssid) : null;

      function scanOnce() {
        attempts++;
        wifi.scan(function(list) {
          if (finished) return;
          var aps = Array.isArray(list) ? list : [];
          var hit = aps.some(function(ap) {
            if (!ap) return false;
            if (targetBssid && ap.mac && normalize(ap.mac) === targetBssid) return true;
            return ap.ssid === targetSsid;
          });
          if (hit) {
            finish('pass', true);
          } else if (attempts < maxAttempts) {
            setTimeout(scanOnce, delayMs);
          } else {
            finish('fail', false, 'SSID not found in scan results');
          }
        });
      }

      scanOnce();
    }
  } catch (e) {
    result = { status: 'fail', pass: false, reason: 'wifi-station scan test threw: ' + ((e && e.message) || e) };
  }
})();

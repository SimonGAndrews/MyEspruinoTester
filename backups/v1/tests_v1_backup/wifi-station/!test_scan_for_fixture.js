// Scan for the fixture-provided SSID (or BSSID) to confirm visibility before connecting
try {
  var fixtures = global.ESPRUINO_WIFI_FIXTURES || {};
  var wifiCfg = fixtures.wifi;
  if (!wifiCfg || !wifiCfg.ssid) {
    result = { status: 'skip', reason: 'wifi-station scan skipped (fixtures.wifi.ssid not provided)' };
    return;
  } else {
    var wifi = require('Wifi');
    if (typeof wifi.scan !== 'function') {
      result = false;
      resultReason = 'wifi.scan not available on this build';
      return;
    }
    try { wifi.disconnect(); } catch (e) {}
    try { wifi.stopAP(); } catch (e) {}

    var finished = false;
    var attempts = 0;
    var maxAttempts = wifiCfg.scanAttempts || 3;
    var delayMs = wifiCfg.scanIntervalMs || 2000;
    var timeout = setTimeout(function() {
      finish(false, 'scan timeout');
    }, (delayMs * maxAttempts) + 5000);

    function finish(ok, reason) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      result = ok;
      if (!ok) resultReason = reason;
    }

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
          finish(true);
        } else if (attempts < maxAttempts) {
          setTimeout(scanOnce, delayMs);
        } else {
          finish(false, 'SSID not found in scan results');
        }
      });
    }

    scanOnce();
  }
} catch (e) {
  result = false;
  resultReason = 'wifi-station scan test threw: ' + (e && e.message || e);
}

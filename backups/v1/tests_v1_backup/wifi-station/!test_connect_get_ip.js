// Connect to Wi-Fi using fixtures and confirm an IP address is issued
try {
  var fixtures = global.ESPRUINO_WIFI_FIXTURES || {};
  var wifiCfg = fixtures.wifi;
  if (!wifiCfg || !wifiCfg.ssid || !wifiCfg.password) {
    result = { status: 'skip', reason: 'wifi-station skipped (fixtures.wifi not provided)' };
    return;
  } else {
    var wifi = require('Wifi');
    if (typeof wifi.connect !== 'function') {
      result = false;
      resultReason = 'wifi.connect not available on this build';
      return;
    }
    var finished = false;
    var connectTimeout = wifiCfg.timeout || 25000;
    var timer = setTimeout(function() {
      finish(false, 'wifi.connect timeout');
    }, connectTimeout + 5000);
    function cleanup() {
      try { wifi.disconnect(); } catch (e) {}
      try { wifi.stopAP(); } catch (e) {}
    }
    function finish(ok, reason) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cleanup();
      result = ok;
      if (!ok) resultReason = reason;
    }
    try { wifi.disconnect(); } catch (e) {}
    try { wifi.stopAP(); } catch (e) {}

    var options = { password: wifiCfg.password };
    if (wifiCfg.bssid) options.bssid = wifiCfg.bssid;
    if (wifiCfg.hostname) options.hostname = wifiCfg.hostname;
    if (wifiCfg.channel) options.channel = wifiCfg.channel;
    if (wifiCfg.dhcp !== undefined) options.dhcp = wifiCfg.dhcp;

    wifi.connect(wifiCfg.ssid, options, function(err) {
      if (err) {
        finish(false, 'wifi.connect error: ' + err);
        return;
      }
      waitForIP(0);
    });

    function waitForIP(attempt) {
      var info;
      try {
        info = wifi.getIP();
      } catch (ipErr) {
        finish(false, 'wifi.getIP threw: ' + (ipErr && ipErr.message || ipErr));
        return;
      }
      if (!info || typeof info.ip !== 'string') {
        finish(false, 'wifi.getIP returned invalid payload');
        return;
      }
      if (info.ip && info.ip !== '0.0.0.0') {
        finish(true);
        return;
      }
      if (attempt >= 10) {
        finish(false, 'wifi.getIP never reported a valid IP');
        return;
      }
      setTimeout(function() { waitForIP(attempt + 1); }, 500);
    }
  }
} catch (e) {
  result = false;
  resultReason = 'wifi-station connect test threw: ' + (e && e.message || e);
}

// Connect to Wi-Fi using fixtures and confirm an IP address is issued
(function(){
  try {
    var fixtures = global.ESPRUINO_WIFI_FIXTURES || {};
    var wifiCfg = fixtures.wifi;
    var finished = false;
    var timer = null;
    var wifi;

    function finish(status, pass, reason) {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      try { wifi && wifi.disconnect(); } catch (e) {}
      try { wifi && wifi.stopAP(); } catch (e) {}
      result = { status: status, pass: !!pass, reason: reason || null };
    }

    if (!wifiCfg || !wifiCfg.ssid || !wifiCfg.password) {
      finish('skip', false, 'wifi-station skipped (fixtures.wifi not provided)');
    }

    if (!finished) {
      wifi = require('Wifi');
      if (!wifi || typeof wifi.connect !== 'function') {
        finish('skip', false, 'wifi.connect not available on this build');
      }
    }

    if (!finished) {
      var connectTimeout = wifiCfg.timeout || 25000;
      timer = setTimeout(function(){ finish('fail', false, 'wifi.connect timeout'); }, connectTimeout + 5000);

      try { wifi.disconnect(); } catch (e) {}
      try { wifi.stopAP(); } catch (e) {}

      var options = { password: wifiCfg.password };
      if (wifiCfg.bssid) options.bssid = wifiCfg.bssid;
      if (wifiCfg.hostname) options.hostname = wifiCfg.hostname;
      if (wifiCfg.channel) options.channel = wifiCfg.channel;
      if (wifiCfg.dhcp !== undefined) options.dhcp = wifiCfg.dhcp;

      wifi.connect(wifiCfg.ssid, options, function(err) {
        if (err) {
          finish('fail', false, 'wifi.connect error: ' + err);
          return;
        }
        waitForIP(0);
      });

      function waitForIP(attempt) {
        if (finished) return;
        var info;
        try {
          info = wifi.getIP();
        } catch (ipErr) {
          finish('fail', false, 'wifi.getIP threw: ' + ((ipErr && ipErr.message) || ipErr));
          return;
        }
        if (!info || typeof info.ip !== 'string') {
          finish('fail', false, 'wifi.getIP returned invalid payload');
          return;
        }
        if (info.ip && info.ip !== '0.0.0.0') {
          finish('pass', true);
          return;
        }
        if (attempt >= 10) {
          finish('fail', false, 'wifi.getIP never reported a valid IP');
          return;
        }
        setTimeout(function(){ waitForIP(attempt + 1); }, 500);
      }
    }
  } catch (e) {
    result = { status: 'fail', pass: false, reason: 'wifi-station connect test threw: ' + ((e && e.message) || e) };
  }
})();

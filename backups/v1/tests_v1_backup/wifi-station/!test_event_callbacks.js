// Ensure wifi.on('connected'/'disconnected') fire when using fixture credentials
try {
  var fixtures = global.ESPRUINO_WIFI_FIXTURES || {};
  var wifiCfg = fixtures.wifi;
  if (!wifiCfg || !wifiCfg.ssid || !wifiCfg.password) {
    result = { status: 'skip', reason: 'wifi-station events skipped (fixtures.wifi not provided)' };
    return;
  } else {
    var wifi = require('Wifi');
    if (typeof wifi.on !== 'function' || typeof wifi.off !== 'function') {
      result = true;
      resultReason = 'wifi event helpers not available on this build';
    } else {
      try { wifi.disconnect(); } catch (e) {}
      try { wifi.stopAP(); } catch (e) {}

    var done = false;
    var watchers = [];
    var sawConnected = false;
    var sawDisconnected = false;
    var connectCallbackFired = false;
    var connectTimeout = wifiCfg.timeout || 25000;
    var disconnectDelay = wifiCfg.disconnectDelayMs || 2000;
    var timer = setTimeout(function() {
      finish(false, 'event callbacks timeout');
    }, connectTimeout + disconnectDelay + 10000);

    function addListener(evt, fn) {
      wifi.on(evt, fn);
      watchers.push([evt, fn]);
    }

    function cleanup() {
      for (var i = 0; i < watchers.length; i++) {
        var pair = watchers[i];
        try { wifi.off(pair[0], pair[1]); } catch (e) {}
      }
      try { wifi.disconnect(); } catch (e) {}
    }

    function finish(ok, reason) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      result = ok;
      if (!ok) resultReason = reason;
    }

    function checkComplete() {
      if (sawConnected && sawDisconnected && connectCallbackFired) finish(true);
    }

    addListener('connected', function(info) {
      sawConnected = true;
      checkComplete();
    });

    addListener('disconnected', function(info) {
      sawDisconnected = true;
      checkComplete();
    });

    var options = { password: wifiCfg.password };
    if (wifiCfg.bssid) options.bssid = wifiCfg.bssid;
    if (wifiCfg.hostname) options.hostname = wifiCfg.hostname;
    if (wifiCfg.channel) options.channel = wifiCfg.channel;

      wifi.connect(wifiCfg.ssid, options, function(err) {
        if (err) {
          finish(false, 'wifi.connect error: ' + err);
          return;
        }
        connectCallbackFired = true;
        checkComplete();
        setTimeout(function() {
          try { wifi.disconnect(); } catch (e) {}
        }, disconnectDelay);
      });
    }
  }
} catch (e) {
  result = false;
  resultReason = 'wifi-station events test threw: ' + (e && e.message || e);
}

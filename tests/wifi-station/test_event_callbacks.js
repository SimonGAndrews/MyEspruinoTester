// Ensure wifi.on('connected'/'disconnected') fire when using fixture credentials
(function(){
  try {
    var fixtures = global.ESPRUINO_WIFI_FIXTURES || {};
    var wifiCfg = fixtures.wifi;
    var wifi;
    var finished = false;
    var watchers = [];
    var timer = null;
    var stage = 'init';
    var removeListenerFn = null;

    function removeListener(evt, handler) {
      if (!wifi || !removeListenerFn) return;
      try {
        if (removeListenerFn.length === 2) removeListenerFn(evt, handler);
        else removeListenerFn(evt);
      } catch (e) {}
    }

    function cleanup() {
      for (var i = watchers.length - 1; i >= 0; i--) {
        var pair = watchers[i];
        removeListener(pair[0], pair[1]);
        watchers.splice(i, 1);
      }
      try { wifi && wifi.disconnect(); } catch (e) {}
    }

    function finish(status, pass, reason) {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      cleanup();
      result = { status: status, pass: !!pass, reason: reason || null };
    }

    if (!wifiCfg || !wifiCfg.ssid || !wifiCfg.password) {
      finish('skip', false, 'wifi-station events skipped (fixtures.wifi not provided)');
    }

    if (!finished) {
      stage = 'requireWifi';
      wifi = require('Wifi');
      if (!wifi || typeof wifi.on !== 'function') {
        finish('skip', false, 'wifi event helpers not available on this build');
      } else {
        // Prefer wifi.removeListener when available; fall back to legacy helpers.
        if (typeof wifi.removeListener === 'function') {
          removeListenerFn = function(evt, fn){ wifi.removeListener(evt, fn); };
        } else if (typeof wifi.removeAllListeners === 'function') {
          removeListenerFn = function(evt){ wifi.removeAllListeners(evt); };
        }
      }
    }

    if (!finished) {
      stage = 'preflight';
      try { wifi.disconnect(); } catch (e) {}
      try { wifi.stopAP(); } catch (e) {}

      var sawConnected = false;
      var sawDisconnected = false;
      var connectCallbackFired = false;
      var connectTimeout = wifiCfg.timeout || 25000;
      var disconnectDelay = wifiCfg.disconnectDelayMs || 2000;
      timer = setTimeout(function(){ finish('fail', false, 'event callbacks timeout'); }, connectTimeout + disconnectDelay + 10000);

      function addListener(evt, fn) {
        wifi.on(evt, fn);
        watchers.push([evt, fn]);
      }

      function checkComplete() {
        if (sawConnected && sawDisconnected && connectCallbackFired) finish('pass', true);
      }

      stage = 'registerHandlers';
      addListener('connected', function() {
        sawConnected = true;
        checkComplete();
      });

      addListener('disconnected', function() {
        sawDisconnected = true;
        checkComplete();
      });

      var options = { password: wifiCfg.password };
      if (wifiCfg.bssid) options.bssid = wifiCfg.bssid;
      if (wifiCfg.hostname) options.hostname = wifiCfg.hostname;
      if (wifiCfg.channel) options.channel = wifiCfg.channel;

      stage = 'connect';
      wifi.connect(wifiCfg.ssid, options, function(err) {
        if (err) {
          finish('fail', false, 'wifi.connect error: ' + err);
          return;
        }
        connectCallbackFired = true;
        checkComplete();
        setTimeout(function() {
          if (finished) return;
          stage = 'disconnect';
          try { wifi.disconnect(); } catch (e) {}
        }, disconnectDelay);
      });
    }
  } catch (e) {
    result = { status: 'fail', pass: false, reason: 'wifi-station events test threw (' + stage + '): ' + ((e && e.message) || e) };
  }
})();

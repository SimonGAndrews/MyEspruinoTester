// Attempt to connect with invalid credentials and confirm auth-related events fire
(function () {
  try {
    var fixtures = global.ESPRUINO_WIFI_FIXTURES || {};
    var badCfg = fixtures.wifi_invalid || fixtures.wifiInvalid;
    var wifi;
    var finished = false;
    var listeners = [];
    var timeoutTimer = null;
    var sawAuth = false;
    var sawAuthTimeout = false;
    var sawDisconnected = false;

    var removeListenerFn = null;
    function removeListener(evt, handler) {
      if (!wifi || !removeListenerFn) return;
      try {
        if (removeListenerFn.length === 2) removeListenerFn(evt, handler);
        else removeListenerFn(evt);
      } catch (e) {}
    }

    function cleanup() {
      for (var i = listeners.length - 1; i >= 0; i--) {
        var pair = listeners[i];
        try { removeListener(pair[0], pair[1]); } catch (e) {}
        listeners.splice(i, 1);
      }
      try { wifi && wifi.disconnect(); } catch (e) {}
    }

    function finish(status, pass, reason) {
      if (finished) return;
      finished = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      cleanup();
      result = { status: status, pass: !!pass, reason: reason || null };
    }

    if (!badCfg || badCfg.enabled !== true || !badCfg.ssid || !badCfg.password) {
      finish('skip', false, 'wifi-station auth failure skipped (fixtures.wifi_invalid.disabled or missing)');
    }

    if (!finished) {
      try {
        wifi = require('Wifi');
      } catch (modErr) {
        finish('skip', false, 'Wifi module not available');
      }
    }

    if (!finished) {
      if (typeof wifi.connect !== 'function' || typeof wifi.on !== 'function') {
        finish('skip', false, 'wifi.connect/on not available on this build');
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
      try { wifi.disconnect(); } catch (e) {}
      try { wifi.stopAP(); } catch (e) {}

      function addOnce(evt, flag) {
        var handler = function() {
          if (flag === 'auth') sawAuth = true;
          if (flag === 'timeout') sawAuthTimeout = true;
          if (flag === 'disc') sawDisconnected = true;
          removeListener(evt, handler);
          for (var i = listeners.length - 1; i >= 0; i--) {
            if (listeners[i][1] === handler) listeners.splice(i, 1);
          }
          maybeComplete(false);
        };
        wifi.on(evt, handler);
        listeners.push([evt, handler]);
      }

      addOnce('auth_change', 'auth');
      addOnce('wpa2_auth_timeout', 'timeout');
      addOnce('disconnected', 'disc');

      timeoutTimer = setTimeout(function(){ maybeComplete(true, 'auth failure test timeout'); }, (badCfg.timeout || 12000) + 5000);

      var options = { password: badCfg.password };
      if (badCfg.bssid) options.bssid = badCfg.bssid;
      if (badCfg.hostname) options.hostname = badCfg.hostname;
      if (badCfg.channel) options.channel = badCfg.channel;

      wifi.connect(badCfg.ssid, options, function(err) {
        if (!err) {
          maybeComplete(true, 'wifi.connect succeeded unexpectedly');
        } else {
          setTimeout(function(){ maybeComplete(true); }, 1000);
        }
      });

      setTimeout(function() {
        if (!finished) maybeComplete(true, 'connect callback did not fire');
      }, badCfg.timeout || 12000);
    }

    function maybeComplete(force, reason) {
      if (finished) return;
      if ((sawAuth || sawAuthTimeout) && sawDisconnected) {
        finish('pass', true, 'events: auth=' + sawAuth + ', timeout=' + sawAuthTimeout + ', disconnected=' + sawDisconnected);
      } else if (force) {
        finish('fail', false, reason || 'expected auth failure events not observed');
      }
    }
  } catch (e) {
    result = { status: 'fail', pass: false, reason: 'wifi-station auth failure test threw: ' + ((e && e.message) || e) };
  }
})();

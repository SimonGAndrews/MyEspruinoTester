// Attempt to connect with invalid credentials and confirm auth-related events fire
(function () {
  var fixtures = global.ESPRUINO_WIFI_FIXTURES || {};
  var badCfg = fixtures.wifi_invalid || fixtures.wifiInvalid;
  console.log('wifi_invalid fixture:', JSON.stringify(badCfg));

  if (!badCfg || badCfg.enabled !== true || !badCfg.ssid || !badCfg.password) {
    resultStatus = 'skip';
    resultReason = 'wifi-station auth failure skipped (fixtures.wifi_invalid.disabled or missing)';
    result = true;
    return;
  }

  var wifi = require('Wifi');
  if (typeof wifi.connect !== 'function' || typeof wifi.on !== 'function') {
    resultStatus = 'skip';
    resultReason = 'wifi.connect/on not available on this build';
    result = true;
    return;
  }

  try {
    try { wifi.disconnect(); } catch (e) {}
    try { wifi.stopAP(); } catch (e) {}

    var finished = false;
    var sawAuth = false;
    var sawAuthTimeout = false;
    var sawDisconnected = false;
    var connectCallback = false;

    var listeners = [];
    function addOnce(evt, setFlag) {
      var handler = function(info) {
        if (setFlag === 'auth') sawAuth = true;
        if (setFlag === 'timeout') sawAuthTimeout = true;
        if (setFlag === 'disc') sawDisconnected = true;
        wifi.off(evt, handler);
        maybeComplete(false);
      };
      wifi.on(evt, handler);
      listeners.push([evt, handler]);
    }

    addOnce('auth_change', 'auth');
    addOnce('wpa2_auth_timeout', 'timeout');
    addOnce('disconnected', 'disc');

    var timeout = setTimeout(function() {
      maybeComplete(true, 'auth failure test timeout');
    }, (badCfg.timeout || 12000) + 5000);

    function cleanup() {
      for (var i = 0; i < listeners.length; i++) {
        var pair = listeners[i];
        try { wifi.off(pair[0], pair[1]); } catch (e) {}
      }
      try { wifi.disconnect(); } catch (e) {}
    }

    function finish(ok, reason) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      cleanup();
      result = ok;
      if (!ok) resultReason = reason;
      else resultReason = 'events: auth=' + sawAuth + ', timeout=' + sawAuthTimeout + ', disconnected=' + sawDisconnected;
    }

    function maybeComplete(force, reason) {
      if (finished) return;
      if ((sawAuth || sawAuthTimeout) && sawDisconnected) {
        finish(true);
      } else if (force) {
        finish(false, reason || 'expected auth failure events not observed');
      }
    }

    var options = { password: badCfg.password };
    if (badCfg.bssid) options.bssid = badCfg.bssid;
    if (badCfg.hostname) options.hostname = badCfg.hostname;
    if (badCfg.channel) options.channel = badCfg.channel;

    wifi.connect(badCfg.ssid, options, function(err) {
      connectCallback = true;
      if (!err) {
        maybeComplete(true, 'wifi.connect succeeded unexpectedly');
      } else {
        setTimeout(function() { maybeComplete(true); }, 1000);
      }
    });

    setTimeout(function() {
      if (!finished && !connectCallback) maybeComplete(true, 'connect callback did not fire');
    }, badCfg.timeout || 12000);
  } catch (e) {
    resultStatus = 'fail';
    resultReason = 'wifi-station auth failure test threw: ' + ((e && e.message) || e);
    result = false;
  }
})();

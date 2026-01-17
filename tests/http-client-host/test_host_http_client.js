/**
 * Scope: Connect to the host-provided HTTP echo service and verify it responds
 * with JSON. Skips if the host service is unavailable.
 */
try {
  var __TEST_TIMEOUT_SEC = 45;
  (function () {
    var fixtures = global.ESPRUINO_FIXTURES || {};
    var svc = fixtures.hostService && fixtures.hostService.http_host_echo;
    var wifiCfg = fixtures.wifiSta || fixtures.wifi || {};
    if (!svc || svc.error) {
      __skip('Host HTTP service unavailable' + (svc && svc.errorMessage ? ': ' + svc.errorMessage : ''));
      return;
    }
    if (!wifiCfg.ssid || !wifiCfg.password) {
      __skip('Wi-Fi STA credentials missing in fixtures');
      return;
    }
    var wifi = require('Wifi');
    if (typeof wifi.connect !== 'function') {
      __skip('Wi-Fi connect helper unavailable on this build');
      return;
    }
    var http = require('http');
    function log(msg) { try { print('[HTS_TEST] ' + msg); } catch (err) {} }
    var host = svc.host || '127.0.0.1';
    var port = svc.port;
    var path = svc.path || '/hts';
    var done = false;
    var connectTimer;
    var connectionOwned = false;

    function conclude(ok, reason) {
      if (done) return;
      done = true;
      try {
        if (connectionOwned) wifi.disconnect();
      } catch (disconnectErr) {}
      clearTimeout(connectTimer);
      if (ok) __pass();
      else __fail(reason || 'HTTP request failed');
    }

    connectTimer = setTimeout(function () {
      conclude(false, 'Wi-Fi connect timeout');
    }, 20000);

    try { if (wifi.stopAP) wifi.stopAP(); } catch (errStopAP) {}

    function getStationDetails() {
      var details;
      try {
        details = wifi.getDetails && wifi.getDetails();
      } catch (e) {}
      if (details && typeof details === 'object') {
        if (details.station && typeof details.station === 'object') return details.station;
        return details;
      }
      return null;
    }

    function isConnectedToTarget() {
      var sta = getStationDetails();
      if (!sta) return false;
      var ssid = sta.ssid || sta.SSID;
      var connected = sta.connected === true || sta.status === 'connected';
      if (!ssid || ssid !== wifiCfg.ssid) return false;
      if (sta.ip && sta.ip !== '0.0.0.0') return true;
      var info;
      try { info = wifi.getIP && wifi.getIP(); } catch (e) {}
      return connected && info && info.ip && info.ip !== '0.0.0.0';
    }

    function disconnectBeforeConnect(next) {
      var settled = false;
      function finish() {
        if (settled) return;
        settled = true;
        setTimeout(next, 50);
      }
      try {
        wifi.disconnect(function () {
          finish();
        });
      } catch (e) {
        setTimeout(finish, 100);
      }
      setTimeout(finish, 700);
    }

    if (wifi.setMode) {
      try { wifi.setMode('sta'); } catch (errMode) {}
    }

    function startHttpRequest() {
      log('Starting HTTP request to http://' + host + ':' + port + path);
      clearTimeout(connectTimer);
      connectTimer = setTimeout(function () {
        conclude(false, 'HTTP client timeout');
      }, 10000);
      http.get('http://' + host + ':' + port + path, function (res) {
        var statusCode = typeof res.statusCode === 'number' ? res.statusCode : parseInt(res.statusCode, 10);
        log('HTTP status ' + statusCode);
        var body = '';
        res.on('data', function (d) { body += d; });
        res.on('end', function () {
          if (statusCode !== 200) {
            conclude(false, 'Unexpected status: ' + statusCode);
            return;
          }
          try {
            var parsed = JSON.parse(body);
            if (parsed && parsed.ok) conclude(true);
            else conclude(false, 'Response missing ok flag');
          } catch (e) {
            conclude(false, 'JSON parse failed: ' + ((e && e.message) || e));
          }
        });
      }).on('error', function (httpErr) {
        log('HTTP error ' + (httpErr && httpErr.message ? httpErr.message : httpErr));
        conclude(false, httpErr && httpErr.message ? httpErr.message : httpErr);
      });
    }

    function waitForIP() {
      var info;
      try {
        info = wifi.getIP();
      } catch (e) {}
      if (info && info.ip && info.ip !== '0.0.0.0') {
        log('Obtained IP ' + info.ip);
        startHttpRequest();
      } else {
        setTimeout(waitForIP, 1000);
      }
    }

    function beginNetworking() {
      if (isConnectedToTarget()) {
        log('Already connected to ' + wifiCfg.ssid + ', reusing link');
        waitForIP();
        return;
      }
      log('Disconnecting before connecting to ' + wifiCfg.ssid);
      disconnectBeforeConnect(function () {
        connectionOwned = true;
        wifi.connect(wifiCfg.ssid, { password: wifiCfg.password }, function (err) {
          if (err) {
            conclude(false, 'wifi.connect error: ' + (err.message || err));
            return;
          }
          log('Wi-Fi connect callback fired');
          waitForIP();
        });
      });
    }

    setTimeout(beginNetworking, 500);
  })();
} catch (e) {
  __fail('HTTP host client test threw: ' + ((e && e.message) || e));
}

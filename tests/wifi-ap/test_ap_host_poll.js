/**
 * Scope: Stand up a soft AP with a simple HTTP endpoint that the host-side
 * polling HTS will probe. Passes when a host request arrives; skips if the HTS
 * is unavailable.
 */
try {
  (function () {
    var wifi = require('Wifi');
    var fixtures = global.ESPRUINO_FIXTURES || {};
    var hostSvc = fixtures.hostService && fixtures.hostService.http_ap_poll;
    if (!hostSvc || hostSvc.error) {
      __skip('Host polling service unavailable' + (hostSvc && hostSvc.errorMessage ? ': ' + hostSvc.errorMessage : ''));
      return;
    }
    if (typeof wifi.startAP !== 'function') {
      __skip('AP helpers not available on this build');
      return;
    }
    var http = require('http');
    var finished = false;
    var server;
    function conclude(ok, reason) {
      if (finished) return;
      finished = true;
      try { if (server) server.close(); } catch (e) {}
      try { wifi.stopAP(); } catch (e2) {}
      clearTimeout(timeout);
      if (ok) __pass();
      else __fail(reason || 'host poll failed');
    }
    var timeout = setTimeout(function () {
      conclude(false, 'Host polling timeout');
    }, 20000);
    var ssid = 'EspruinoHTS-' + Math.floor(Math.random() * 100000);
    try { wifi.stopAP(); } catch (e) {}
    wifi.startAP(ssid, { authMode: 'open' }, function (err) {
      if (err) return conclude(false, 'startAP error: ' + err);
      try {
        server = http.createServer(function (req, res) {
          if (req.url !== '/hts') {
            res.writeHead(404);
            res.end('not found');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
          conclude(true);
        });
        server.listen(80);
      } catch (serverErr) {
        conclude(false, 'http server error: ' + (serverErr && serverErr.message || serverErr));
      }
    });
  })();
} catch (e) {
  __fail('AP host poll test threw: ' + ((e && e.message) || e));
}

// Basic HTTP GET smoke test using fixtures
(function(){
  try {
    var fixtures = global.ESPRUINO_WIFI_FIXTURES || {};
    var httpCfg = fixtures.http;
    if (!httpCfg || !httpCfg.url) {
      result = { status: 'skip', pass: false, reason: 'HTTP smoke skipped (fixtures.http.url missing)' };
      return;
    }

    var http = require('http');
    if (!http || typeof http.get !== 'function') {
      result = { status: 'fail', pass: false, reason: 'http.get not available on this build' };
      return;
    }

    var finished = false;
    var timeoutMs = httpCfg.timeout || 15000;
    var timer = setTimeout(function(){
      finish('fail', false, 'HTTP GET timed out after ' + timeoutMs + 'ms');
    }, timeoutMs);

    function finish(status, ok, reason) {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      result = { status: status, pass: ok, reason: reason || null };
    }

    var request;
    try {
      request = http.get(httpCfg.url, function(res) {
        var chunks = '';
        if (res && typeof res.on === 'function') {
          res.on('data', function(d) { chunks += d; });
          res.on('close', function() {
            var ok = res.statusCode === 200;
            var reason = ok ? null : 'HTTP status ' + res.statusCode;
            finish(ok ? 'pass' : 'fail', ok, reason);
          });
        } else {
          finish('fail', false, 'HTTP response missing event interface');
        }
      });
    } catch (reqErr) {
      finish('fail', false, 'http.get threw: ' + ((reqErr && reqErr.message) || reqErr));
      return;
    }

    if (!request || typeof request.on !== 'function') {
      finish('fail', false, 'http.get did not return a request object');
      return;
    }

    request.on('error', function(err) {
      finish('fail', false, 'HTTP GET error: ' + ((err && err.message) || err));
    });
  } catch (e) {
    result = { status: 'fail', pass: false, reason: 'http GET smoke threw: ' + ((e && e.message) || e) };
  }
})();

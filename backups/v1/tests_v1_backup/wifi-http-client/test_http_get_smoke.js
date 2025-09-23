// Basic HTTP GET smoke test using fixtures
try {
  var config = global.ESPRUINO_WIFI_FIXTURES || {};
  if (!config.http || !config.http.url) {
    result = { status: 'skip', reason: 'HTTP smoke skipped (no fixtures.http.url)' };
    return;
  } else {
    var http = require('http');
    result = false;
    resultReason = 'HTTP GET did not succeed';
    var timeout = setTimeout(function(){
      result = false;
      resultReason = 'HTTP GET timed out';
    }, config.http.timeout || 15000);
    http.get(config.http.url, function(res) {
      var body = '';
      res.on('data', function(d) { body += d; });
      res.on('close', function() {
        clearTimeout(timeout);
        result = res.statusCode === 200;
        if (!result) resultReason = 'HTTP status ' + res.statusCode;
      });
    }).on('error', function(e) {
      clearTimeout(timeout);
      result = false;
      resultReason = 'HTTP GET error: ' + (e && e.message || e);
    });
  }
} catch (e) {
  result = false;
  resultReason = 'http GET threw: ' + (e && e.message || e);
}

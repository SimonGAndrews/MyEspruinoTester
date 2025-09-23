// Ensure a basic HTTP server can start and stop without error
try {
  var http = require('http');
  if (!http || typeof http.createServer !== 'function') {
    result = true;
    resultReason = 'HTTP server API not available on this build';
  } else {
    var server = http.createServer(function(req, res) {
      res.end('OK');
    });
    var ok = true;
    try {
      server.listen(8080);
      server.close();
    } catch (e) {
      ok = false;
      resultReason = 'HTTP server start/stop threw: ' + (e && e.message || e);
    }
    result = ok;
  }
} catch (e) {
  result = false;
  resultReason = 'HTTP server test threw: ' + (e && e.message || e);
}

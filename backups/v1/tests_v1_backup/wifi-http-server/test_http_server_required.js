// Verify ability to require 'http' module for server usage
try {
  var http = require('http');
  if (!http || typeof http.createServer !== 'function') {
    result = false;
    resultReason = 'http.createServer not available';
  } else {
    result = true;
  }
} catch (e) {
  result = false;
  resultReason = 'require(\'http\') threw: ' + (e && e.message || e);
}

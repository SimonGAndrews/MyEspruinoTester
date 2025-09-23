// Verify the 'http' module exists and exposes basic client APIs
try {
  var http = require('http');
  if (!http || typeof http.get !== 'function' || typeof http.request !== 'function') {
    result = false;
    resultReason = 'http module missing or incomplete';
  } else {
    result = true;
  }
} catch (e) {
  result = false;
  resultReason = 'require(\'http\') threw: ' + (e && e.message || e);
}

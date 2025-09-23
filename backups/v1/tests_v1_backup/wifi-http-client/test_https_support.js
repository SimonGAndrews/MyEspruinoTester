// Check if HTTPS support is available (optional)
try {
  var https;
  var supported = false;
  try {
    https = require('https');
    if (https && typeof https.get === 'function') supported = true;
  } catch (e) {
    // some builds alias HTTPS through http with protocol option
  }
  var http = require('http');
  if (!supported && http && typeof http.request === 'function') {
    // Espruino often exposes HTTPS via http.request with protocol option
    supported = true;
  }
  result = true;
  if (!supported) {
    resultReason = 'HTTPS client functionality not available on this build';
  }
} catch (e) {
  result = false;
  resultReason = 'HTTPS support check threw: ' + (e && e.message || e);
}

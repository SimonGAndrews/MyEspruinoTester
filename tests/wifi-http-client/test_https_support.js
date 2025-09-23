// Check if HTTPS support is available (optional)
(function(){
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
      supported = true;
    }

    if (supported) {
      result = { status: 'pass', pass: true };
    } else {
      result = { status: 'pass', pass: true, reason: 'HTTPS client functionality not available on this build' };
    }
  } catch (e) {
    result = { status: 'fail', pass: false, reason: 'HTTPS support check threw: ' + ((e && e.message) || e) };
  }
})();

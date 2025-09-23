// Verify the 'http' module exists and exposes basic client APIs
(function(){
  try {
    var http = require('http');
    var ok = !!http && typeof http.get === 'function' && typeof http.request === 'function';
    if (ok) {
      result = { status: 'pass', pass: true };
    } else {
      result = { status: 'fail', pass: false, reason: 'http module missing or incomplete' };
    }
  } catch (e) {
    result = { status: 'fail', pass: false, reason: 'require(\'http\') threw: ' + ((e && e.message) || e) };
  }
})();

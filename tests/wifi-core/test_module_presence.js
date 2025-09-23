// Ensure Wifi module can be required and basic shape is as expected
(function(){
  try {
    var wifi = require('Wifi');
    var t = typeof wifi;
    var ok = !!wifi && (t === 'object' || t === 'function');
    result = { status: ok ? 'pass' : 'fail', pass: ok };
    if (!ok) result.reason = 'Wifi module not available or unexpected type (' + t + ')';
  } catch (e) {
    result = { status: 'fail', pass: false, reason: 'require("Wifi") threw: ' + ((e && e.message) || e) };
  }
})();

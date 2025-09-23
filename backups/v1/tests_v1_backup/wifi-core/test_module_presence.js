// Ensure Wifi module can be required and basic shape is as expected
try {
  var wifi = require('Wifi');
  var t = typeof wifi;
  result = !!wifi && (t === 'object' || t === 'function');
  if (!result) resultReason = 'Wifi module not available or unexpected type (' + t + ')';
} catch (e) {
  result = false;
  resultReason = 'require('Wifi') threw: ' + (e && e.message || e);
}

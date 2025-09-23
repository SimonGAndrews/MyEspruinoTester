// Wifi module presence (sync)
try {
  var wifi = require('Wifi');
  var t = typeof wifi;
  result = !!wifi && (t === 'object' || t === 'function');
  if (!result) resultReason = 'Wifi module type: ' + t;
} catch(e) {
  result = false;
  resultReason = 'require Wifi threw: ' + (e && e.message || e);
}

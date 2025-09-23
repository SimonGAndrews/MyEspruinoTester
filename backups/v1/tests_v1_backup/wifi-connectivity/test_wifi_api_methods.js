// Check a few Wifi API methods exist (sync)
try {
  var wifi = require('Wifi');
  var t = typeof wifi;
  if (!wifi || (t !== 'object' && t !== 'function')) throw new Error('Wifi module type: ' + t);
  result = typeof wifi.scan==='function' && typeof wifi.disconnect==='function' && typeof wifi.getIP==='function';
  if (!result) resultReason='missing expected Wifi methods';
} catch(e) {
  result=false; resultReason = e && e.message || String(e);
}

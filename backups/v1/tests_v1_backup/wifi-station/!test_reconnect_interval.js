// Verify wifi.setReconnectInterval is callable (optional API)
try {
  var wifi = require('Wifi');
  if (typeof wifi.setReconnectInterval !== 'function') {
    result = true;
    resultReason = 'setReconnectInterval not available on this build';
  } else {
    var ok = true;
    try {
      wifi.setReconnectInterval(1);
      wifi.setReconnectInterval(5);
    } catch (e) {
      ok = false;
      resultReason = 'setReconnectInterval threw: ' + (e && e.message || e);
    }
    result = ok;
  }
} catch (e) {
  result = false;
  resultReason = 'Wifi module error: ' + (e && e.message || e);
}

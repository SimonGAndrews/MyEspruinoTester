// Verify wifi.setAutoConnect / wifi.getAutoConnect behaviour
try {
  var wifi = require('Wifi');
  if (typeof wifi.setAutoConnect !== 'function' || typeof wifi.getAutoConnect !== 'function') {
    result = true;
    resultReason = 'AutoConnect helpers not available on this build';
  } else {
    var original = wifi.getAutoConnect();
    var ok = true;
    try {
      wifi.setAutoConnect(!original);
      var after = wifi.getAutoConnect();
      if (!(after === !original || after === (!original ? 1 : 0))) ok = false;
    } finally {
      try { wifi.setAutoConnect(original); } catch (e) {}
    }
    result = ok;
    if (!ok) resultReason = 'AutoConnect toggle did not reflect desired state';
  }
} catch (e) {
  result = false;
  resultReason = 'AutoConnect test threw: ' + (e && e.message || e);
}

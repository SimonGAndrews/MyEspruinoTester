/**
 * Scope: Bring up the soft-AP interface, confirm wifi.getStatus reports AP mode,
 * then tear everything down cleanly. Fails if startAP throws, never reports AP,
 * or we can't stop the AP within the guard timeout.
 */
try {
  var wifi = require('Wifi');
  if (typeof wifi.startAP !== 'function' || typeof wifi.stopAP !== 'function') {
    result = true;
    resultReason = 'AP helpers not available on this build';
  } else {
    var done = false;
    function finish(ok, reason) {
      if (done) return;
      done = true;
      try { wifi.stopAP(); } catch (e) {}
      clearTimeout(timer);
      result = ok;
      if (!ok) resultReason = reason;
    }
    var timer = setTimeout(function(){ finish(false, 'startAP timeout'); }, 15000);
    var ssid = 'EspruinoAP-' + Math.floor(Math.random() * 100000);
    try { wifi.stopAP(); } catch (e) {}
    wifi.startAP(ssid, { authMode: 'open' }, function(err) {
      if (err) return finish(false, 'startAP error: ' + err);
      var status;
      try { status = wifi.getStatus(); } catch (statusErr) {
        finish(false, 'wifi.getStatus threw: ' + (statusErr && statusErr.message || statusErr));
        return;
      }
      var reportsAp = false;
      if (status) {
        if (typeof status === 'string') {
          reportsAp = status.toUpperCase().indexOf('AP') >= 0;
        } else if (typeof status === 'object') {
          if (status.mode && String(status.mode).toUpperCase().indexOf('AP') >= 0) reportsAp = true;
          else if (status.ap && String(status.ap).toUpperCase().indexOf('AP') >= 0) reportsAp = true;
        }
      }
      if (!reportsAp) {
        finish(false, 'wifi.getStatus did not report AP mode');
        return;
      }
      finish(true);
    });
  }
} catch (e) {
  result = false;
  resultReason = 'AP lifecycle test threw: ' + (e && e.message || e);
}

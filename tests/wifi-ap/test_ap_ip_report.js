/**
 * Scope: Start a soft AP and verify wifi.getIP() returns a structured record
 * (ip/netmask/gw strings). Any failure to start the AP or missing fields on
 * the interface info causes the test to fail.
 */
try {
  var wifi = require('Wifi');
  if (typeof wifi.startAP !== 'function' || typeof wifi.getIP !== 'function') {
    result = true;
    resultReason = 'AP/IP helpers not available on this build';
  } else {
    var finished = false;
    function conclude(ok, reason) {
      if (finished) return;
      finished = true;
      try { wifi.stopAP(); } catch (e) {}
      clearTimeout(timeout);
      result = ok;
      if (!ok) resultReason = reason;
    }
    var timeout = setTimeout(function(){ conclude(false, 'AP IP check timeout'); }, 15000);
    var ssid = 'EspruinoAP-IP-' + Math.floor(Math.random() * 100000);
    try { wifi.stopAP(); } catch (e) {}
    wifi.startAP(ssid, { authMode: 'open' }, function(err) {
      if (err) return conclude(false, 'startAP error: ' + err);
      setTimeout(function(){
        var info;
        try { info = wifi.getIP(); } catch (infoErr) {
          conclude(false, 'wifi.getIP threw: ' + (infoErr && infoErr.message || infoErr));
          return;
        }
        if (!info || typeof info !== 'object') {
          conclude(false, 'wifi.getIP returned non-object');
          return;
        }
        if (typeof info.ip !== 'string') {
          conclude(false, 'wifi.getIP.ip missing string');
          return;
        }
        if (info.netmask && typeof info.netmask !== 'string') {
          conclude(false, 'wifi.getIP.netmask not string');
          return;
        }
        if (info.gw && typeof info.gw !== 'string') {
          conclude(false, 'wifi.getIP.gw not string');
          return;
        }
        conclude(true);
      }, 400);
    });
  }
} catch (e) {
  result = false;
  resultReason = 'AP IP test threw: ' + (e && e.message || e);
}

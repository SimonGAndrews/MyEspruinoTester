// Validate wifi.getIP() returns an object with string fields for the station interface
try {
  var wifi = require('Wifi');
  if (typeof wifi.getIP !== 'function') {
    result = true;
    resultReason = 'wifi.getIP not available on this build';
  } else {
    var info;
    try {
      info = wifi.getIP();
    } catch (inner) {
      result = false;
      resultReason = 'wifi.getIP threw: ' + (inner && inner.message || inner);
      return;
    }
    var ok = !!info && typeof info === 'object';
    if (!ok) {
      result = false;
      resultReason = 'wifi.getIP returned non-object (' + typeof info + ')';
      return;
    }
    if (typeof info.ip !== 'string') {
      result = false;
      resultReason = 'wifi.getIP result missing ip string';
      return;
    }
    var optional = ['netmask', 'gw', 'mac'];
    for (var i = 0; i < optional.length; i++) {
      var key = optional[i];
      if (key in info && typeof info[key] !== 'string') {
        result = false;
        resultReason = 'wifi.getIP field ' + key + ' not string';
        return;
      }
    }
    if (info.ap && typeof info.ap === 'object') {
      if ('ip' in info.ap && typeof info.ap.ip !== 'string') {
        result = false;
        resultReason = 'wifi.getIP.ap.ip not string';
        return;
      }
      if ('netmask' in info.ap && typeof info.ap.netmask !== 'string') {
        result = false;
        resultReason = 'wifi.getIP.ap.netmask not string';
        return;
      }
    }
    result = true;
  }
} catch (e) {
  result = false;
  resultReason = 'wifi.getIP shape test threw: ' + (e && e.message || e);
}

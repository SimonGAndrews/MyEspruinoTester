// Check that core Wifi API methods are exported
try {
  var wifi = require('Wifi');
  var moduleObj = wifi;
  var t = typeof wifi;
  if (t === 'function') moduleObj = wifi; // ESP32 returns function/object hybrid
  if (!moduleObj) {
    result = false;
    resultReason = 'Wifi module not available';
  } else {
    var required = ['connect','disconnect','scan','getIP','getStatus','getDetails'];
    var optional = ['start','stop','startAP','stopAP','setIP','setConfig','setHostName','setAutoConnect','getAutoConnect','setReconnectInterval','save','restore','ping','on','off'];
    var missingRequired = required.filter(function(name){ return typeof moduleObj[name] !== 'function'; });
    var missingOptional = optional.filter(function(name){ return typeof moduleObj[name] !== 'function'; });
    result = missingRequired.length === 0;
    if (!result) {
      resultReason = 'Missing required Wifi methods: ' + missingRequired.join(', ');
    } else if (missingOptional.length) {
      resultReason = 'Optional Wifi methods unavailable: ' + missingOptional.join(', ');
    }
  }
} catch (e) {
  result = false;
  resultReason = 'Error inspecting Wifi API: ' + (e && e.message || e);
}

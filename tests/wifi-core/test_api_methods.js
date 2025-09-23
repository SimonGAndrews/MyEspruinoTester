// Check that core Wifi API methods are exported
(function(){
  try {
    var wifi = require('Wifi');
    if (!wifi) {
      result = { status: 'fail', pass: false, reason: 'Wifi module not available' };
      return;
    }
    var moduleObj = wifi;
    if (typeof wifi === 'function') moduleObj = wifi;
    var required = ['connect','disconnect','scan','getIP','getStatus','getDetails'];
    var optional = ['start','stop','startAP','stopAP','setIP','setConfig','setHostName','setAutoConnect','getAutoConnect','setReconnectInterval','save','restore','ping','on','off'];
    var missingRequired = required.filter(function(name){ return typeof moduleObj[name] !== 'function'; });
    var missingOptional = optional.filter(function(name){ return typeof moduleObj[name] !== 'function'; });
    if (missingRequired.length) {
      result = { status: 'fail', pass: false, reason: 'Missing required Wifi methods: ' + missingRequired.join(', ') };
    } else if (missingOptional.length) {
      result = { status: 'pass', pass: true, reason: 'Optional Wifi methods unavailable: ' + missingOptional.join(', ') };
    } else {
      result = { status: 'pass', pass: true };
    }
  } catch (e) {
    result = { status: 'fail', pass: false, reason: 'Error inspecting Wifi API: ' + ((e && e.message) || e) };
  }
})();

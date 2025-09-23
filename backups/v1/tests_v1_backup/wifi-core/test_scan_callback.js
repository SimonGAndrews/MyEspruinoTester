// Ensure wifi.scan invokes its callback (even if no networks found)
try {
  var wifi = require('Wifi');
  if (typeof wifi.scan !== 'function') {
    result = true;
    resultReason = 'wifi.scan not available on this build';
  } else {
    var completed = false;
    var timer = setTimeout(function(){
      if (!completed) {
        completed = true;
        result = false;
        resultReason = 'wifi.scan timed out';
      }
    }, 10000);
    wifi.scan(function(list){
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      result = true;
    });
  }
} catch (e) {
  result = false;
  resultReason = 'wifi.scan threw: ' + (e && e.message || e);
}

// Wifi scan callback should fire (async). No credentials needed.
try {
  var wifi = require('Wifi');
  var t = typeof wifi;
  if (!wifi || (t !== 'object' && t !== 'function')) throw new Error('Wifi module type: ' + t);
  var done=false;
  wifi.scan(function(list){
    if (done) return;
    done = true;
    result = true; // callback executed
  });
  setTimeout(function(){ if (!done) { result=false; resultReason='scan callback timeout'; } }, 5000);
} catch(e) {
  result=false; resultReason = e && e.message || String(e);
}

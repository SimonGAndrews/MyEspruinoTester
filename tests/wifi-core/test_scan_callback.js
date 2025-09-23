// Ensure wifi.scan invokes its callback (even if no networks found)
(function(){
  try {
    var wifi = require('Wifi');
    if (!wifi || typeof wifi.scan !== 'function') {
      result = { status: 'skip', pass: false, reason: 'wifi.scan not available on this build' };
      return;
    }
    try { wifi.stopAP(); } catch (e) {}
    try { wifi.disconnect(); } catch (e) {}

    var completed = false;
    var timer = null;
    function finish(status, ok, reason) {
      if (completed) return;
      completed = true;
      if (timer) clearTimeout(timer);
      try { wifi.stop(); } catch (e) {}
      result = { status: status, pass: ok, reason: reason || null };
    }

    timer = setTimeout(function(){ finish('fail', false, 'wifi.scan timed out'); }, 10000);
    setTimeout(function(){
      print('wifi.scan starting');
      wifi.scan(function(list){
        print('wifi.scan callback', list && list.length);
        finish('pass', true);
      });
    }, 200);
  } catch (e) {
    result = { status: 'fail', pass: false, reason: 'wifi.scan threw: ' + ((e && e.message) || e) };
  }
})();

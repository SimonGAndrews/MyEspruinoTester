
/* JSON {
  "notes": "Async example (Wifi.getIP) using a timeout guard in case callback never fires",
  "config": {
    "loader": { "timeoutMs": 5000 }
  }
} */
(function(){
  var wifi = require('Wifi');  
  var done = false;            // Track if callback or guard have executed

  var guard = setTimeout(function(){  //Timeout guard runs on invocation
    if (!done) {                   //Timeouts function fails the test
      done = true;
      __fail('Wifi.getIP timeout');
    }
  }, 3000);                        //3 second guard timeout    

  wifi.getIP(function(err, info){  // getIP (purpose of the test) also runs on invocation

    // handle the guard
    if (done) return;      // in case the guard already fired
    done = true;           // clear the guard if we got here first
    clearTimeout(guard);

    // handle the result of the test
    if (err) {
      __fail('Wifi.getIP error: ' + err);
      return;
    }
    if (!info || !info.ip) {
      __fail('Wifi.getIP returned no IP');
      return;
    }
    __pass('Wifi.getIP reported IP ' + info.ip);
  });
})();

  
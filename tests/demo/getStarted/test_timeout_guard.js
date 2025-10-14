/* JSON {
  "notes": "Simple setWatch example with a guard timeout.",
  "config": { "loader": { "timeoutMs": 10000 } }
} */

(function(){
  if (typeof setWatch !== 'function' || typeof clearWatch !== 'function' ||
      typeof digitalPulse !== 'function' || typeof LED1 === 'undefined') {
    __skip('setWatch demo skipped: required functions or LED1 pin unavailable');
    return;
  }

  var done = false;  // track whether guard or callback fired

  var guard = setTimeout(function(){
    if (!done) {
      done = true;
      __fail('setWatch callback never fired');
    }
  }, 3000);

  var id = setWatch(function(){
    if (done) return;   // guard already tripped
    done = true;
    clearTimeout(guard);
    clearWatch(id);
    __pass('setWatch callback fired');
  }, LED1, { repeat: false });

  digitalPulse(LED1, 1, 20);  // trigger the watch (comment out to exercise the guard)
})();

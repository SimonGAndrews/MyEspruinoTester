// Simple async example where a callback resolves with __pass." ,

(function(){
  try {
    setTimeout(function(){
      try {
        __pass('async callback fired');
      } catch (err) {
        __fail('async callback threw: ' + ((err && err.message) || err));
      }
    }, 10);
  } catch (e) {
    __fail('async setup threw: ' + ((e && e.message) || e));
  }
})();

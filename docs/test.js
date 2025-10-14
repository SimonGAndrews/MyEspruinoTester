/* JSON {
  "notes": "Async example () using a timeout guard in case callback never fires",
  "config": {
    "loader": { "timeoutMs": 5000 }
  }
} */
(function(){
  var done = false;

  // Guard timer fails the test if the helper never calls back
  var guard = setTimeout(function(){
    if (!done) {
      done = true;
      __fail('callback never fired');
    }
  }, 3000);

  // Simulated asynchronous operation
  setTimeout(function(){
    if (done) return;
    done = true;
    clearTimeout(guard);
    __pass('callback fired successfully');
  }, 50);
})();

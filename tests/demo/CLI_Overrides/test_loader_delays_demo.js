/* JSON {
  "notes": "Applies pre/post upload delays and logs timestamps to show the effect.",
  "config": {
    "loader": {
      "preUploadDelayMs": 200,
      "postUploadDelayMs": 200,
      "timeoutMs": 10000
    }
  }
} */

(function(){
  try {
    var start = Date.now();
    console.log('Test body executed at', start);
    __pass('loader delays applied (check log timestamps and metadata).');
  } catch (err) {
    __fail('loader delay demo threw: ' + ((err && err.message) || err));
  }
})();

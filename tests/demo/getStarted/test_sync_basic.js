// Basic Synchronous test script
(function(){
  try {
    var testShouldPass = true;
    if (testShouldPass) {
      __pass('testShouldPass was true');
    } else {
      __fail('testShouldPass evaluated false');
    }
  } catch (e) {
    __fail('Basic sync test threw: ' + ((e && e.message) || e));
  }
})();

// Simple async example: mark the test as skipped
(function () {
  setTimeout(function () {
    result = { pass: true , status: 'pass', reason: 'basicAsync test passed' };
  }, 200);
})();

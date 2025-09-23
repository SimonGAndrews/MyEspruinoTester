// Simple async example: mark the test as skipped
(function () {
  setTimeout(function () {
    result = { pass: false , status: 'fail', reason: 'basicAsync demo skip' };
  }, 200);
})();

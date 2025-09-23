// Simple async example: wait a bit, then report success
(function(){
  result = undefined;
  resultReason = undefined;
  resultStatus = undefined;
  setTimeout(function() {
    result.status = skip;
  }, 200);
})();

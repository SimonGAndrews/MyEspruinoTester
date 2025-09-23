// Async setTimeout check
setTimeout(function(){
  result = true;
}, 200);
setTimeout(function(){
  if (typeof result==='undefined') { result=false; resultReason='timeout'; }
}, 1500);

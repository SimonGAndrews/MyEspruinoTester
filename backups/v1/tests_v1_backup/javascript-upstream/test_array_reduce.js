// Array.reduce should accumulate correctly

var suma = [1,2,3,4].reduce(function(acc,v){ return acc+v; }, 1000);
var sumb = [1,2,3,4].reduce(function(acc,v){ return acc+v; }, 1000);
var sumc = [0,1,2,3,4,5].reduce(function(acc,v){ return acc+v; });

result = suma==1010 && sumb==1010 && sumc===15;

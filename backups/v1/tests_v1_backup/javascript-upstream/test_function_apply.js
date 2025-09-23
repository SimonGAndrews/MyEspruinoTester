// Function.prototype.apply should work for basic invocation

function add(a,b,c){ return a+b+c; }
var args = [10,20,12];
result = add.apply(null, args)===42;

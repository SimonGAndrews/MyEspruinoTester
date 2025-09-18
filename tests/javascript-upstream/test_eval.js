// eval should work with basic expressions and assignments

var myfoo = { foo : 0 };
result = eval("4*10+2")==42 && (function(){ eval("myfoo.foo=42"); return myfoo.foo; })()==42;

exports.sayHello = function(name) {
  var who = name || 'world';
  console.log('Hello from storage module,', who + '!');
  return 'hello-' + who;
};

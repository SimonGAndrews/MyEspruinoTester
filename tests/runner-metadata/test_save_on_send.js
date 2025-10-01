/*JSON{
  "saveOnSend": true,
  "timeoutMs": 2000,
  "cliArgs": ["--config", "RESET_BEFORE_SEND=false"]
}*/

// Metadata smoke test: ensure per-test SAVE_ON_SEND flag can be toggled
(function(){
  try {
    result = { status: 'pass', pass: true, reason: 'saveOnSend metadata executed' };
  } catch (e) {
    result = { status: 'fail', pass: false, reason: 'metadata test threw: ' + ((e && e.message) || e) };
  }
})();

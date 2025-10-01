/*JSON{
  "storagePreload": {
    "filename": "runner_metadata_message.txt",
    "contents": "metadata suite payload"
  },
  "timeoutMs": 4000,
  "cliArgs": ["--config", "RESET_BEFORE_SEND=false", "--sleep", "2"]
}*/


// Verifies storagePreload metadata writes a Storage file before the test runs
(function(){
  try {
    var Storage;
    try {
      Storage = require('Storage');
    } catch (modErr) {
      result = { status: 'skip', pass: false, reason: 'Storage module unavailable on this build' };
      return;
    }

    if (!Storage || typeof Storage.read !== 'function' || typeof Storage.erase !== 'function') {
      result = { status: 'skip', pass: false, reason: 'Storage helpers not available' };
      return;
    }

    var data = Storage.read('runner_metadata_message.txt');
    if (data === 'metadata suite payload') {
      result = { status: 'pass', pass: true };
    } else {
      result = { status: 'fail', pass: false, reason: 'Unexpected Storage payload: ' + JSON.stringify(data) };
    }

    try { Storage.erase('runner_metadata_message.txt'); } catch (eraseErr) {}
  } catch (e) {
    result = { status: 'fail', pass: false, reason: 'storage preload test threw: ' + ((e && e.message) || e) };
  }
})();

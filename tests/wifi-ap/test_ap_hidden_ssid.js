/**
 * Scope: Start a hidden soft AP on a non-default channel and ensure the
 * configuration is reflected via Wifi.getAPDetails/Wifi.getAPIP (per https://www.espruino.com/Reference#Wifi).
 */
(function () {
  try {
    var wifi = require('Wifi');
    if (typeof wifi.startAP !== 'function' || typeof wifi.getAPDetails !== 'function') {
      __skip('AP detail helpers not available on this build');
      return;
    }
    var done = false;
    var timeout = setTimeout(function () {
      finish(false, 'Hidden AP guard timeout');
    }, 20000);
    var ssid = 'EspruinoAP-Hidden-' + Math.floor(Math.random() * 100000);
    var targetChannel = 6;

    function finish(ok, reason) {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      try {
        wifi.stopAP();
      } catch (_) {}
      if (ok) __pass();
      else __fail(reason || 'unknown hidden AP failure');
    }

    try {
      wifi.stopAP();
    } catch (_) {}
    wifi.startAP(
      ssid,
      {
        authMode: 'open',
        hidden: true,
        channel: targetChannel,
      },
      function (err) {
        if (err) return finish(false, 'startAP error: ' + err);
        setTimeout(function () {
          var details;
          try {
            details = wifi.getAPDetails();
          } catch (detailErr) {
            finish(false, 'wifi.getAPDetails threw: ' + (detailErr && detailErr.message || detailErr));
            return;
          }
          if (!details || typeof details !== 'object') return finish(false, 'wifi.getAPDetails returned non-object');
          if ((details.ssid || '').trim() !== ssid) return finish(false, 'SSID mismatch (' + details.ssid + ')');
          if (!details.hidden) return finish(false, 'details.hidden not truthy');
          if (details.channel && details.channel !== targetChannel) {
            finish(false, 'details.channel mismatch (' + details.channel + ')');
            return;
          }
          var apIp;
          try {
            apIp = typeof wifi.getAPIP === 'function' && wifi.getAPIP();
          } catch (ipErr) {
            finish(false, 'wifi.getAPIP threw: ' + (ipErr && ipErr.message || ipErr));
            return;
          }
          if (!apIp || typeof apIp.ip !== 'string') return finish(false, 'wifi.getAPIP missing ip');
          if (!apIp.mac || apIp.mac.split(':').length !== 6) return finish(false, 'wifi.getAPIP missing mac');
          finish(true);
        }, 600);
      }
    );
  } catch (outerErr) {
    __fail('AP hidden test threw: ' + (outerErr && outerErr.message || outerErr));
  }
})();

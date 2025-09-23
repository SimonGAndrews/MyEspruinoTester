// Attempt to connect to an AP without DHCP and confirm dhcp_timeout fires
(function(){
  try {
    var fixtures = global.ESPRUINO_WIFI_FIXTURES || {};
    var dhcpCfg = fixtures.wifi_dhcp || fixtures.wifiDhcp;
    var wifi;
    var finished = false;
    var listeners = [];
    var timeoutTimer = null;

    function detachListeners() {
      for (var i = listeners.length - 1; i >= 0; i--) {
        var pair = listeners[i];
        try { wifi && wifi.off(pair[0], pair[1]); } catch (e) {}
        listeners.splice(i, 1);
      }
    }

    function finish(status, pass, reason) {
      if (finished) return;
      finished = true;
      if (timeoutTimer) clearTimeout(timeoutTimer);
      detachListeners();
      try { wifi && wifi.disconnect(); } catch (e) {}
      result = { status: status, pass: !!pass, reason: reason || null };
    }

    if (!dhcpCfg || dhcpCfg.enabled !== true || !dhcpCfg.ssid) {
      finish('skip', false, 'wifi-station dhcp timeout skipped (fixtures.wifi_dhcp.disabled or missing)');
    }

    if (!finished) {
      wifi = require('Wifi');
      if (!wifi || typeof wifi.connect !== 'function' || typeof wifi.on !== 'function') {
        finish('skip', false, 'wifi.connect/on not available on this build');
      }
    }

    if (!finished) {
      try { wifi.disconnect(); } catch (e) {}
      try { wifi.stopAP(); } catch (e) {}

      var sawDhcpTimeout = false;
      function track(name, fn) {
        wifi.on(name, fn);
        listeners.push([name, fn]);
      }
      track('dhcp_timeout', function() { sawDhcpTimeout = true; });

      timeoutTimer = setTimeout(function(){ finish('fail', false, 'dhcp timeout test exceeded timeout'); }, (dhcpCfg.timeout || 20000) + 5000);

      var options = {};
      if (dhcpCfg.password) options.password = dhcpCfg.password;
      if (dhcpCfg.bssid) options.bssid = dhcpCfg.bssid;
      if (dhcpCfg.channel) options.channel = dhcpCfg.channel;

      wifi.connect(dhcpCfg.ssid, options, function(err) {
        if (err) {
          finish('fail', false, 'wifi.connect error: ' + err);
          return;
        }
        var waitMs = dhcpCfg.timeout || 20000;
        setTimeout(function() {
          if (finished) return;
          if (sawDhcpTimeout) {
            finish('pass', true);
          } else {
            var info;
            try { info = wifi.getIP(); } catch (e) {}
            if (info && info.ip && info.ip !== '0.0.0.0') {
              finish('fail', false, 'DHCP succeeded unexpectedly');
            } else {
              finish('fail', false, 'dhcp_timeout event not observed');
            }
          }
        }, waitMs);
      });
    }
  } catch (e) {
    result = { status: 'fail', pass: false, reason: 'wifi-station dhcp timeout test threw: ' + ((e && e.message) || e) };
  }
})();

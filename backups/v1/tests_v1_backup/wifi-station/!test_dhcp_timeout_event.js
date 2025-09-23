// Attempt to connect to an AP without DHCP and confirm dhcp_timeout fires
try {
  var fixtures = global.ESPRUINO_WIFI_FIXTURES || {};
  var dhcpCfg = fixtures.wifi_dhcp || fixtures.wifiDhcp;
  if (!dhcpCfg || dhcpCfg.enabled !== true || !dhcpCfg.ssid) {
    result = { status: 'skip', reason: 'wifi-station dhcp timeout skipped (fixtures.wifi_dhcp.disabled or missing)' };
    return;
  } else {
    var wifi = require('Wifi');
    if (typeof wifi.connect !== 'function' || typeof wifi.on !== 'function') {
      result = true;
      resultReason = 'wifi.connect/on not available on this build';
    } else {
      try { wifi.disconnect(); } catch (e) {}
      try { wifi.stopAP(); } catch (e) {}

      var sawDhcpTimeout = false;
      var listeners = [];
      function track(name, fn) {
        wifi.on(name, fn);
        listeners.push([name, fn]);
      }
      track('dhcp_timeout', function(info) {
        sawDhcpTimeout = true;
      });
      track('connected', function(info) {
        // If we got connected but no DHCP, wifi.getIP should still report 0.0.0.0
      });

      var finished = false;
      var timeout = setTimeout(function() {
        finish(false, 'dhcp timeout test exceeded timeout');
      }, (dhcpCfg.timeout || 20000) + 5000);

      function cleanup() {
        for (var i = 0; i < listeners.length; i++) {
          var pair = listeners[i];
          try { wifi.off(pair[0], pair[1]); } catch (e) {}
        }
        try { wifi.disconnect(); } catch (e) {}
      }

      function finish(ok, reason) {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        cleanup();
        result = ok;
        if (!ok) resultReason = reason;
      }

      var options = {};
      if (dhcpCfg.password) options.password = dhcpCfg.password;
      if (dhcpCfg.bssid) options.bssid = dhcpCfg.bssid;
      if (dhcpCfg.channel) options.channel = dhcpCfg.channel;

      wifi.connect(dhcpCfg.ssid, options, function(err) {
        if (err) {
          finish(false, 'wifi.connect error: ' + err);
          return;
        }
        // connection established, wait for dhcp_timeout to appear
        var waitMs = dhcpCfg.timeout || 20000;
        setTimeout(function() {
          if (sawDhcpTimeout) {
            finish(true);
          } else {
            var info;
            try { info = wifi.getIP(); } catch (e) {}
            if (info && info.ip && info.ip !== '0.0.0.0') {
              finish(false, 'DHCP succeeded unexpectedly');
            } else {
              finish(false, 'dhcp_timeout event not observed');
            }
          }
        }, waitMs);
      });
    }
  }
} catch (e) {
  result = false;
  resultReason = 'wifi-station dhcp timeout test threw: ' + (e && e.message || e);
}

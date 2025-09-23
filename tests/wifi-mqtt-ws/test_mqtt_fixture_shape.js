// Validate basic MQTT fixture shape (host/port credentials)
try {
  var cfg = (global.ESPRUINO_WIFI_FIXTURES || {}).mqtt;
  if (!cfg) {
    result = true;
    resultReason = 'MQTT fixtures not supplied (fixtures.mqtt)';
  } else if (typeof cfg.host !== 'string' || !cfg.host) {
    result = false;
    resultReason = 'MQTT fixture host invalid';
  } else if (cfg.port !== undefined && typeof cfg.port !== 'number') {
    result = false;
    resultReason = 'MQTT fixture port invalid';
  } else if (cfg.username !== undefined && typeof cfg.username !== 'string') {
    result = false;
    resultReason = 'MQTT fixture username invalid';
  } else if (cfg.password !== undefined && typeof cfg.password !== 'string') {
    result = false;
    resultReason = 'MQTT fixture password invalid';
  } else {
    result = true;
  }
} catch (e) {
  result = false;
  resultReason = 'MQTT fixture check threw: ' + (e && e.message || e);
}

// Validate WebSocket fixture shape (URL/options)
try {
  var cfg = (global.ESPRUINO_WIFI_FIXTURES || {}).websocket;
  if (!cfg) {
    result = true;
    resultReason = 'WebSocket fixtures not supplied (fixtures.websocket)';
  } else if (typeof cfg.url !== 'string' || !cfg.url) {
    result = false;
    resultReason = 'WebSocket fixture url invalid';
  } else if (cfg.timeout !== undefined && typeof cfg.timeout !== 'number') {
    result = false;
    resultReason = 'WebSocket fixture timeout invalid';
  } else if (cfg.expectEcho !== undefined && typeof cfg.expectEcho !== 'boolean') {
    result = false;
    resultReason = 'WebSocket fixture expectEcho invalid';
  } else if (cfg.message !== undefined && typeof cfg.message !== 'string') {
    result = false;
    resultReason = 'WebSocket fixture message invalid';
  } else {
    result = true;
  }
} catch (e) {
  result = false;
  resultReason = 'WebSocket fixture check threw: ' + (e && e.message || e);
}

# ESP32 Wi-Fi Test Plan

## Purpose
Outline the Wi-Fi functionality to validate on ESP32-family boards (ESP32, ESP32C3, ESP32S3) and map each capability to test cases implemented under `tests/wifi-connectivity/`. This plan evolves as the Wi-Fi suite grows.

## Suite Structure
| Suite | Focus |
| --- | --- |
| `wifi-core` | Module presence, API surface, basic scanning/diagnostics |
| `wifi-station` | Station-mode connect/disconnect, save/restore, IP/DNS/HTTP reachability |
| `wifi-http-client` | HTTP/HTTPS client flows once connected |
| `wifi-http-server` | HTTP server lifecycle, request handling |
| `wifi-mqtt-ws` | MQTT publish/subscribe, WebSocket client/server |
| `wifi-ap` | Soft AP mode (start/stop, client events, AP IP) |
| `wifi-config-diagnostics` | Static IP, config toggles, hostname, ping, repeated scans |

## Coverage Mapping
| Functional Area | Current Coverage | Notes |
| --- | --- | --- |
| 1. Module Presence & API Surface | `tests/wifi-core/test_module_presence.js`<br>`tests/wifi-core/test_api_methods.js` | Confirms module availability and exported API shape. Add explicit failure messaging for legacy builds lacking `Wifi`. |
| 2. Network Scanning & Discovery | `tests/wifi-core/test_scan_callback.js`, `tests/wifi-station/test_scan_for_fixture.js` | Validates callback execution; extend with option-specific scenarios. |
| 3. Station Mode Connectivity | `tests/wifi-station/test_connect_get_ip.js`, `tests/wifi-station/test_event_callbacks.js`, `tests/wifi-station/test_auth_failure_events.js`, `tests/wifi-station/test_dhcp_timeout_event.js` | Smoke-connects using fixture credentials; extend to save/restore, HTTP reachability, and failure cases. |
| 4. HTTP / HTTPS Client | `tests/wifi-http-client/test_http_module_present.js`<br>`tests/wifi-http-client/test_http_get_smoke.js`<br>`tests/wifi-http-client/test_https_support.js` | Smoke coverage for HTTP/HTTPS client APIs; relies on fixtures for live endpoints. |
| 5. HTTP Server | `tests/wifi-http-server/test_http_server_required.js`<br>`tests/wifi-http-server/test_http_server_start_stop.js` | Covers server creation and basic lifecycle; add request parsing/response validation next. |
| 6. WebSocket & MQTT | `tests/wifi-mqtt-ws/test_mqtt_fixture_shape.js`<br>`tests/wifi-mqtt-ws/test_websocket_fixture_shape.js` | Fixture gating only; real publish/subscribe and echo flows remain TODO. |
| 7. Access Point Mode | `tests/wifi-ap/test_start_stop_ap.js`<br>`tests/wifi-ap/test_ap_ip_report.js` | Exercises soft AP start/stop and IP reporting. Add client connect/disconnect coverage. |
| 8. IP Configuration & Status | `tests/wifi-config-diagnostics/test_get_ip_shape.js`<br>`tests/wifi-config-diagnostics/test_status_details_shape.js` | Verifies status/introspection helpers and config toggles. Expand to static IP, save/restore cycles. |
| 9. Hostname & DNS | _Pending_ | Plan to add hostname persistence and DNS lookup tests. |
| 10. Power Management & Diagnostics | _Pending_ | Awaiting tests for `wifi.stop/start`, `wifi.ping`, RSSI stability. |


## Functional Areas
Describe the Wi-Fi features exercised by the test suite. Each area lists the key behaviours to verify and references (current and planned) test cases drawn from Espruino’s ESP32 documentation and upstream tests under `targets/esp32/tests`.

### 1. Module Presence & API Surface
- Ensure `require('Wifi')` loads successfully and returns an object/function exposing exported methods (`connect`, `disconnect`, `stop`, `start`, `startAP`, `stopAP`, `scan`, `getIP`, `getStatus`, `getDetails`, `setIP`, `setConfig`, `setHostName`, `setAutoConnect`, `getAutoConnect`, `setReconnectInterval`, `save`, `restore`, `ping`, `on`, `off`).
- Verify wrapper definitions in `jswrap_esp32_network.c` match the JavaScript API (parameter options, callback signatures).
- Behaviour when the module is absent (older firmware builds) – tests should report a clear failure reason.
_Current coverage:_ `tests/wifi-core/test_module_presence.js`, `tests/wifi-core/test_api_methods.js`
_Pending:_ Add negative-case coverage for builds missing the `Wifi` module.


### 2. Network Scanning & Discovery
- `wifi.scan([options], callback)` returns an array of AP objects (`ssid`, `authMode`, `channel`, `rssi`, `mac`).
- Support optional parameters (`hidden`, `channel`, `show_hidden`, `bssid`) when provided.
- Validate timeout behaviour and repeated scans (`network_scan.js`).
_Current coverage:_ `tests/wifi-core/test_scan_callback.js`, `tests/wifi-station/test_scan_for_fixture.js`, `tests/wifi-station/test_scan_for_fixture.js`
_Pending:_ Expand with option-specific scans (hidden networks, channel filters, repeated scans).


### 3. Station Mode Connectivity (`wifi.connect` / `wifi.disconnect`)
- Connect to WPA/WPA2 SSIDs using fixtures (adapt `select_accesspoint.js`). Parameters: `ssid`, `password`, `timeout`, `hostname`, `bssid`.
- Test auto-reconnect (`wifi.save()`/`wifi.restore()`) and manual `wifi.disconnect`/`wifi.connect` loops (`wifiEvents.js`).
- Verify IP acquisition (`wifi.getIP`), DNS resolution, HTTP reachability (`get_web_page.js`).
- Exercise callbacks (`wifi.on('connected'|'disconnected'|'auth_change'|'wpa2_auth_timeout'|'dhcp_timeout')`).
- Error handling for invalid credentials, absent networks, connection timeouts.
_Current coverage:_ `tests/wifi-station/test_connect_get_ip.js`, `tests/wifi-station/test_event_callbacks.js`, `tests/wifi-station/test_auth_failure_events.js`, `tests/wifi-station/test_dhcp_timeout_event.js`, `tests/wifi-station/test_event_callbacks.js`
_Pending:_ Add save/restore cycles, HTTP reachability checks, and failure-path coverage once fixtures are wired up.


### 4. HTTP / HTTPS Client
- HTTP GET/POST using `require('http')` once Wi-Fi is connected (`get_web_page.js`).
- HTTPS/TLS flows (`get_web_page_https.js`, `https-google-sheets.js`), including certificate validation and JSON parsing.
- Retry/error handling (network drop mid-request, DNS failure).
_Current coverage:_ `tests/wifi-http-client/test_http_module_present.js`, `tests/wifi-http-client/test_http_get_smoke.js`, `tests/wifi-http-client/test_https_support.js`
_Pending:_ Broaden to cover POST bodies, retry logic, and TLS certificate validation using fixture endpoints.


### 5. HTTP Server
- Host a basic HTTP server (`require('http').createServer`) returning dynamic content (`simple_web_server.js`).
- Validate request parsing (method, URL, query, headers) and repeated client connections.
- Ensure `server.close()` cleans up sockets; test restart after stop.
_Current coverage:_ `tests/wifi-http-server/test_http_server_required.js`, `tests/wifi-http-server/test_http_server_start_stop.js`
_Pending:_ Add request parsing assertions and multi-client handling checks.


### 6. WebSocket & MQTT
- WebSocket client/server round-trips (similar to EMP32 examples; confirm message echo, close events).
- MQTT publish/subscribe via `require('MQTT')` (`mqttclient.js`), including reconnect behaviour when Wi-Fi reconnects or broker is unavailable.
_Current coverage:_ `tests/wifi-mqtt-ws/test_mqtt_fixture_shape.js`, `tests/wifi-mqtt-ws/test_websocket_fixture_shape.js`
_Pending:_ Implement live publish/subscribe and echo flows when broker and WS fixtures are ready.


### 7. Access Point Mode (`wifi.startAP` / `wifi.stopAP`)
- Start AP with SSID/password/channel; verify `wifi.getIP().ap` and monitor `stationConnected`/`stationDisconnected` events.
- Test `wifi.stopAP()` cleanup, ability to restart AP, and interaction with station mode.
_Current coverage:_ `tests/wifi-ap/test_start_stop_ap.js`, `tests/wifi-ap/test_ap_ip_report.js`
_Pending:_ Track station join/leave events and AP coexistence with station mode.


### 8. IP Configuration & Status
- Retrieve station/AP info via `wifi.getIP()` (expect IP/netmask/gateway, MAC, optional RSSI/channel).
- Switch between DHCP and static IP (`wifi.setIP`) and verify persistence (`wifi.save()`/`wifi.restore()`).
- Inspect `wifi.getStatus()`/`wifi.getDetails()` for SSID, BSSID, RSSI, security, reconnect counters.
- Adjust low-level parameters with `wifi.setConfig` (auto reconnect, power save, DHCP) and confirm via `wifi.getConfig()` / `wifi.getAutoConnect()`.
_Current coverage:_ `tests/wifi-config-diagnostics/test_get_ip_shape.js`, `tests/wifi-config-diagnostics/test_status_details_shape.js`
_Pending:_ Add static IP, `wifi.save()`/`wifi.restore()`, and hostname persistence coverage.


### 9. Hostname & DNS
- `wifi.setHostName(name)` / `wifi.getHostname()` lifecycle – ensure hostname persists across reconnect/save.
- Exercise DNS lookups (`require('dns').lookup`) post connection.
_Current coverage:_ _None yet._
_Pending:_ Plan tests for `wifi.setHostName`, reconnect persistence, and DNS lookups.


### 10. Power Management & Diagnostics
- `wifi.stop()` / `wifi.start()` sequences; confirm event callbacks and ability to resume connectivity.
- `wifi.ping(host, callback)` latency/timeout handling when host reachable/unreachable.
- Monitor RSSI consistency (`wifi.getDetails()`) and repeated scans.
_Current coverage:_ _None yet._
_Pending:_ Add `wifi.stop/start`, `wifi.ping`, and RSSI stability under repeated scans.


## Current Test Coverage
- **wifi-core**
  - `tests/wifi-core/test_module_presence.js`: verifies module presence and basic API surface.
  - `tests/wifi-core/test_api_methods.js`: validates required and optional `Wifi` methods.
  - `tests/wifi-core/test_scan_callback.js`, `tests/wifi-station/test_scan_for_fixture.js`: ensures scanning invokes the callback.
- **wifi-station**
  - `tests/wifi-station/test_connect_get_ip.js`, `tests/wifi-station/test_event_callbacks.js`: connects with fixture credentials and asserts an IP is acquired.
  - `tests/wifi-station/test_scan_for_fixture.js`: searches scan results for the fixture SSID/BSSID before connecting.
- **wifi-http-client**
  - `tests/wifi-http-client/test_http_module_present.js`: confirms HTTP client basics are available.
  - `tests/wifi-http-client/test_http_get_smoke.js`: optional HTTP GET smoke leveraging fixtures when supplied.
  - `tests/wifi-http-client/test_https_support.js`: checks HTTPS hooks or fallbacks exist.
- **wifi-http-server**
  - `tests/wifi-http-server/test_http_server_required.js`: guards that `http.createServer` is exposed.
  - `tests/wifi-http-server/test_http_server_start_stop.js`: validates basic start/stop lifecycle.
- **wifi-mqtt-ws**
  - `tests/wifi-mqtt-ws/test_mqtt_fixture_shape.js`: validates MQTT fixture configuration; enables deeper publish/subscribe tests when populated.
  - `tests/wifi-mqtt-ws/test_websocket_fixture_shape.js`: checks WebSocket fixture fields needed for future echo/connectivity runs.
- **wifi-ap**
  - `tests/wifi-ap/test_start_stop_ap.js`: ensures soft AP can start and stop without throwing.
  - `tests/wifi-ap/test_ap_ip_report.js`: checks `wifi.getIP()` returns string fields once the AP callback fires.
- **wifi-config-diagnostics**
  - `tests/wifi-config-diagnostics/test_get_ip_shape.js`: inspects `wifi.getIP()` result fields.
  - `tests/wifi-config-diagnostics/test_status_details_shape.js`: validates `wifi.getStatus()`/`wifi.getDetails()` shapes.

## Planned / Future Tests

### 2. Network Scanning & Discovery
- Incorporate channel/hidden filters as in `network_scan.js` and capture repeated scan stability.

### 3. Station Mode Connectivity
- Adapt `select_accesspoint.js` for fixture-driven connect/disconnect loops and HTTP reachability (`get_web_page.js`).
- Port `wifiEvents.js` cases to observe STA start/stop, auth changes, and reconnect callbacks.

### 4. HTTP / HTTPS Client
- Reproduce `get_web_page_https.js` / `https-google-sheets.js` TLS flows, including certificate validation and JSON parsing.

### 5. HTTP Server
- Extend `simple_web_server.js` patterns to validate request parsing, concurrent clients, and response headers.

### 6. WebSocket & MQTT
- Adapt `mqttclient.js` for publish/subscribe against fixture-provided brokers and add WebSocket echo coverage.

### 7. Access Point Mode
- Add AP client join/leave tracking, IP allocation assertions, and AP+station coexistence scenarios.

### 8. IP Configuration & Status
- Implement `wifi.setIP`, `wifi.setConfig`, `wifi.setHostName`, and `wifi.save`/`wifi.restore` persistence checks.

### 9. Hostname & DNS
- Exercise `wifi.setHostName` persistence across reconnects and verify DNS lookups via `require('dns').lookup`.

### 10. Power Management & Diagnostics
- Exercise `wifi.stop()`/`wifi.start()`, `wifi.ping`, and repeated scans to monitor RSSI stability under load.

## Run Instructions
- Device run:
  ```bash
  node scripts/run-tests.js --board ESP32C3 --port /dev/ttyACM0 --suites wifi-connectivity --fixtures configs/lab.json --quiet
  ```
- Node baseline (Wi-Fi semantics not available).

## References
- ESP32 Wi-Fi guides: https://www.espruino.com/ESP32
- ESP32 Wi-Fi wrappers: `libs/network/esp32/jswrap_esp32_network.c`, `network_esp32.c`
- Upstream tests: https://github.com/espruino/Espruino/tree/master/targets/esp32/tests
- Espruino `Wifi` module docs: https://www.espruino.com/module/Wifi
- CLI guide: `docs/cli-guide.md`
- Manifest reference: `docs/manifest-reference.md`


## Here’s a practical roadmap to move from the finished plan to a fully implemented Wi‑Fi suite:

### Define the suites

1) Update lib/tests.js so wifi-core, wifi-station, wifi-http-client, wifi-http-server, wifi-mqtt-ws, wifi-ap, and wifi-config-diagnostics map to dedicated test folders.

2) In each folder, create placeholder tests (even if they just set result = false; resultReason = 'not implemented yet';) so the suite skeleton exists and runners don’t fail.

### Refactor manifests

1) Adjust boards/<BOARD>.json to list the new suites in suites.available. For default runs, you can leave suites.default as a small subset (e.g., wifi-core + wifi-station).

2) Decide whether to drop the legacy wifi-connectivity suite or keep it as a “smoke” bundle that subsets the new ones.

### Fixture & config handling

Create configs/fixtures.example.json (or similar) describing Wi-Fi credentials, MQTT broker, test endpoints, etc.—matching fixtures entries in the manifest.

Sample scaffold:
```json
{
  "wifi": {
    "ssid": "YOUR_WIFI_SSID",
    "password": "YOUR_WIFI_PASSWORD",
    "timeout": 25000,
    "hostname": "espruino-tester",
    "bssid": "AA:BB:CC:DD:EE:FF",
    "scanAttempts": 3,
    "scanIntervalMs": 2000
  },
  "wifi_invalid": {
    "enabled": false,
    "ssid": "YOUR_WIFI_SSID",
    "password": "WRONG_PASSWORD",
    "timeout": 12000
  },
  "wifi_dhcp": {
    "enabled": false,
    "ssid": "AP_WITHOUT_DHCP",
    "password": "OPTIONAL",
    "timeout": 20000
  },
  "http": {
    "url": "http://example.com/",
    "timeout": 15000
  }
}
```

Update scripts/run-tests.js to load fixture data (e.g., via --fixtures configs/my-lab.json) and pass them to tests (maybe injecting them via the prologue or writing them to a global before each test).

Document how to create a local configs/<hostname>.json for lab-specific secrets.

### Implement suites incrementally

Start with wifi-core: add tests that confirm module presence, method availability, scan basics, and simple wifi.getDetails() checks.
Move to wifi-station: adapt upstream select_accesspoint.js, get_web_page.js, etc., using fixture credentials.
Continue suite-by-suite per the plan: HTTP client, HTTP server, MQTT/WebSocket, AP, config/diagnostics. Each test should set result/resultReason and use the injected fixtures.

### Enhance the runner

Add an option (or heuristic) to skip suites if required fixtures aren’t available (e.g., skip wifi-mqtt-ws if no broker config).
Consider persisting detailed per-test JSON (e.g., results/<timestamp>/<board>/<suite>/<testId>.json) once tests capture richer metrics/log extracts.

### Comparison tooling

Once suites are stable, extend run-node-baseline.js or add a new command that compares Node vs device results. Start with pure JS suites (javascript-upstream, portions of wifi-core that don’t need hardware).

### Documentation updates

In docs/cli-guide.md, describe running the new suites, fixture usage, and sample configs.
In TestPlan_Wifi.md, link each suite section to the actual test files as you implement them.

### Prioritize the first suite

A typical order is wifi-core → wifi-station → wifi-http-client (so we cover connectivity end-to-end early).
Work through the “Planned / Future Tests” list in the plan, ticking off each upstream reference (select_accesspoint.js, wifiEvents.js, etc.) as you port it.

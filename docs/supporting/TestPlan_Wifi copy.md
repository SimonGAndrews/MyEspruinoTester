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

## Functional Areas
Describe the Wi-Fi features exercised by the test suite. Each area lists the key behaviours to verify and references (current and planned) test cases drawn from Espruino’s ESP32 documentation and upstream tests under `targets/esp32/tests`.

### 1. Module Presence & API Surface
- Ensure `require('Wifi')` loads successfully and returns an object/function exposing exported methods (`connect`, `disconnect`, `stop`, `start`, `startAP`, `stopAP`, `scan`, `getIP`, `getStatus`, `getDetails`, `setIP`, `setConfig`, `setHostName`, `setAutoConnect`, `getAutoConnect`, `setReconnectInterval`, `save`, `restore`, `ping`, `on`, `off`).
- Verify wrapper definitions in `jswrap_esp32_network.c` match the JavaScript API (parameter options, callback signatures).
- Behaviour when the module is absent (older firmware builds) – tests should report a clear failure reason.

### 2. Network Scanning & Discovery
- `wifi.scan([options], callback)` returns an array of AP objects (`ssid`, `authMode`, `channel`, `rssi`, `mac`).
- Support optional parameters (`hidden`, `channel`, `show_hidden`, `bssid`) when provided.
- Validate timeout behaviour and repeated scans (`network_scan.js`).

### 3. Station Mode Connectivity (`wifi.connect` / `wifi.disconnect`)
- Connect to WPA/WPA2 SSIDs using fixtures (adapt `select_accesspoint.js`). Parameters: `ssid`, `password`, `timeout`, `hostname`, `bssid`.
- Test auto-reconnect (`wifi.save()`/`wifi.restore()`) and manual `wifi.disconnect`/`wifi.connect` loops (`wifiEvents.js`).
- Verify IP acquisition (`wifi.getIP`), DNS resolution, HTTP reachability (`get_web_page.js`).
- Exercise callbacks (`wifi.on('connected'|'disconnected'|'auth_change'|'wpa2_auth_timeout'|'dhcp_timeout')`).
- Error handling for invalid credentials, absent networks, connection timeouts.

### 4. HTTP / HTTPS Client
- HTTP GET/POST using `require('http')` once Wi-Fi is connected (`get_web_page.js`).
- HTTPS/TLS flows (`get_web_page_https.js`, `https-google-sheets.js`), including certificate validation and JSON parsing.
- Retry/error handling (network drop mid-request, DNS failure).

### 5. HTTP Server
- Host a basic HTTP server (`require('http').createServer`) returning dynamic content (`simple_web_server.js`).
- Validate request parsing (method, URL, query, headers) and repeated client connections.
- Ensure `server.close()` cleans up sockets; test restart after stop.

### 6. WebSocket & MQTT
- WebSocket client/server round-trips (similar to EMP32 examples; confirm message echo, close events).
- MQTT publish/subscribe via `require('MQTT')` (`mqttclient.js`), including reconnect behaviour when Wi-Fi reconnects or broker is unavailable.

### 7. Access Point Mode (`wifi.startAP` / `wifi.stopAP`)
- Start AP with SSID/password/channel; verify `wifi.getIP().ap` and monitor `stationConnected`/`stationDisconnected` events.
- Test `wifi.stopAP()` cleanup, ability to restart AP, and interaction with station mode.

### 8. IP Configuration & Status
- Retrieve station/AP info via `wifi.getIP()` (expect IP/netmask/gateway, MAC, optional RSSI/channel).
- Switch between DHCP and static IP (`wifi.setIP`) and verify persistence (`wifi.save()`/`wifi.restore()`).
- Inspect `wifi.getStatus()`/`wifi.getDetails()` for SSID, BSSID, RSSI, security, reconnect counters.
- Adjust low-level parameters with `wifi.setConfig` (auto reconnect, power save, DHCP) and confirm via `wifi.getConfig()` / `wifi.getAutoConnect()`.

### 9. Hostname & DNS
- `wifi.setHostName(name)` / `wifi.getHostname()` lifecycle – ensure hostname persists across reconnect/save.
- Exercise DNS lookups (`require('dns').lookup`) post connection.

### 10. Power Management & Diagnostics
- `wifi.stop()` / `wifi.start()` sequences; confirm event callbacks and ability to resume connectivity.
- `wifi.ping(host, callback)` latency/timeout handling when host reachable/unreachable.
- Monitor RSSI consistency (`wifi.getDetails()`) and repeated scans.

## Current Test Coverage
- **wifi-core**
  - `tests/wifi-core/test_module_presence.js`: verifies module presence and basic API surface.
  - `tests/wifi-core/test_api_methods.js`: validates required and optional `Wifi` methods.
  - `tests/wifi-core/test_scan_callback.js`: ensures scanning invokes the callback.
- **wifi-station**
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

## Planned / Future Tests (from ESP32 docs & upstream `targets/esp32/tests`)
- Station-mode connectivity: adapt `select_accesspoint.js` to use fixtures and validate HTTP reachability (`get_web_page.js`).
- HTTPS client flows: reproduce `get_web_page_https.js` / `https-google-sheets.js` scenarios (TLS, JSON parsing).
- HTTP server lifecycle: adapt `simple_web_server.js` for request handling and cleanup checks.
- Scanning variants: incorporate channel/hidden filters as in `network_scan.js`.
- Event-driven tests: monitor `wifiEvents.js` scenarios (STA_START/STOP, AP events, auth changes).
- MQTT client: adapt `mqttclient.js` for publish/subscribe against fixture-provided broker.
- Soft AP scenarios: start AP, confirm IP allocation, run HTTP server via AP, observe client connect/disconnect events.
- Configuration tests: `wifi.setIP`, `wifi.setConfig`, `wifi.setHostName`, `wifi.save`, `wifi.restore` to validate persistence and error conditions.
- Diagnostics: exercise `wifi.ping`, repeated `wifi.scan`/`wifi.getDetails`, `wifi.stop`/`wifi.start` under load, and toggle `wifi.setReconnectInterval` / `wifi.setAutoConnect`.

## Run Instructions
- Device run:
  ```bash
  node scripts/run-tests.js --board ESP32C3 --port /dev/ttyACM0 --suites wifi-connectivity --quiet
  ```
- Node baseline (Wi-Fi semantics not available).

## References
- ESP32 Wi-Fi guides: https://www.espruino.com/ESP32
- ESP32 Wi-Fi wrappers: `libs/network/esp32/jswrap_esp32_network.c`, `network_esp32.c`
- Upstream tests: https://github.com/espruino/Espruino/tree/master/targets/esp32/tests
- Espruino `Wifi` module docs: https://www.espruino.com/module/Wifi
- CLI guide: `docs/test-runner-cli-guide.md`
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

In docs/test-runner-cli-guide.md, describe running the new suites, fixture usage, and sample configs.
In TestPlan_Wifi.md, link each suite section to the actual test files as you implement them.

### Prioritize the first suite

A typical order is wifi-core → wifi-station → wifi-http-client (so we cover connectivity end-to-end early).
Work through the “Planned / Future Tests” list in the plan, ticking off each upstream reference (select_accesspoint.js, wifiEvents.js, etc.) as you port it.

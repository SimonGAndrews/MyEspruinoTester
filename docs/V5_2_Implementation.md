# V5.1 Host Test Service Implementation Snapshot

This document captures the state of Host Test Service (HTS) development as carried over to branch `V5.1`.  This branch was effectively the development of the HTS.

The document then presents the extension of the development into `V5.2` which adds incremental capability to run Test Services on another target (as opposed to the host test machine)

The document derives from `docs/V5_implementation_1.md` and continues to capture the thinking in developing the approach and track the development for `V5.2`

Latest checkpoint: commit `a48e234d1f2d948b6eb8f5113b056ab6f96c2c4b` (“TTH controller planning updates”) records the controller scaffolding assets, updated planning sections, and the refreshed `http-client-host` metadata underpinning this document.

## Background: Work Completed up to V5

### Functionality

- The V4 harness core (see `docs/run-tests-gordonV4_workflow.md`) reached feature parity with the legacy flows (`run-tests-gordon-summary.md`, `run-tests-gordon-flow_diagram.md`) including suite layering, metadata-driven fixtures, wrapper execution, and MDBT42Q-specific upload handling (`docs/V4_implementation_3.md`, `docs/V4_implementation_4.md`).
- Metadata handling matured through `docs/v4_metadata_spec.md`, enabling merged board/test configs, diagnostics capture, and rich runner outputs (described in `docs/run-tests-gordonV4_metadata_flow_diagram.md` and `docs/run-tests-gordonV4_summary.md`).
- Test authoring guidance (`docs/test-writing-guide.md`) and CLI workflows (`docs/test-runner-cli-guide.md`) were aligned with the wrapper contract, serial-debug support, and the Gordon CLI options for V4.
- Supporting functional work includes baseline board requirements (`docs/baseline-requirements.md`), manifest usage (`docs/manifest-reference.md`), and ongoing architecture notes (`docs/test-harness-architecture_WIP.md`).

### Documentation

- Process & workflow descriptions: `docs/run-tests-gordonV4_workflow.md`, `docs/run-tests-gordonV4_flow_diagram.md`, `docs/run-tests-gordonV4_metadata_flow_diagram.md`, and `docs/run-tests-gordonV4_summary.md` document the execution path, data merges, and terminology.
- Requirements & specifications: `docs/baseline-requirements.md`, `docs/v4_metadata_spec.md`, and `docs/V5_features_spec.md` set out the behavioural expectations for harness, metadata, and upcoming host-service features.
- Operational guides: `docs/test-runner-cli-guide.md`, `docs/test-writing-guide.md`, `docs/run-tests-gordon-summary.md`, and `docs/manifest-reference.md` guide day-to-day usage for contributors.
- Historical implementation logs: `docs/V4_implementation_3.md`, `docs/V4_implementation_4.md`, and `docs/V5_implementation_1.md` track what was built during earlier phases; `docs/TestKit/` holds reference material gathered for hardware bring-up.

## V5.1 Host Target System Development 

### Functional Areas Delivered (as of 2025-11-07)

1. **Metadata plumbing (`lib/v4/runConfig.js:6-102`)**
   - Suite/test configs now accept `hostTestService` blocks (name, script, env, startup timeout, static fixtures).
   - Provenance tracking ensures HTS definitions survive through merges and validation prevents conflicting suite/test HTS entries.

2. **Harness lifecycle & process control (`scripts/run-tests-gordonV4.js:339-545`, `1356-1709`)**
   - HTS processes spawn before suites/tests run, emit fixtures via `__HTS_FIXTURES__`, and signal readiness with `__HTS_READY__`.
   - Sentinel parsing, fixture merging, and diagnostics (`hts_startup_timeout`, `hts_fixture_error`) feed into test metadata.
   - Signal handlers plus `stopHostTestService`/`stopAllHostTestServices` ensure graceful teardown and log flushing even on abort.

3. **Logging & metadata references (`scripts/run-tests-gordonV4.js:1619-1698`)**
   - Each HTS has `logs/<scope>.hts.stdout/.stderr` artefacts recorded in `hostTestServiceLogs`, enabling post-mortem analysis.

4. **Host service assets (`host-services/http-host-echo.js`, `host-services/http-ap-poll.js`)**
   - `http-host-echo` exposes an HTTP endpoint for DUT clients, auto-selecting host interface/port or honouring `HTS_*` env overrides.
   - `http-ap-poll` repeatedly probes DUT AP URLs using env-configured targets, emitting fixtures for AP-side tests.

5. **DUT test suites**
   - `tests/http-client-host/testConfig.json` + `test_host_http_client.js` consume HTS fixtures + Wi-Fi credentials to issue host-bound HTTP requests with reconnect safeguards (connection reuse, disconnect-before-connect, 500 ms settle delay, 45 s timeout).
   - `tests/wifi-ap/testConfig.json` + `test_ap_host_poll.js` coordinate with the polling HTS; `test_ap_ip_report.js` now skips cleanly when the HTS layer reports an error or AP helpers are unavailable.

6. **Board/suite wiring**
   - `boards/ESP32/board.json` and `boards/ESP32C3/board.json` list `http-client-host` under `available` suites, enabling selection from CLI metadata.

7. **Documentation**
   - `docs/V5_features_spec.md:90-114` now describes HTS readiness, logging, security constraints, and the implementation backlog.
   - `docs/V5_implementation_1.md` remains the changelog through Step 5; this companion file (`docs/V5_1_Implementation.md`) records the branch cutover and current blockers (ESP32 STA instability).
   - `docs/TestKit/` adds FT232H reference material for forthcoming hardware harness efforts.

All of the items above were captured in commit `bbd379877d77e17cf28c8fce6f823cc08d18cae8`.

### Current Operational Status & Blockers

- **HTTP host-service demo** works end-to-end only when the ESP32 is already associated with the Wi-Fi network. Fresh connects often fail with `ESP_ERR_WIFI_SSID`/`WIFI_REASON_NO_AP_FOUND`, leading to `no_result`. Work continues to stabilise the STA connect path (stronger AP, retries, firmware tweaks).
- **ESP32C3** experimentation shows REPL uploads to flash succeed, but RAM uploads hit the known `FIFO_FULL` issue; focus returns to ESP32 until the Wi-Fi reliability is resolved.

## Next Steps

1. Stabilise ESP32 Wi-Fi joins post-reset so the HTTP HTS suite passes reliably in the harness (consider closer AP, longer settle delays, or driver updates).
2. Once networking is stable, expand HTS coverage (additional host services, DUT tests) and add unit tests for the HTS helpers in `scripts/run-tests-gordonV4.js`.
3. Revisit ESP32C3 support (upload mode fixes) after the V5.1 HTS baseline is proven on ESP32.

## Alternative Wi-Fi testing  Approach – Using a A Target Host Service. 

To decouple host test duties from the developer workstation and stabilise RF conditions, we introduce the **Target Test Host (TTH)** concept. A TTH is a dedicated Espruino-based board that runs curated host test programs (APs, HTTP helpers, polling clients) under harness control. Instead of the Node HTS scripts talking directly to the DUT, the harness will spawn a controller HTS that prepares the TTH (flash/reset if needed), monitors its serial output for readiness markers, and relays any fixtures (e.g., SSID, host/port, shared tokens) back to the DUT test. This preserves the existing HTS plumbing while ensuring the radio-facing services live on stable hardware close to the DUT test rig.

### Pros & Cons (Post-V5.1 Reflection)

- **Pros**
  - *Realistic end-to-end coverage* – Host Test Services exercise the actual radios, HTTP stacks, and fixture exchange so a PASS means the full pipeline (fixtures → DUT → host) works as intended.
  - *Reusable host helpers* – Standalone HTS scripts (`host-services/http-host-echo.js`, `host-services/http-ap-poll.js`) can be retargeted via metadata/env without touching harness code.
  - *Harness plumbing validated* – The `wifi-ap` suite shows metadata propagation, sentinel parsing, and log capture functioning as designed; HTS stdout/stderr land alongside DUT artefacts for debugging.

- **Cons / Pain points**
  - *RF instability dominates outcomes* – ESP32 STA joins frequently fail (timeouts, `WIFI_REASON_NO_AP_FOUND`), so run success often depends on Wi-Fi conditions rather than harness logic.
  - *Manual intervention still needed* – To secure a PASS we often pre-connect via REPL or move routers closer, undermining automation.
  - *Sparse diagnostics* – When the host poller can’t reach the DUT AP we only see a timeout; richer host-side logging would speed root-cause analysis.

- **Implications / Options**
- Improve the RF environment (dedicated nearby AP, known channel) so “reset → upload → run” becomes reliable.
  - Enhance HTS logging (record HTTP errors/timeouts) and DUT retry logic to reduce flakiness.
  - Consider temporary simulated interactions if real-radio testing keeps blocking progress, while preserving the HTS infrastructure for eventual hardware validation.

## Proposed Next Step – HTS Controller + Target Test Host (TTH)

We will prototype Option B (hybrid controller) to keep harness runtime low:

- **Architecture**
  - Introduce a *controller HTS* (Node process) that the harness spawns just like any other host service. This controller flashes and/or resets a dedicated ESP32 “Target Test Host” (TTH) using EspruinoTools, monitors its serial output, and relays fixtures/logs through the usual `__HTS_FIXTURES__` / `__HTS_READY__` sentinels.
  - The TTH runs curated, versioned Espruino scripts that expose deterministic Wi-Fi endpoints (HTTP echo, polling clients, etc.). The controller treats it as a golden device and can optionally skip reflashing if the correct firmware/script signature is already present.

- **Responsibilities**
  - *Controller HTS*: Manage flashing policy (flash every run vs. reuse existing image), power/reset sequencing, serial log ingestion, fixture emission, and health reporting back to the harness. It also archives host logs under `logs/<scope>.hts.*`.
  - *TTH*: Execute the selected host program, emit readiness markers to the controller, provide consistent SSID/channel/password (or other test services), and perform any host-side assertions.
  - *Harness*: Unchanged—it spawns the controller HTS, merges fixtures, and runs DUT tests as today.

- **New requirement**
  - The controller must accept a per-suite/test policy to **flash or not flash** the TTH each run. Use cases: run smoke tests with “reuse” to minimise time; run certification suites with “flash” to guarantee a clean host image. The controller records which mode was used in the HTS fixtures/metadata for traceability.

This approach keeps total runtime close to the current HTS model (no extra harness phase to program the host) while delivering the deterministic RF behaviour we need.

## Controller HTS Scaffolding 

### work completed

- Added `host-services/tth-controller.js`, a Node-based HTS that reads the agreed env vars (`HTS_TTH_PORT`, `HTS_TTH_SCRIPT_ID`, `HTS_TTH_MODE`, etc.), loads per-script metadata from `host-services/tth-programs/<id>.json`, merges fixture overrides, and emits `__HTS_FIXTURES__`/`__HTS_READY__`. Physical flashing/command control is stubbed for now, but the CLI/API surface is live.
- Introduced `host-services/tth-programs/http_host_echo.json` as a placeholder manifest describing the `http_echo` mode and default fixtures. Future controller work will add real TTH firmware mappings here.
- Harness metadata already supports arbitrary HTS env vars, so suites/tests can begin referencing the controller HTS by pointing `hostTestService.script` to `host-services/tth-controller.js` and supplying the required `HTS_TTH_*` env values.

### Burn-in Test Snapshot (2026-01-17)

- **Goal**: Demonstrate the `http-client-host` suite and existing HTS plumbing function end-to-end once a dedicated Target Test Host (TTH) is providing the Wi-Fi service independently from the DUT.
- **TTH setup (ESP32 on `/dev/ttyUSB0`)**
  - Script: `host-services/tth-programs/http_host_echo.espruino` (manual build) flashing an AP named `TTH-HTTP-ECHO` with password `TTHpass123`, exposing an HTTP echo endpoint that responds to DUT requests.
  - Runtime behaviour: prints `__HOST_READY__` on boot, then maintains the AP and HTTP handler until reset.
- **DUT setup (ESP32 on `/dev/ttyUSB1`)**
  - Harness suite: `tests/http-client-host/testConfig.json` with `test_host_http_client.js`.
  - Test flow: disconnect any prior Wi-Fi sessions, call `wifi.connect('TTH-HTTP-ECHO', {password: 'TTHpass123'})`, wait for DHCP (`wifi.getIP().ip`), then issue an HTTP GET to the TTH fixture (`http://<host>:<port>/hts`). On success, log the HTTP status and emit the wrapper PASS JSON.
- **Execution command**: ``node scripts/run-tests-gordonV4.js --board ESP32 --port /dev/ttyUSB1 --suites http-client-host --serial-debug``.
- **Result**: Suite `http-client-host` reported PASS (artefacts under `results/20260117-210341/ESP32`). Logs confirm the DUT connected to the TTH AP, fetched fixtures, completed the HTTP transaction, and published the wrapper JSON without manual REPL assistance.
- **Notes**: This manual burn-in validates the dev work above (HTS plumbing + DUT suite) and provides a reference configuration while we extend the controller HTS to manage the TTH automatically.

### Remaining V5.2 work to fully operationalise the TTH

- **Complete controller HTS**: finish `host-services/tth-controller.js` so it can flash or reuse the TTH firmware, reset it via EspruinoTools, stream serial output, emit fixtures/logs, and honour suite/test metadata (`HTS_TTH_PORT`, `HTS_TTH_SCRIPT_ID`, `HTS_TTH_MODE`, flash policy).
- **Curate TTH program catalogue**: add definitive JSON manifests + Espruino scripts under `host-services/tth-programs/`, documenting supported modes (e.g., HTTP echo, AP poll) and how tests select them.
- **Harness wiring**: update suites (`tests/http-client-host`, `tests/wifi-ap`, etc.) to reference the controller HTS instead of raw Node helpers, ensuring metadata merges pass the required env vars and Wi-Fi fixtures.
- **Automation/regression**: add controller-focused smoke/unit tests (mocked serial) plus real-device regression scripts so ESP32 DUT + TTH runs become repeatable; record the process in this implementation log.
- **Documentation**: extend `docs/test-harness-architecture_WIP.md`, CLI guides, and this document with controller workflows, hardware hookup guidance (separate DUT/TTH ports), and troubleshooting steps for fixtures/log analysis.

## Step 1: Controller HTS Completion Plan

- **Scope**: `host-services/tth-controller.js` must behave like any HTS process but now orchestrates a physical ESP32 TTH. Responsibilities include honouring suite/test metadata/env (`HTS_TTH_SCRIPT_ID`, `HTS_TTH_MODE`, `HTS_TTH_PORT`, `HTS_TTH_FLASH`), flashing or reusing the TTH image, resetting the board, capturing its serial output, and relaying readiness/fixtures back to the harness via `__HTS_FIXTURES__` and `__HTS_READY__`.
- **Program metadata**: each TTH script has a manifest (`host-services/tth-programs/<id>.json`) declaring the Espruino source, supported modes, and default/mode-specific fixtures. The controller loads the manifest referenced by `HTS_TTH_SCRIPT_ID`, applies the requested mode overrides, and merges with static fixtures from suite metadata.
- **Flash policy**: `flash=always` runs the Espruino CLI to upload the script before each test; `flash=skip` assumes the TTH already hosts the correct firmware (only a soft reset occurs). Future optimisation could add hash checking to skip flashing when the existing image matches.
- **Serial management**: after flashing/resetting, the controller opens the TTH serial port (via `serialport` or EspruinoTools) to stream stdout/stderr into `logs/<scope>.hts.*`. It watches for sentinel markers emitted by the TTH (`__HOST_FIXTURES__{...}`, `__HOST_READY__`) and forwards them upstream as `__HTS_FIXTURES__` / `__HTS_READY__`. Failures/timeouts emit an error and exit non-zero so the harness marks the suite/test accordingly.
- **Fixtures**: host-provided data (SSID, passwords, host/port, tokens) remain namespaced under `fixtures.hostService`. The controller merges manifest defaults, suite-level overrides, and dynamic data from `__HOST_FIXTURES__` before printing the final JSON sentinel.
- **Lifecycle**: the controller stays alive for the duration of the suite/test, handling SIGINT/SIGTERM by resetting the TTH and closing the serial port before exiting so hardware is left in a known state.
- **Implementation steps**:
  1. Finalise the manifest schema (`script`, `modes`, `defaultFixtures`, `modeOverrides`) and provide the initial `http_host_echo` entry.
  2. Factor helper utilities (e.g., `host-services/tth-controller/lib.js`) for manifest loading, CLI arg construction, and sentinel parsing.
  3. Implement flashing/reset helpers around the Espruino CLI (`espruino --port ... --board ... --code <script>`), honouring the flash policy.
 4. Integrate serial listeners that capture TTH output and detect sentinels; pipe all stdout/stderr into the HTS log files.
 5. Add manual CLI support so the controller can be run standalone for debugging with the same env vars used by the harness.

### Step 1 progress (2026-01-18)

- **Development focus**: deliver the flashing/reset orchestration for the Target Test Host (TTH) controller so it can either program the ESP32 host (`flash` policy) or reuse a persisted image (`reuse` policy) and still surface `__HTS_FIXTURES__` / `__HTS_READY__` for the harness.
- **Design decisions**
  - Use the existing Espruino CLI for all interactions (flash, save, reset, monitor) to minimise dependencies and honour the same config knobs the harness already uses.
  - Capture sentinel lines during every CLI phase (flash upload, save, reset, long-lived monitor) so readiness is detected even if the TTH emits fixtures before the dedicated monitor connects.
  - Support persistence via `save();E.reboot();` when a manifest sets `flash.saveOnSend=true`. “Reuse” mode simply reboots the saved image through the monitor stdin instead of spawning a separate reset command.
- **Challenges & fixes**
  - *Lost sentinels during flashing*: initial prototype closed the CLI right after upload, so the TTH’s `__HOST_FIXTURES__` / `__HOST_READY__` lines were missed. Fixed by parsing stdout during the upload itself.
  - *Reuse path timing*: sending `reset();` in a short-lived CLI closed the port before reboot messages appeared. Solution: keep the monitor session open, issue `E.reboot();` via its stdin, and parse the resulting boot log for sentinels.
  - *Persistence verification*: without `save();` the TTH lost its script on reset, so reuse mode always timed out. Added manifest-driven `flash.saveOnSend` plus a controller step that calls `save();E.reboot();` immediately after flashing.
- **Code changes**
  - `host-services/tth-programs/http_host_echo.json` now defines the schema version, script asset, fixture defaults, and flash directives; `http_host_echo.espruino` (new file) emits `__HOST_FIXTURES__` / `__HOST_READY__`.
  - `host-services/tth-controller/programLoader.js` handles manifest loading, deep merges, and flash settings (`saveOnSend`, `ramUpload` placeholder).
  - `host-services/tth-controller.js` gained full orchestration: CLI spawn helpers, sentinel parsing during flash/save/reset, long-lived monitor with optional `E.reboot()`, persistence hooks, and timeout/error handling. A lightweight CLI argument parser (`--port`, `--script`, `--mode`, etc.) mirrors the env vars so the controller can be run interactively without exporting env state.
- **Manual test runs**
  1. **Flash & persist**  
     - Setup: TTH ESP32 on `/dev/ttyUSB0`, DUT idle.  
     - Command:  
       ```
       HTS_TTH_PORT=/dev/ttyUSB0 HTS_TTH_SCRIPT_ID=http_host_echo \
       HTS_TTH_MODE=http_echo HTS_TTH_FLASH_POLICY=flash \
       HTS_TTH_READY_TIMEOUT_MS=60000 node host-services/tth-controller.js
       ```  
     - Outcome: controller uploads the script, prints `__HTS_FIXTURES__… __HTS_READY__`, runs `save();E.reboot();`, and keeps the monitor streaming.
  2. **Reuse saved image (env variables)**  
     - Pre-req: previous flash run completed (script persisted).  
     - Command:  
       ```
       HTS_TTH_PORT=/dev/ttyUSB0 HTS_TTH_SCRIPT_ID=http_host_echo \
       HTS_TTH_MODE=http_echo HTS_TTH_FLASH_POLICY=reuse \
       HTS_TTH_READY_TIMEOUT_MS=60000 node host-services/tth-controller.js
       ```  
     - Outcome: monitor connects, sends `E.reboot();`, captures the boot log (`__HOST_FIXTURES__`, `__HOST_READY__`), and re-emits the HTS fixtures/readiness markers. Process remains attached for harness log capture.
  3. **Reuse saved image (CLI flags)**  
     - Command:  
       ```
       node host-services/tth-controller.js \
         --port /dev/ttyUSB0 --script http_host_echo \
         --mode http_echo --flash-policy reuse --ready-timeout 60000
       ```  
     - Outcome: identical to the env-driven run; the controller emitted `__HTS_FIXTURES__` / `__HTS_READY__` and streamed the TTH logs, confirming the manual CLI interface works as expected.

These steps complete the “Implement flashing/reset + serial monitoring” portion of the plan; next we will wire the suites/tests to call the controller HTS so the harness can launch it automatically.

### Watchdog-disabled TTH firmware validation (2026-01-18)

- **Why a new Espruino build?** During earlier controller shakedowns the ESP32C3-based TTH repeatedly rebooted while idle because the default watchdog stayed armed even though the HTTP helper spent most of its time waiting for DUT traffic. Harness runs would therefore lose the AP mid-suite and the DUT would eventually return `no_result`. To stabilise the host side we produced a watchdog-disabled Espruino build (sdkconfig tweak) tailored for the TTH.
- **Current behaviour**: Flashing the new firmware followed by `http_host_echo.espruino` keeps the AP/HTTP service alive long enough for end-to-end testing; the controller logs show consistent `__HOST_FIXTURES__` / `__HOST_READY__` output, and manual scans from the DUT see `TTH-HTTP-ECHO` on channel 6 whenever the script loads cleanly.
- **Impact on harness runs**: Full suite execution (`node scripts/run-tests-gordonV4.js --board ESP32 --port /dev/ttyUSB0 --suites http-client-host --serial-debug`) now progresses past HTS startup every time. Recent failures are purely DUT-side (e.g., STA scan returning `[]` or `wifi.connect` never firing), which gives a clear next diagnostic focus.
- **Edge case**: Occasionally the TTH crashes on boot with `assert failed: jsvUnLockInline … wifi.startAP`. This is a JS engine guard complaining that `wifi.startAP` was called while a locked JS variable was already freed—likely due to the AP reconfiguration loop running before the interpreter has finished initialising. Re-uploading the script clears the issue for now, but we plan to add a guard/delay in the TTH program so `startAP` retries gracefully instead of asserting.

### DUT Wi-Fi failure investigation

- **Context**: After wiring `tests/http-client-host/testConfig.json` to the controller HTS and running `node scripts/run-tests-gordonV4.js --board ESP32 --port /dev/ttyUSB1 --suites http-client-host --serial-debug`, the harness successfully spawned the controller, but `test_host_http_client.js` ended with `FAIL (no_result)`. The DUT logs show it disconnecting and reconnecting to `TTH-HTTP-ECHO` but never printing the HTTP request or wrapper JSON.
- **Current state recap**:
  - The controller HTS foundation is working: `host-services/tth-controller.js` can flash or reuse the TTH, stream its serial output, and translate `__HOST_FIXTURES__` / `__HOST_READY__` into standard HTS sentinels derived from the manifest (`host-services/tth-programs/http_host_echo.json`). The Espruino script boots an HTTP-echo AP (`TTH-HTTP-ECHO` / `TTHpass123`) with deterministic fixture output.
  - Manual end-to-end validation has succeeded: when RF conditions cooperated (controller reuse mode, DUT triggered manually), `tests/http-client-host` connected to the TTH AP, hit the HTTP echo endpoint, and reported PASS. This confirms the DUT test and host program are functionally correct.
  - The ongoing blocker is RF/connection instability. During automated runs the DUT frequently hits `AUTH_EXPIRE`, the harness records `no_result`, and controller logs show AP restarts/socket errors despite the HTS readiness sentinel. Stabilising the AP/DUT interaction (AP reliability, saved credentials, DUT retry logic) is necessary before broader automation.
- **Observed behaviour**:
  - Controller logs confirm the TTH reboots cleanly, emits `__HOST_FIXTURES__` / `__HOST_READY__`, and keeps the AP alive (albeit with intermittent ESP32 AP warnings). No HTS timeout occurred.
  - DUT log shows `[HTS_TEST] Disconnecting before connecting to TTH-HTTP-ECHO` followed by `wifi:mode : sta` but no subsequent “[HTS_TEST] Wi-Fi connect callback fired” line, indicating the `wifi.connect` callback never ran before the run hit the harness timeout.
- **Failure reproduction (manual)**:
  - Uploading `results/20260118-101918/ESP32/sources/test_host_http_client.js` to the DUT via REPL produced:
    ```
    I (22056) wifi:mode : sta (08:b6:1f:70:14:e8)
    [HTS_TEST] Disconnecting before connecting to TTH-HTTP-ECHO
    [HTS_TEST] Wi-Fi scan: [{"rssi":-89,"authMode":"open","ssid":"HP-Print-6A-ENVY 5530 series","mac":"94:57:a5:83:02:6a","channel":"1"}]
    [HTS_TEST] Calling wifi.connect to TTH-HTTP-ECHO
    I (22763) wifi:new:<6,1>, old:<6,0>, ap:<255,255>, sta:<6,1>, prof:1
    I (23457) wifi:state: init -> auth (b0)
    I (24458) wifi:state: auth -> init (200)
    I (24460) wifi:new:<6,0>, old:<6,1>, ap:<255,255>, sta:<6,1>, prof:1
    [HTS_TEST] Wi-Fi event disconnected {"ssid":"TTH-HTTP-ECHO","mac":"08:b6:1f:70:17:b1","reason":"2","msg":"AUTH_EXPIRE"}
    {"__espruino_test__":true,"file":"test_host_http_client.js","status":"fail","reason":"Wi-Fi connect timeout"}
    ```
  - This confirms the DUT behaves correctly: it scans, attempts to authenticate with `TTH-HTTP-ECHO`, and the AP drops the station with `AUTH_EXPIRE`.
- **Controller/TTH diagnostics**:
  - `suite_http-client-host.hts.stdout` shows repeated `ERROR: jswrap_wifi_startAP: wifi_set_config: 257 - ssid=` and `ERROR: Socket creation failed` messages, followed by Guru Meditation resets on the TTH ESP32. Although the HTS emits `__HOST_READY__`, the AP keeps rebooting, so the SSID is rarely visible when the DUT scans.
- **Likely root causes** (ranked by probability):
  1. **AP reinitialisation errors on the TTH** – the log spam (`wifi_set_config: 257 - ssid=`, `Socket creation failed`) suggests `wifi.startAP` is sometimes invoked with invalid parameters or before the interface is ready, forcing repeated AP restarts right as the DUT attempts to connect.
  2. **Socket binding too early** – the HTTP server binds before the AP IP stack is up, triggering repeated socket creation failures that may ripple into AP restarts.
  3. **Credential persistence mismatch** – without a successful `save()` the AP settings may vanish after reboot, causing intermittent SSID broadcasts or reverting to STA mode.
  4. **RF weakness / channel contention** – RSSI readings (≈ −89 dBm) hint the DUT may be seeing a marginal signal. Even if the AP is up, weak signal leads to `AUTH_EXPIRE` before handshake completes.
  5. **Controller timing** – the harness uploads the DUT immediately after the controller sees `__HOST_READY__`. If the AP isn’t fully functional (DHCP not running yet) the first connect attempt fails and the test doesn’t retry.

- **Diagnostic priorities**:
  1. Instrument `http_host_echo.espruino` so AP start/stop events, channel, and IP assignments are logged once per boot; ensure `wifi.startAP` is not retried unless explicitly needed and call `wifi.stopAP()` before reconfiguration.
  2. Double-check the TTH script saves its configuration (`save();` or `wifi.setConfig({save:true})`) so reuse mode truly boots the persisted AP without needing fresh flashing.
  3. Run the harness with an enforced delay (e.g., `HTS_TTH_READY_DELAY_MS`) between `__HTS_READY__` and DUT upload to see if connection success improves.
  4. Add retry logic (or manual REPL tests) on the DUT side to attempt multiple `wifi.connect` calls when the disconnect event reports `AUTH_EXPIRE` / `NO_AP_FOUND`.
  5. Validate RF environment: keep the TTH close to the DUT, confirm SSID visibility via repeated `wifi.scan()` runs, and note RSSI values.
  6. Review controller logs for Guru Meditation resets or unexpected reboots; if present, capture core dumps or simplify the TTH script until stable.

**REPL stress tests (2026-01-18 evening)**:

- **Goal**: reproduce the harness failure in isolation by repeatedly connecting the DUT STA to the TTH AP and watching for missing callbacks/events.
- **Setup**: TTH running `http_host_echo.espruino` (persisted in flash). DUT flashed with ESP32 2v28.61, REPL attached to `/dev/ttyUSB1`.
- **Tests performed**:
  1. **Basic loop**: script repeatedly called `wifi.connect('TTH-HTTP-ECHO')` with a 5 s timeout between disconnects. Result: first attempt succeeded; subsequent attempts reported `wifi:state` logs showing successful association but the `wifi.connect` callback never fired (`AUTH_EXPIRE` messages appeared in disconnect events).
  2. **Extended timeout (10 s)**: doubling `CONNECT_TIMEOUT_MS` allowed two successful cycles; after the third attempt the callback still stopped firing even though `wifi:connected` appeared in the ESP-IDF log.
  3. **Event listeners**: added `wifi.on('connected')` / `wifi.on('disconnected')` logging—events fired for the first two attempts only. When callbacks stopped, events also stopped, confirming Espruino’s Wi-Fi driver wasn’t delivering user-level notifications despite the ESP-IDF layer connecting.
  4. **`wifi.stop`/`wifi.disconnect` reset experiments**: tried a script that called `Wifi.stop()` (not available on ESP32) and a variant that called `wifi.disconnect()` with a 0.5 s delay before reconnecting. Both variants showed the same behaviour: the first two attempts worked, then `wifi.connect` callbacks never fired again even though the ESP-IDF layer continued to connect.
- **Final script used for the disconnect/reset loop**:
  ```javascript
  var WIFI = require('Wifi');
  var SSID = 'TTH-HTTP-ECHO';
  var PASSWORD = 'TTHpass123';
  var ATTEMPT_INTERVAL_MS = 10000;
  var CONNECT_TIMEOUT_MS = 10000;
  var RESET_DELAY_MS = 500;

  function log(msg) { console.log('[STA_RESET_TEST] ' + msg); }

  WIFI.on('connected', function(info) {
    log('Event connected ' + JSON.stringify(info));
  });
  WIFI.on('disconnected', function(info) {
    log('Event disconnected ' + JSON.stringify(info || {}));
  });

  function resetAndConnect(attempt) {
    log('Attempt #' + attempt + ' starting');
    var timeout = setTimeout(function () {
      log('Timeout waiting for connect callback');
    }, CONNECT_TIMEOUT_MS);

    WIFI.disconnect(function () {
      log('wifi.disconnect() complete, waiting ' + RESET_DELAY_MS + 'ms');
      setTimeout(function () {
        WIFI.connect(SSID, { password: PASSWORD }, function (err) {
          clearTimeout(timeout);
          if (err) {
            log('Connect callback error: ' + err);
            return;
          }
          var info = WIFI.getIP() || {};
          log('Connected via callback, IP=' + info.ip);
          setTimeout(function () {
            log('Disconnecting via wifi.disconnect()');
            WIFI.disconnect();
          }, 1000);
        });
      }, RESET_DELAY_MS);
    });
  }

  var attempt = 1;
  resetAndConnect(attempt++);
  setInterval(function () {
    resetAndConnect(attempt++);
  }, ATTEMPT_INTERVAL_MS);
  ```
- **Conclusion**: the unreliable harness behaviour stems from the DUT’s Wi-Fi stack dropping JS-level connect callbacks/events after a couple of association cycles. RF signal is strong (RSSI ≈ −10 dBm), so the issue lies in the Espruino Wi-Fi driver on ESP32. For now we must either poll `wifi.getIP()` until non-null or rely on lower-level events (if they can be made reliable) instead of waiting solely on the initial `wifi.connect` callback.

- **ESP32C3 comparison run (fresh firmware, ESP-IDF 5.x)**:
  - Reused the same `STA_RESET_TEST` script on a newly-flashed ESP32C3 connected to the same `TTH-HTTP-ECHO` AP.
  - Every reconnect attempt continued to emit the `wifi.connect` callback and `wifi.on('connected')` event, with DHCP delivering `192.168.4.3` each time. No timeouts, no missing callbacks, and the event stream remained healthy beyond seven consecutive cycles.
  - This demonstrates the newer ESP-IDF-based ESP32C3 firmware handles repeated STA connections correctly, so the callback loss observed on the ESP32 is a platform-specific bug.
  - **Conclusion**: promote the ESP32C3 to the “golden” host/DUT board for Wi-Fi-centric testing while we keep the older ESP32 for compatibility checks. Using the C3 avoids the callback-drop issue and lets us advance the TTH harness work without being blocked by ESP32 firmware limitations.

Capturing these diagnostics should narrow the root cause so we can stabilise the AP/DUT interaction before proceeding with broader TTH integration.

**Update (instrumentation applied)**: `host-services/tth-programs/http_host_echo.espruino` now logs `stopAP` attempts, each `startAP` invocation (SSID/channel), success callbacks (current AP IP), and HTTP server bind status. These logs should surface immediately in the controller HTS stdout for upcoming tests.

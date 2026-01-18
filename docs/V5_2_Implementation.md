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

# V5.1 Host Test Service Implementation Snapshot

This document captures the state of Host Test Service (HTS) development as carried over to branch `V5.1`. It derives from `docs/V5_implementation_1.md` but adds the incremental context gathered during the recent work.

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

All of the items listed below are now captured in commit `bbd379877d77e17cf28c8fce6f823cc08d18cae8`.

## V5.1 Functional Areas Delivered (as of 2025-11-07)

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

## Current Status & Blockers

- **HTTP host-service demo** works end-to-end only when the ESP32 is already associated with the Wi-Fi network. Fresh connects often fail with `ESP_ERR_WIFI_SSID`/`WIFI_REASON_NO_AP_FOUND`, leading to `no_result`. Work continues to stabilise the STA connect path (stronger AP, retries, firmware tweaks).
- **ESP32C3** experimentation shows REPL uploads to flash succeed, but RAM uploads hit the known `FIFO_FULL` issue; focus returns to ESP32 until the Wi-Fi reliability is resolved.

## Next Steps

1. Stabilise ESP32 Wi-Fi joins post-reset so the HTTP HTS suite passes reliably in the harness (consider closer AP, longer settle delays, or driver updates).
2. Once networking is stable, expand HTS coverage (additional host services, DUT tests) and add unit tests for the HTS helpers in `scripts/run-tests-gordonV4.js`.
3. Revisit ESP32C3 support (upload mode fixes) after the V5.1 HTS baseline is proven on ESP32.

## HTS Wi-Fi Approach – Pros & Cons (Post-V5.1 Reflection)

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

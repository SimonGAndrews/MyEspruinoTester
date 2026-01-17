# Test Harness Architecture (Outline)

_Work in progress. This document will capture the technical details of the v4 test harness so the test-writing guide can stay beginner friendly._

## 1. Overview
- Goals of the harness
- High-level workflow (discovery → wrapping → execution → artefacts)

## 2. Discovery Pipeline
- Suite registration (`board.json`, `testConfig.json`)
- `resolveSuiteTests` flow (execution order, manifest fallback)
- Handling of grouping directories (e.g., `tests/demo/getStarted`)

## 3. Wrapper Anatomy
- Prologue injections (helpers, fixtures, guard variables)
- Heartbeat, timeout, and result polling
- Relationship between helpers (`__pass`, etc.) and the final JSON payload

## 4. Merge Layers
- Session defaults (`configDefaults.json`)
- Board metadata (`board.json`, `fixture.json`, `cli.json`)
- Suite metadata (`testConfig.json`)
- Per-test metadata (`/* JSON { ... } */`)
- CLI overrides (command-line flags)
- Provenance tracking

## 5. Execution & CLI Interaction
- Pre/post delays
- Storage preload flow
- Handling `SAVE_ON_SEND`, `RESET_BEFORE_SEND`, `--config` pairs
- Error paths (device busy, no_result, invalid JSON)

## 6. Artefacts
- `runner-metadata/<test>.json`
- `sources/<test>.js`
- `<suite>.json`
- `run-summary.json`
- Logs (`.stdout`, `.stderr`, storage logs)

## 7. Host Test Services (HTS)
- Suite/test metadata now accept a `hostTestService` block (`name`, `script`, optional `env`, `startupTimeoutMs`, static fixtures). Only one HTS may be active per scope; suite-level definitions apply to all tests unless a test overrides the field.
- **Execution lifecycle**
  1. Suite/test prep: the harness normalises `hostTestService` metadata (validates script path, merges env, records provenance). Suite-level HTS handles are created once; per-test HTS handles are created just before the DUT run.
  2. HTS spawn: `startHostTestService` launches the Node script with `stdio` pipes, applies env overrides, and tracks the child PID in a global list for signal handling.
  3. Startup protocol: the harness streams HTS stdout line-by-line, looking for two sentinels:
     - `__HTS_FIXTURES__{...}`: JSON payload merged into `fixtures.hostService.<name>`; malformed JSON triggers `hts_fixture_error`.
     - `__HTS_READY__`: indicates the HTS is ready; must arrive before `startupTimeoutMs` (defaults to 5 s) or the harness reports `hts_startup_timeout` and injects `fixtures.hostService.<name>.error`.
  4. Test execution: once ready, the DUT test runs with `global.ESPRUINO_FIXTURES` containing the latest host fixtures (`fixtures.hostService`, `fixtures.global`, etc.). Tests inspect `fixtures.hostService.<name>` to decide whether to proceed or `__skip`.
  5. Shutdown: per-test HTS handles stop in a `finally` block (after capturing stdout/stderr to `logs/test_<id>.hts.*`). Suite-level HTS handles stop after all suite tests complete; the harness also registers SIGINT/SIGTERM handlers to call `stopAllHostTestServices`.

- **Protocols & artefacts**
  - HTS scripts can emit multiple fixture payloads (e.g., initial configuration followed by runtime updates). The last payload wins for each key; downstream tests see the merged object.
  - HTS log files (`logs/<scope>.hts.stdout/.stderr`) capture everything the host script prints (including ready sentinels). Each test’s metadata includes `hostTestServiceLogs` with file paths and any `error`/`errorMessage`.
  - Failures during HTS startup or execution generate diagnostics attached to the test record (`runner-metadata/<test>.json`) so engineers can correlate host failures with DUT results.

- Parsed fixture payloads are merged under `fixtures.hostService.<name>` and optionally into `fixtures.global`. If startup fails or payloads are invalid the harness records `fixtures.hostService.<name>.error` so DUT tests can `__skip`.
- HTS stdout/stderr are persisted to `logs/<scope>.hts.stdout/.stderr`, and references are stored in each test’s metadata (`hostTestServiceLogs`). Failures/diagnostics include these paths.
- Process lifecycle: HTS handles receive SIGTERM on harness shutdown or suite completion, with a grace period before SIGKILL. Per-test HTS instances stop in a `finally` block immediately after the test run; suite-level HTS instances stop once all suite tests are complete.
- Controller-style HTS instances (future enhancement) will manage a “Target Test Host” ESP32 by flashing/resetting it, collecting ready sentinels, and relaying fixtures/logs through the same interface. They will respect per-suite policies such as “flash every run” vs. “reuse existing image.”

## 8. Future Considerations
- Flash-based wrapper mode
- Assertion helpers
- Additional CLI/sandbox scenarios

## 9. Target Test Host (TTH) Architecture (Planned)
- **Goal**: Provide a deterministic, hardware-backed Wi-Fi “host” by pairing the harness with a dedicated ESP32 running vetted Espruino scripts, while keeping the existing HTS interface intact.
- **Controller HTS**: Rather than spawning a service directly, the harness launches a controller HTS (Node process) that:
  - Programs/resets the TTH via EspruinoTools (respecting a per-suite policy: *flash every run* vs. *reuse existing image*).
  - Monitors the TTH’s serial output for host-ready sentinels (e.g., `__HOST_READY__`, fixture JSON) and re-emits them as `__HTS_FIXTURES__` / `__HTS_READY__` for the harness.
  - Captures TTH serial logs and writes them to the standard `logs/<scope>.hts.*` files so metadata references and diagnostics behave like any other HTS.
- **TTH responsibilities**:
  - Run curated, versioned Espruino scripts implementing host-side tests (HTTP echo, polling client, etc.).
  - Emit explicit readiness/health markers and fixture payloads (SSID/channel/password, endpoint URLs) for DUT consumption.
  - Provide deterministic Wi-Fi behaviour (fixed channel, known RSSI by virtue of physical proximity) and expose any host-side assertions back to the controller.
- **Harness impact**:
  - No change to the core execution engine: it still spawns an HTS per suite/test, merges fixtures, and tears down hosts in `finally` blocks.
  - Per-suite metadata will gain knobs for the TTH policy (flash vs. reuse) and possibly the selected host script/version.
- **Open tasks**:
  - Define the controller HTS CLI/API (env vars for TTH serial port, flash policy, host script ID, mode selection).
  - Version and store the “golden” TTH scripts alongside the harness, with documentation on how to update them.
  - Extend diagnostics so tests can see whether a failure stemmed from the DUT or the TTH (e.g., propagate controller errors via `fixtures.hostService.<name>.error` and metadata).

### 9.1 Controller HTS CLI/API (Proposed)
- `HTS_TTH_PORT` *(required)* – serial/USB path for the Target Test Host (e.g. `/dev/ttyUSB1`)
- `HTS_TTH_BAUD` – baud rate for the TTH (default 115200)
- `HTS_TTH_FLASH_POLICY` – `flash`, `reuse`, or `auto` (flash if version mismatch)
- `HTS_TTH_SCRIPT_ID` – ID of the golden TTH script to deploy (controller maps IDs → actual `.js` blobs)
- `HTS_TTH_MODE` – logical scenario requested by the DUT test (e.g. `http_echo`, `ap_poll`)
- `HTS_TTH_FIXTURE_OVERRIDES` – optional JSON string merged into emitted fixtures (SSID/password overrides, etc.)

The controller continues to emit `__HTS_FIXTURES__` and `__HTS_READY__` so the harness requires no changes; per-test HTS metadata simply passes these env vars to the controller.

### 9.2 TTH Mode Selection Contract
- Each TTH script exposes a mode dispatcher (e.g. a `modes` object mapping IDs to functions). Modes may represent entire test programs or sub-scenarios.
- Controller handshake:
  1. Flash/reset TTH per policy and wait for `__HOST_READY__`.
  2. Send `SET_MODE <modeId>\n` over serial (plain text).
  3. TTH invokes the corresponding function and, once ready, prints `__HOST_MODE_READY__<modeId>` along with any fixture payload (e.g. `__HOST_FIXTURES__{...}`).
  4. Controller relays payloads via `__HTS_FIXTURES__...` and emits `__HTS_READY__`.
- This contract allows multiple modes inside one TTH firmware without reflashing between DUT tests (unless policy = `flash`), while keeping the selection mechanism standardised.

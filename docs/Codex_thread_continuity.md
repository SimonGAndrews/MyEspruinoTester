# Codex Thread Continuity Reference

This document captures the critical project context so that any new Codex thread (or agent) can immediately continue the work inside `/home/simon/Espruino/MyEspruinoTester01` without losing the investigative state that has been built up so far.

---

## 1. Repository, Branch & Tooling Snapshot

- **Repo root**: `/home/simon/Espruino/MyEspruinoTester01`
- **Active branch**: `V5.2` (see `git status -sb` for uncommitted work; current HEAD `3dcfbfc5` holds controller scaffolding + latest documentation).
- **Primary scripts**
  - Harness entry point: `scripts/run-tests-gordonV4.js`
  - Host Test Service (HTS) controller: `host-services/tth-controller.js`
  - Legacy Node HTS helpers: `host-services/http-host-echo.js`, `host-services/http-ap-poll.js`
- **Toolchain versions**
  - Node.js: `v20.15.0`
  - Espruino CLI: `./node_modules/.bin/espruino` (no `--version`; use `--help`)
- **Key docs for background**
  - `docs/V5_2_Implementation.md` – chronological build log, covers HTS + TTH work.
  - `docs/V5_features_spec.md` – HTS specification (fixtures, readiness, failure semantics).
  - `docs/test-harness-architecture_WIP.md` – architectural evolution, now includes TTH section.
  - `docs/run-tests-gordonV4_workflow.md` & `docs/run-tests-gordonV4_summary.md` – harness behaviour.

---

## 2. Hardware Topology (current lab setup)

| Role | Device | Port | Firmware | Notes |
|------|--------|------|----------|-------|
| DUT (Device Under Test) | ESP32-WROOM | `/dev/ttyUSB0` | `2v28.61` | Runs suites like `http-client-host`. |
| TTH (Target Test Host) | ESP32C3 | `/dev/ttyACM0` | `2v28` (ESP-IDF 5.x) | Hosts the Wi-Fi AP/HTTP echo service. |

- USB assignments are static for the session; confirm with `ls /dev/ttyUSB* /dev/ttyACM*` before tests.
- Power both boards from the host PC to keep grounds common.

---

## 3. Current Functional Areas (quick index)

1. **Host Test Service (HTS) plumbing** – `scripts/run-tests-gordonV4.js` spawns suite/test HTS processes, captures fixtures via `__HTS_FIXTURES__`, and records HTS logs.
2. **Controller HTS** – `host-services/tth-controller.js` (work in progress) flashes/resets a dedicated TTH ESP32, monitors its serial output, and forwards readiness to the harness.
3. **TTH programs** – JSON manifests + Espruino scripts under `host-services/tth-programs/` (currently `http_host_echo`).
4. **DUT suites/tests** – `tests/http-client-host` uses the HTS fixtures to run an HTTP client against the TTH AP; `tests/wifi-ap` still targets legacy Node HTS helpers.
5. **Documentation** – V5.1/5.2 implementation logs, HTS spec, CLI guide, metadata diagrams all reflect the latest terminology (fixtures under `fixtures.hostService` etc.).

---

## 4. Commands Cheat Sheet

### 4.1 Harness runs (DUT on `/dev/ttyUSB0`)
```bash
node scripts/run-tests-gordonV4.js \
  --board ESP32 \
  --port /dev/ttyUSB0 \
  --suites http-client-host \
  --serial-debug
```
- Requires `tests/http-client-host/testConfig.json` to define `hostTestService` referencing the controller and Wi-Fi STA credentials under `fixtures`.
- Outputs to `results/<timestamp>/ESP32/…` (stdout/stderr logs + saved sources).

### 4.2 Controller HTS manual runs (TTH on `/dev/ttyACM0`)
```bash
# Reuse mode (assumes script already saved to flash)
node host-services/tth-controller.js \
  --port /dev/ttyACM0 \
  --script http_host_echo \
  --mode http_echo \
  --flash-policy reuse \
  --ready-timeout 60000

# Flash & persist the script before monitoring
node host-services/tth-controller.js \
  --port /dev/ttyACM0 \
  --script http_host_echo \
  --mode http_echo \
  --flash-policy flash \
  --ready-timeout 60000
```
- Equivalent ENV vars (used by harness metadata):
  - `HTS_TTH_PORT`, `HTS_TTH_SCRIPT_ID`, `HTS_TTH_MODE`
  - `HTS_TTH_FLASH_POLICY` (`flash` / `reuse`)
  - `HTS_TTH_READY_TIMEOUT_MS`
- Controller logs appear under `results/.../logs/suite_<suite>.hts.stdout|stderr`.

### 4.3 Manual TTH flashing via REPL (fallback)
1. `./node_modules/.bin/espruino --port /dev/ttyACM0 --board ESP32C3 --no-ble`
2. Paste `host-services/tth-programs/http_host_echo.espruino`
3. At the prompt run:
   ```
   save();
   reset();
   ```
4. Verify boot log prints:
   ```
   __HOST_FIXTURES__{"ssid":"TTH-HTTP-ECHO",...,"host":"192.168.4.1","port":80}
   __HOST_READY__
   [TTH] HTTP echo ready at http://192.168.4.1:80/hts
   ```

---

## 5. HTS & TTH Architecture Overview

1. **Harness metadata** (`tests/<suite>/testConfig.json`)
   - `hostTestService.script` now points to `host-services/tth-controller.js`.
   - `env` provides controller knobs (`HTS_TTH_*`) and static fixture overrides.
2. **Controller HTS**
   - Loads manifest `host-services/tth-programs/<script>.json`.
   - Builds Espruino CLI command to flash or reuse the TTH image.
   - Monitors TTH serial output, translating `__HOST_FIXTURES__` → `__HTS_FIXTURES__` and `__HOST_READY__` → `__HTS_READY__`.
   - Streams logs into `logs/<scope>.hts.stdout/stderr`.
3. **TTH program**
   - Espruino script stored in flash; boots into the requested mode (e.g., HTTP echo AP).
   - Emits fixtures (SSID/password/channel + endpoint info) and readiness markers.
   - Accepts future mode selections (e.g., HTTP server vs. AP poll) via manifest-defined handlers.
4. **DUT test**
   - Receives merged fixtures under `fixtures.hostService`.
   - Connects to the provided SSID, waits for DHCP, and talks to the host endpoint.
   - Reports result via wrapper JSON (`{"__espruino_test__":true,...}`).

---

## 6. Key Files & Where to Look

| File | Purpose |
|------|---------|
| `host-services/tth-controller.js` | Node HTS controller orchestrating the TTH device. |
| `host-services/tth-controller/programLoader.js` | Manifest loader & merge helpers. |
| `host-services/tth-programs/http_host_echo.json` | Defines the HTTP AP/echo host script metadata. |
| `host-services/tth-programs/http_host_echo.espruino` | Espruino script flashed onto the TTH. |
| `tests/http-client-host/testConfig.json` | Suite metadata (fixtures, HTS env) for DUT HTTP-client demo. |
| `tests/http-client-host/test_host_http_client.js` | DUT-side test logic; logs `[HTS_TEST] …`. |
| `docs/V5_2_Implementation.md` | Detailed development log (useful for history & rationale). |

---

## 7. Troubleshooting & Diagnostics

1. **No `__HTS_READY__` in HTS logs**
   - Check controller stdout (`results/.../logs/suite_<suite>.hts.stdout`) for errors (“Failed to parse JSON”, “Timed out waiting for __HOST_READY__”).
   - Ensure the TTH script actually prints `__HOST_READY__` (watch REPL on `/dev/ttyACM0`).
2. **DUT fails with `Wi-Fi connect timeout`**
   - Confirm the DUT sees `TTH-HTTP-ECHO` in `wifi.scan()` results.
   - Check TTH log for AP errors (`jswrap_wifi_startAP: wifi_set_config: 257` means configuration failed; re-upload script).
3. **HTTP request fails with `Unable to locate host`**
   - Ensure TTH fixtures advertise `host:"192.168.4.1"` (hard-coded now).
   - Confirm DUT obtained IP `192.168.4.x` (`wifi.getIP()` inside the test).
4. **Controller flash path unreliable**
   - Use `--flash-policy reuse` once the script is saved.
   - When flashing is required, keep REPL disconnected and avoid powering off the TTH mid-run.
5. **Serial conflicts**
   - Only one process can hold `/dev/ttyUSB0` (DUT) or `/dev/ttyACM0` (TTH). Disconnect REPL sessions before launching harness/controller.

---

## 8. Outstanding Work / Open Questions

1. **Controller integration** – Update suite metadata so the harness automatically spawns the controller HTS (currently manual in some flows).
2. **Flash policy UX** – Provide deterministic detection of whether the TTH already hosts the correct script (hashing or sentinel version check).
3. **DUT Wi-Fi failure handling** – Document and implement retry/backoff strategies when the TTH AP rejects connections (`AUTH_EXPIRE`).
4. **Additional TTH modes** – Extend manifests/scripts for other services (HTTP client poller, serial echo, GPIO exerciser).
5. **Documentation updates** – Ensure `docs/test-harness-architecture_WIP.md`, CLI guides, and implementation logs continue to mirror the evolving HTS/TTH architecture.

---

## 9. Quick Reference Logs

- **Harness results**: `results/<stamp>/ESP32/run.log` + per-test stdout/stderr + saved sources.
- **HTS logs**: `results/<stamp>/ESP32/logs/suite_<suite>.hts.stdout` / `.stderr`.
- **TTH manual monitoring**: when running controller manually, all TTH serial output is echoed to the console plus the log files.

---

## 10. Escalation Checklist for New Threads

1. Run `git status -sb` → confirm branch `V5.2`, note dirty files.
2. Inspect `docs/V5_2_Implementation.md` (latest sections) to understand the current task.
3. Verify hardware connections (`/dev/ttyACM0` = TTH ESP32C3, `/dev/ttyUSB0` = DUT ESP32).
4. Start the HTS controller (reuse mode) and ensure it reaches `__HTS_READY__`.
5. Execute the harness command for `http-client-host`; inspect `results/...` if failures occur.
6. Record any new observations back into `docs/V5_2_Implementation.md` and, if needed, update this continuity reference.

With these notes, a fresh Codex session can resume development, debugging, or documentation edits without rediscovering prior context.

---

## 11. Interactive Workflow Blueprint

Use this quick-start sequence whenever a new thread needs to run live tests or debug hardware:

1. **Prep environment**
   - `cd /home/simon/Espruino/MyEspruinoTester01`
   - `git status -sb` (confirm branch and note local edits)
   - `ls /dev/ttyUSB* /dev/ttyACM*` to double-check DUT/TTH assignments.
2. **Confirm TTH readiness**
   - Run controller in reuse mode:  
     ```bash
     node host-services/tth-controller.js \
       --port /dev/ttyACM0 --script http_host_echo \
       --mode http_echo --flash-policy reuse --ready-timeout 60000
     ```
   - Wait for `__HTS_FIXTURES__…` and `__HTS_READY__` in the console/log.
   - Leave the controller running (harness will do this automatically once fully wired).
3. **Execute DUT harness**
   - Ensure no REPL holds `/dev/ttyUSB0`.
   - Run:  
     ```bash
     node scripts/run-tests-gordonV4.js \
       --board ESP32 --port /dev/ttyUSB0 \
       --suites http-client-host --serial-debug
     ```
   - Watch harness console for PASS/FAIL; artifacts land under `results/<stamp>/ESP32/`.
4. **Investigate failures interactively**
   - Inspect HTS logs: `results/<stamp>/ESP32/logs/suite_http-client-host.hts.stdout`.
   - Inspect DUT logs: `results/<stamp>/ESP32/logs/test_host_http_client.js.stdout`.
   - Reproduce manually via REPL if needed: upload `results/<stamp>/ESP32/sources/test_host_http_client.js` to `/dev/ttyUSB0`.
   - Update `docs/V5_2_Implementation.md` with findings before proceeding.
5. **Tear-down / handover**
   - Stop controller (Ctrl+C) so `/dev/ttyACM0` is free.
   - Detach REPL sessions; leave both boards idle with scripts persisted if reuse mode is desired.
   - Commit or stash code as appropriate; note outstanding TODOs in the implementation doc or this continuity file.

Following this blueprint ensures any new Codex session can exercise the hardware-in-the-loop workflow end-to-end without rediscovering the necessary tooling steps.

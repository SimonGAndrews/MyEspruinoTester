# CLI Tooling Guide

This project provides several command-line utilities for flashing firmware, validating configuration, and running test suites on Espruino devices (or inside Node.js for baselines).

## Common Flags
Most scripts support two common conventions:
- `--help` (`-h`) prints usage information.
- Long flags use kebab-case (`--board`, `--suites`). Short flags are available for frequently used options.

Paths below are relative to the project root.

---

## `scripts/dry-run.js`
**Purpose:** Validate manifests, firmware bundles, and suite availability without touching hardware.

Usage:
```bash
node scripts/dry-run.js --board ESP32C3 --version 2v27.32 --suites javascript-core
```

Options:
- `--board`, `-b` (required unless `--list`): board name matching a manifest in `boards/` (e.g. `ESP32C3`).
- `--version`, `-v`: firmware version directory under `firmware/<board>/` (replaces `%v` in artifacts). If omitted and required by the manifest, a warning is printed.
- `--suites`, `-s`: comma-separated suites to validate (e.g. `javascript-core,wifi-connectivity`). Omitting uses the manifest’s default suites.
- `--list`, `-l`: list available board manifests.
- `--help`, `-h`: show usage.

Output:
- Prints manifest path, suites discovered, and firmware artifacts (marked “ok” or “missing”).
- Reports the flashing adapter (`flash.type`).
- No firmware is flashed and no hardware connection is made.

Common issues:
- `Error: board manifest not found`: check `boards/<name>.json` exists.
- `Missing firmware artifacts`: ensure files under `firmware/<board>/<version>/` match manifest `artifacts` definitions.
- Espruino CLI produces 'noise' when executing that is seen unless the cli is ececuted wit --quiet.   
  - Deprecation warning – During startup the CLI loads WebRTC support (peerjs-on-node) and that dependency pulls in node-blob. Node 20 flags its legacy manifest (main: "server.js") as invalid, so you see the deprecation notice before every run. Nothing in our harness touched it; it comes from EspruinoTools/libs/webrtc-connection.js:88 which attempts the require("peerjs-on-node") and triggers Node’s warning.

  - NODE_TLS_REJECT_UNAUTHORIZED message – The WebSocket relay disables TLS verification so it can talk to self-signed peers. That’s hard‑coded in EspruinoTools/core/serial_websocket_relay.js:18, so whenever the CLI initialises the relay stack you get the warning that the env var was forced to 0.

  - “Module Wifi not found” banner – Before uploading code, the CLI parses the script and tries to cache every require(...). Because our board JSON doesn’t expose a built-in module list, the loader can’t tell that Wifi lives in firmware, so EspruinoTools/core/modules.js:207 logs Module Wifi not found. It’s just the module preloader grumbling; the upload still succeeds once the board provides the module at runtime.

  - TypeError: Cannot read properties of undefined (reading 'type') – After each upload the CLI sets a 500 ms inactivity timer (EspruinoTools/bin/espruino-cli.js:543-604). When it fires, exitCallback is invoked without the object binding created in startConnect, so inside this.iterate (lines EspruinoTools/bin/espruino-cli.js:818-826) this becomes undefined. That turns the next call to getPortPath (line EspruinoTools/bin/espruino-cli.js:773) into getPortPath(undefined, …), which raises the stack trace. Our keep-alive prints keep reset that timer, so the tests finish before the buggy shutdown path runs, but the warning itself is entirely in the CLI.

---

## `scripts/flash.js`
**Purpose:** Flash firmware onto a device using the configured adapter.

Usage:
```bash
node scripts/flash.js --board ESP32C3 --version 2v27.32 --port /dev/ttyACM0 --dry-run
```

Options:
- `--board`, `-b`: board name (required).
- `--version`, `-v`: firmware version directory (required when manifest `pattern` uses `%v`).
- `--port`, `-p`: serial port device (e.g. `/dev/ttyACM0`).
- `--baud`: override flashing baud rate.
- `--esptool`: path to `esptool.py` if not in `$PATH` or to use a custom binary.
- `--dry-run`, `-n`: print the command but do not execute.
- `--suites`, `-s`: optional suite validation before flashing (to ensure they exist).
- `--help`, `-h`: show usage.

Output:
- Prints summary (board, manifest, version, adapter, port, baud, dry-run status).
- Shows the exact esptool command that will run.
- Executes the adapter’s `flash` function unless `--dry-run` is set.

Common issues:
- `spawn esptool.py ENOENT`: install esptool or supply `--esptool` path.
- `Missing firmware artifacts`: run `scripts/dry-run.js` first to verify bundles.

---

## `scripts/run-tests.js`
**Purpose:** Flash is assumed to be done. Execute one or more suites on a connected Espruino device.

Usage:
```bash
node scripts/run-tests.js --board ESP32C3 --port /dev/ttyACM0 --suites javascript-core,wifi-connectivity --fixtures configs/lab.json --quiet
```

Options:
- `--board`, `-b`: board name (required).
- `--port`, `-p`: serial port device (required).
- `--suites`, `-s`: comma-separated suites (defaults to manifest’s `suites.default`).
- `--fixtures`, `-f`: path to a JSON fixtures file injected as `global.ESPRUINO_WIFI_FIXTURES`.
- `--quiet`, `-q`: suppress verbose serial logging during each test upload.
- `--help`, `-h`: show usage.

Behaviour:
- Each test file is wrapped with a timeout prologue/epilogue, uploaded via the Espruino CLI, and the JSON result is parsed.
- Supports synchronous or asynchronous tests (via global `result`/`resultReason`).
- Outputs PASS/FAIL/SKIP per test and a suite summary.
- Writes suite-level JSON results to `results/<timestamp>/<board>/<suite>.json`.

Common issues:
- `Error: unknown suites`: ensure suite names are listed in the board’s manifest `suites.available` and mapped in `lib/tests.js`.
- Tests reporting `no_result`: indicates no JSON result line was parsed (often missing `result` or unhandled async logic).
- `Error loading fixtures`: confirm the file path is correct and the JSON is valid.

---

## `scripts/run-tests-gordon.js`
**Purpose:** Gordon-style runner that shells out to the Espruino CLI once per test file. Mirrors the original `index.js` flow for debugging suites against real hardware.

Usage:
```bash
node scripts/run-tests-gordon.js --board ESP32C3 --port /dev/ttyACM0 --suites wifi-core --fixtures configs/lab.json
```

Options:
- `--board`, `-b`: board manifest name (required).
- `--port`, `-p`: serial device to open (required).
- `--suites`, `-s`: comma-separated suites. Uses manifest defaults when omitted.
- `--fixtures`, `-f`: optional JSON file injected as `global.ESPRUINO_WIFI_FIXTURES` before each test body.
- `--quiet`, `-q`: suppress CLI stderr chatter while retaining captured logs.
- `--help`, `-h`: show usage.

Behaviour:
- Wraps each test source with a lightweight harness that emits keep-alive heartbeats and prints a structured JSON result.
- Writes original sources plus CLI stdout/stderr to `results/<timestamp>/<board>/`.
- Aborts immediately with a helpful message if the serial device is busy (for example, when a REPL is already connected).

Common issues:
- `Error: device busy (is another REPL connected ...)`: close any Web IDE/terminal session that is holding the port and rerun.
- `no_result`: indicates the test never set `result`; fix the test to assign a structured `{ status, pass, reason }` object.
- CLI warnings about BLE/HID modules are benign when `--no-ble` is injected automatically by the runner.

---

## `scripts/run-node-baseline.js`
**Purpose:** Run suites locally under Node.js as a baseline comparison for pure JavaScript tests (no hardware).

Usage:
```bash
node scripts/run-node-baseline.js --suites javascript-upstream
```

Options:
- `--suites`, `-s`: comma-separated suites (required unless defaults defined in manifest).
- `--board`, `-b`: optional board name used only to scope suite defaults.
- `--help`, `-h`: show usage.

Behaviour:
- Loads test files from `tests/<target>/<suite>` and executes them in a sandboxed VM context.
- Recognises global `result`/`resultReason` per the upstream contract.
- Outputs PASS/FAIL per test and suite summary. Does not write to `results/` (baseline comparisons are manual for now).

Common issues:
- `No suites specified`: supply `--suites` or ensure the board manifest defines default suites.
- If tests rely on platform-specific globals (e.g., `E`, `Wifi`), they will fail under Node.

---

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---------|--------------|------------|
| `Error: board manifest not found` | Typo or missing `boards/<name>.json` | Check the board filename/case. |
| `Missing firmware artifacts` | Firmware bundle files missing or misnamed | Verify `firmware/<board>/<version>` contains `bootloader.bin`, `partition-table.bin`, and `espruino_<version>_<board>.bin`. |
| `Flashing failed: spawn esptool.py ENOENT` | esptool not in `$PATH` | Install esptool (`pip install esptool`) or use `--esptool /path/to/esptool.py`. |
| Tests report `FAIL (no_result)` | Test never set global `result`; or CLI output wasn’t parsed | Ensure each test sets `result` (and `resultReason` optional). Check the JSON parsing logic if CLI output is prefixed (e.g., `--]`). |
| `Wifi module not an object` | Suite run on a board or firmware without `Wifi` | Remove suite from manifest or update tests to skip when `require('Wifi')` returns undefined. |
| Test reported as `SKIP` | Fixture or capability intentionally absent | Review the skip reason and enable the required fixtures/features before re-running. |
| `No tests discovered for given suites` | Wrong suite name or empty suite mapping in `lib/tests.js` | Check that `lib/tests.js` maps suite names to actual files. |
| `Error loading fixtures` | Fixtures path missing or JSON invalid | Provide a readable JSON file and pass it via `--fixtures`. |
| Node baseline mismatches device behaviour | Host runtime lacks Espruino-specific APIs | Limit baseline runs to pure JavaScript suites that don’t touch device-only modules. |

---

## Quick Reference
- Validate config: `node scripts/dry-run.js --board ESP32C3 --version 2v27.32 --suites javascript-core`
- Flash firmware (dry run): `node scripts/flash.js --board ESP32C3 --version 2v27.32 --port /dev/ttyACM0 --dry-run`
- Run suites (device): `node scripts/run-tests.js --board ESP32C3 --port /dev/ttyACM0 --suites javascript-core,wifi-connectivity --fixtures configs/lab.json --quiet`
- Run baseline (Node): `node scripts/run-node-baseline.js --suites javascript-upstream`

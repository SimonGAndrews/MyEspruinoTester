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
node scripts/run-tests.js --board ESP32C3 --port /dev/ttyACM0 --suites javascript-core,wifi-connectivity --quiet
```

Options:
- `--board`, `-b`: board name (required).
- `--port`, `-p`: serial port device (required).
- `--suites`, `-s`: comma-separated suites (defaults to manifest’s `suites.default`).
- `--quiet`, `-q`: suppress verbose serial logging during each test upload.
- `--help`, `-h`: show usage.

Behaviour:
- Each test file is wrapped with a timeout prologue/epilogue, uploaded via the Espruino CLI, and the JSON result is parsed.
- Supports synchronous or asynchronous tests (via global `result`/`resultReason`).
- Outputs PASS/FAIL per test and a suite summary.
- Writes suite-level JSON results to `results/<timestamp>/<board>/<suite>.json`.

Common issues:
- `Error: unknown suites`: ensure suite names are listed in the board’s manifest `suites.available` and mapped in `lib/tests.js`.
- Tests reporting `no_result`: indicates no JSON result line was parsed (often missing `result` or unhandled async logic).

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
| `No tests discovered for given suites` | Wrong suite name or empty suite mapping in `lib/tests.js` | Check that `lib/tests.js` maps suite names to actual files. |
| Node baseline mismatches device behaviour | Host runtime lacks Espruino-specific APIs | Limit baseline runs to pure JavaScript suites that don’t touch device-only modules. |

---

## Quick Reference
- Validate config: `node scripts/dry-run.js --board ESP32C3 --version 2v27.32 --suites javascript-core`
- Flash firmware (dry run): `node scripts/flash.js --board ESP32C3 --version 2v27.32 --port /dev/ttyACM0 --dry-run`
- Run suites (device): `node scripts/run-tests.js --board ESP32C3 --port /dev/ttyACM0 --suites javascript-core,wifi-connectivity --quiet`
- Run baseline (Node): `node scripts/run-node-baseline.js --suites javascript-upstream`

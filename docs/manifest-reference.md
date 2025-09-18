# Board Manifest Reference

Board manifests live under `boards/<BOARD>.json` and describe everything the harness needs to flash firmware and decide which test suites to run. This document outlines the fields, typical usage, and common issues.

## Manifest Anatomy

```json
{
  "board": "ESP32C3",
  "description": "ESP32-C3 USB/serial harness manifest for Espruino testing",
  "upstream": {
    "id": "ESP32C3",
    "binary": "espruino_%v_esp32c3.bin"
  },
  "firmware": {
    "pattern": "espruino_%v_esp32c3.bin",
    "artifacts": [
      { "name": "bootloader", "filename": "bootloader.bin", "offset": "0x0" },
      { "name": "partitions", "filename": "partition-table.bin", "offset": "0x8000" },
      { "name": "application", "filename": "%pattern%", "offset": "0x10000" }
    ]
  },
  "flash": {
    "type": "esp32-esptool",
    "chip": "esp32c3",
    "baud": 460800,
    "mode": "dio",
    "freq": "80m",
    "extraArgs": ["--before", "usb_reset", "--after", "hard_reset"]
  },
  "ports": {
    "serial": ["/dev/ttyACM*", "/dev/ttyUSB*"],
    "baud": 115200
  },
  "fixtures": {
    "wifi": "default",
    "peripherals": []
  },
  "suites": {
    "default": ["javascript-core", "wifi-connectivity"],
    "available": ["javascript-core", "wifi-connectivity", "javascript-upstream"]
  }
}
```

### Core Fields
- `board`: identifier used by the runner; typically matches the upstream ID.
- `description`: human-readable summary.
- `upstream`: metadata linking to Espruino’s upstream board definition (used for firmware naming and context).
  - `id`: upstream board ID.
  - `binary`: pattern for firmware artifacts (`%v` replaced by version).

### Firmware Section
- `firmware.pattern`: default application binary pattern; `%v` is replaced by the version at runtime.
- `artifacts`: list of binaries required for flashing, each with `name`, `filename`, and `offset`.
  - `filename` can reference `%pattern%` (the resolved application filename) or `%v`.
  - Ensure offsets match the target’s flashing map (see upstream `make/targets/` for reference).

### Flash Section
- `type`: selects the adapter module under `flashers/` (e.g., `esp32-esptool`).
- `chip`, `baud`, `mode`, `freq`: adapter-specific hints. If unset, adapters fall back to defaults.
- `extraArgs`: advanced esptool arguments (e.g., `default_reset` vs `usb_reset`).

### Ports & Fixtures
- `ports.serial`: wildcard patterns to help the runner suggest or auto-discover devices.
  - The runner still expects `--port` when running tests/flashing; patterns act as hints.
- `ports.baud`: default console speed (helps warm-up scripts).
- `fixtures`: optional dictionary for future automation (e.g., Wi-Fi credentials, sensor setups).

### Suites
- `suites.available`: list of suites safe to run on this board (e.g., `javascript-core`, `wifi-connectivity`, `javascript-upstream`).
- `suites.default`: suites the runner executes when `--suites` is omitted.

## Purpose / Flow
1. **Dry-run** (`scripts/dry-run.js`) reads the manifest to validate firmware artifacts, adapter selection, and suite availability.
2. **Flash** (`scripts/flash.js`) pulls the flashing info (`flash`, `firmware`) and executes the appropriate adapter.
3. **Run Tests** (`scripts/run-tests.js`) uses manifest data to determine default suites and board info (passed to the espruino CLI).
4. **Node Baseline** (`scripts/run-node-baseline.js`) can use manifest defaults if `--suites` isn’t provided.

## Quick Reference
- Add a new suite? Update `lib/tests.js` to map the suite to test files, then append the suite name to `suites.available` in the manifest.
- Switching reset modes (ESP32 family)? Adjust `flash.extraArgs` (`default_reset` for UART, `usb_reset` for Serial-JTAG).
- Custom firmware versions? Drop binaries under `firmware/<board>/<version>/` matching the patterns listed here.

## Troubleshooting

| Error / Symptom | Likely Manifest Cause | Fix |
|-----------------|-----------------------|-----|
| `Error: unknown suites: foo` when running tests | `suites.available` missing `foo` or scope mismatch (case sensitive) | Add `"foo"` to `suites.available` or correct the suite name in CLI. |
| `Missing firmware artifacts` during dry-run/flash | `firmware.artifacts` filenames don’t match actual files under `firmware/<board>/<version>` | Confirm filenames/offsets; ensure `%v`/`%pattern%` resolve correctly. |
| `flash()` throws (unsupported type) | `flash.type` doesn’t match a registered adapter in `flashers/` | Either register a new adapter or adjust the type to an existing one. |
| Tests fail with `Wifi module not an object` | Wi-Fi suite enabled on a board/firmware that doesn’t provide `Wifi` | Remove the suite from `suites.available` or adjust tests to skip when modules are missing. |
| Runner spawns espruino CLI without `--board` | Ensure manifest’s `board`/`upstream.id` is correct (used to pass `--board` to CLI) | Fix board IDs (e.g., `ESP32C3`). |
| “No tests discovered...” for a suite | `tests/<target>/<suite>` missing files or manifest targets incorrect (target mismatches) | Add tests to the expected directory or adjust suite mapping in `lib/tests.js`. |

For extensive changes (e.g., new MCU family), consider creating a base manifest (shared fields) and merging board-specific overrides to avoid duplication.

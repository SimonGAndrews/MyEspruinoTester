# Espruino Tester Baseline Requirements

## Requirements Overview
- Treat firmware compilation as out-of-scope: the harness consumes prebuilt Espruino binaries supplied per target/version and does not invoke the upstream build system.
- Define harness scope around Espruino-driven testing with modular flashing adapters and a focus on ESP32, ESP32C3, ESP32S3 first, while supporting Node.js as a comparative “virtual MCU” target.
- Reuse upstream Espruino board definitions to seed local board manifests that include tester-specific extensions (flash strategy, host GPIO mappings, fixture hints).

## Board & Flashing
## Firmware Assets
- Store firmware bundles per target/version under a predictable directory (e.g., `firmware/<board>/<version>/`).
- Each bundle should include application, bootloader, and partition binaries matching the upstream `make/targets` outputs (see `ESP32_IDF4.make`).
- Harness parameters select the firmware version at runtime; validation checks ensure required artifacts exist before flashing.
- Provide metadata files (JSON/YAML) alongside bundles to map semantic version/build commit to file paths for reproducibility.

- Create per-board manifests referencing `flash.type` (`esp32-esptool`, `openocd-nrf52`, `dfu-stm32`, etc.), firmware pattern, port discovery hints, and supported test sets.
- Implement adapter interface in `flashers/` exposing `canHandle(board)` and `flash(board, firmware, opts)`, starting with an ESP32 adapter wrapping `esptool.py` and honoring board-provided GPIO toggles.
- Provide import tooling to sync with `Espruino/boards/*.json`, preserving relevant metadata (default console, boot pins) and layering tester fields.

## Test Taxonomy & Execution
- Organize `tests/` hierarchy as `tests/<target>/<suite>/<testId>.js`, where `target` might be `esp32`, `esp32c3`, `esp32s3`, `node`, etc.; suites include `javascript-core`, `wifi-connectivity`, and future categories.
- Allow board manifests to specify which suites apply, plus fixture requirements and optional environment overrides (Wi-Fi SSID, peripheral mocks).
- Each test follows the upstream Espruino contract: set a global `result` (truthy pass/falsy fail) and optional `resultReason`/`resultData`. Tests may be synchronous or asynchronous.
- Support running subsets with `scripts/run-tests.js --board <name> --port <tty> --suites suiteA,suiteB`.
- Treat Node.js as a target by running compatible suites directly under Node using `scripts/run-node-baseline.js` and comparing against device runs.

## Common Test Utilities
- Tests set global `result`/`resultReason` directly; no shared helper is required for PASS/FAIL output.
- The runner injects a prologue/epilogue around each test to enforce timeouts, capture execution duration, and print a single JSON result line (works for sync and async cases).

## Session Orchestration
- Use EspruinoTools for discovery/warm-up and spawn the `espruino` CLI per test to upload wrapped code and stream results.
- Sequence operations: `flash → warm-up → for each test: spawn CLI → parse JSON result → aggregate`, with timeouts configurable per suite.
- Scheduler support for multiple boards is planned for a future iteration.

## Result Capture & Comparison
- Persist run artifacts per suite: `results/<timestamp>/<board>/<suite>.json` with pass/fail status, duration, reason, and test identifiers.
- CLI output includes a per-suite summary plus overall pass/fail counts.
- Diffing/comparison across targets (e.g., Node vs device) is planned for a future iteration.

## Tooling & UX
- Provide a flashing helper (`scripts/flash.js --board <name> --version <v> --port <tty>`) that wraps the appropriate adapter (supports `--dry-run` and esptool overrides).
- `scripts/dry-run.js --board <name> --version <v> --suites suiteA` validates manifest, firmware, and suite configuration without touching hardware.
- `scripts/run-tests.js --board <name> --port <tty> --suites suiteA,suiteB [--quiet]` executes tests, prints suite summaries, and writes JSON results.
- Plan for future dashboard integration by keeping result schema consistent, but defer UI work until core harness stabilizes.

# Architecture Overview

## High-Level Flow
1. Load device manifest and resolve firmware, flashing adapter, GPIO bindings, and suite selection.
2. Prepare target environment: toggle host GPIO, invoke flashing adapter, verify device availability via EspruinoTools discovery.
3. Establish session through EspruinoTools, upload shared helpers, execute selected test sets, and stream structured logs.
4. Persist run artifacts (per-test JSON, raw logs, firmware metadata) and optionally compare against prior baselines or Node.js runs.

## Components

### Configuration Layer
- **Board Manifests** (`boards/*.json`): Extend upstream definitions with tester fields (`flash`, `gpio`, `suites`, `fixtures`). Allow overrides via `configs/*.json` for lab-specific pin mappings or credentials.
- **Suite Registry** (`tests/suites.json`): Map suite identifiers to folder paths, fixture dependencies, and target compatibility (e.g., `node` vs `esp32`).
- **CLI Options**: Device selection, suites, firmware version/tag, dry-run, log level, result output path.

### Flashing Adapters
- **Adapter Interface**: `flash(boardManifest, firmwarePath, context)` returning a promise; context exposes GPIO helper, logger, timeout handling.
- **ESP32 Adapter**: Utilize `esptool.py`, board-provided chip type, and host GPIO toggles for `EN`/`BOOT` pins; support configurable baud rate and `--before/--after` resets.
- **Legacy Adapters**: Port existing OpenOCD (nRF52) and DFU (STM32) logic into modules conforming to the interface; default to EspruinoTools flashing when available.

### Test Runner
- **Session Manager**: Wrap EspruinoTools core APIs to reset devices, push modules, stream console logs, and detect `[TEST]` markers. Handle reconnection on serial dropouts.
- **Test Loader**: Given board and suites, assemble ordered list of tests (`tests/<target>/<suite>/<testId>.*`), prepend `common.js`, and attach metadata (suite, required fixtures).
- **Execution Engine**: Upload test scripts sequentially, enforce per-test timeout, capture stdout/stderr, parse `testId` and pass/fail tokens, and record measurement payloads emitted by tests.
- **Node Target Runner**: Execute compatible suite scripts directly under Node with the same assertion harness, mimicking the Espruino session API for consistency.

### Results & Reporting
- **Result Writer**: Persist JSON records per test containing `testId`, target, firmware version, suite, pass/fail, metrics, timestamps, and relevant logs.
- **Comparison Tools**: Provide CLI commands to compare latest run vs. previous or Node baseline by `testId`, flagging regressions or mismatched metrics.
- **Artifact Storage**: Keep raw serial logs, flashing logs, and EspruinoTools traces in structured directories for troubleshooting.

### Extensibility & Maintenance
- Modular folder layout (`flashers/`, `runner/`, `cli/`, `tests/`) to encourage contributions.
- Clear interfaces and TypeScript typedefs/JSDoc for manifests, adapters, and result schemas to reduce onboarding friction.
- Automated lint/test scripts to validate new adapters and ensure test manifests reference valid suites and fixtures.

## Sequence Diagram (Textual)
- **CLI** → `config loader`: Resolve board + suites.
- `config loader` → `flasher`: Provide firmware, GPIO, options; await completion.
- `flasher` → `GPIO helper`: Toggle pins as required.
- `flasher` → `esptool.py/OpenOCD/...`: Flash firmware; return status.
- `session manager` → `EspruinoTools`: Connect, upload `common.js`, run tests.
- `test runner` → tests: Stream results, emit structured events.
- `result writer` → filesystem: Persist JSON/logs.
- Optional: `comparator` ↔ previous results to highlight regressions.

## Future Hooks
- Metrics aggregation service or lightweight dashboard consuming stored JSON.
- Parallel execution framework once flashing stability is proven.
- Support for additional MCU families by adding manifests and adapters compliant with the same interfaces.

# Deployment & Environment Setup

## Host Requirements
- Ubuntu 22.04 LTS (or similar Debian-based distro) with sudo access and available USB/GPIO interfaces.
- Node.js v18+ and npm (install via distro packages or NodeSource). Use `nvm` if multiple versions are needed.
- Python 3.8+ with `pip` for installing `esptool`; ensure `python3 -m pip` is available.
- Serial access permissions for the user (`dialout` group) to communicate with USB/serial Espruino boards.

## Core Tooling Installation
1. Install base packages:
   ```bash
   sudo apt update
   sudo apt install git build-essential python3 python3-pip openocd dfu-util libudev-dev
   ```
2. Install Node.js and npm (if not already present) and verify:
   ```bash
   node --version
   npm --version
   ```
3. Clone EspruinoTools and install globally (or link locally for development):
   ```bash
   git clone https://github.com/espruino/EspruinoTools.git
   cd EspruinoTools
   npm install
   sudo npm link
   ```
   This exposes the `espruino` CLI used by the harness. Optionally `npm link` the module into this repository for direct require().
4. Install `esptool` for ESP32-family flashing:
   ```bash
   python3 -m pip install --user esptool
   ```
5. (Optional) Configure udev rules for Espruino devices to avoid sudo. Refer to Espruino docs or create rules under `/etc/udev/rules.d/` matching USB VID/PIDs.

## Repository Setup
- Clone `MyEspruinoTester01` and run `npm install` to pull local dependencies (`espruino`, `onoff`, etc.).
- Create lab-specific configuration files (e.g., `configs/<hostname>.json`) to map GPIO pins or fixture credentials as referenced in the board manifests.
- Populate `boards/` with ESP32/ESP32C3/ESP32S3 manifests pointing to firmware binaries and flashing adapters.
- Populate `firmware/<board>/<version>/` with prebuilt Espruino bundles (application, bootloader, partition binaries) exported from upstream make targets; reference them via harness parameters.

## Hardware Preparation
- Connect each target MCU via USB for serial flashing; expose required boot/enable pins to the host GPIO (Raspberry Pi header or USB GPIO adapter).
- Verify continuity of GPIO mappings against board manifests; document harness wiring for repeatability.
- For Node.js baseline runs, no hardware is required; ensure test suites flag compatibility to skip hardware-specific cases.

## Validation Checklist
- `espruino --list` shows connected boards after flashing tools are installed.
- `esptool.py chip_id` succeeds for ESP32 family devices using the configured GPIO toggles.
- `node scripts/dry-run.js --board ESP32 --version <firmwareVersion> --suites javascript-core` reports planned actions without executing flashing.
- `node scripts/flash.js --board ESP32C3 --version <firmwareVersion> --port /dev/ttyACM0 --dry-run` validates the esptool command without touching hardware.
- `node scripts/run-tests.js --board ESP32C3 --port /dev/ttyACM0 --suites javascript-core,wifi-connectivity --quiet` runs suites end-to-end and writes results to `results/<timestamp>/<board>/`.
- `node scripts/run-node-baseline.js --suites javascript-core` (optional) executes the same suite under Node.js for baseline comparison.
- Serial permissions allow running without sudo (unless flashing adapter requires elevated privileges).

Document lab-specific deviations (alternate OS, GPIO adapters) in separate Markdown files under `docs/deployments/` to keep the baseline instructions concise.

# Contributing

## Adapter Interface
- Implement adapters in `flashers/<name>.js` and export `{ type: '<adapter-id>', flash(opts) }`.
- `flash(opts)` parameters:
  - `boardName`, `manifest`, `firmwareInfo`, `version`
  - `port`, `baud`, `esptoolPath` (or tool path), `dryRun` (boolean), `logger` (Console-like)
- Behavior:
  - Validate artifacts (existence and offsets) using `firmwareInfo`.
  - Support `dryRun` by printing the command and skipping execution.
  - Optional GPIO sequencing via `manifest.gpio.signals` (no-op if unavailable).
- Register new adapters in `flashers/index.js` under a unique `type` key.

## Manifest Expectations
- Required: `board`, `firmware.pattern`, `firmware.artifacts[{ name, filename, offset }]`, `flash.type`.
- Recommended: `flash.{chip, baud, mode, freq, extraArgs, size}`, `ports.serial[]`, `suites.available/default`, (avoid host GPIO; not required).
- Firmware layout: `firmware/<board>/<version>/` with `bootloader.bin`, `partition-table.bin`, and app image from `pattern`.

## Test Structure
- Tests live in `tests/<target>/<suite>/<testId>.js`.
- Each test sets global `result` (boolean) and optional `resultReason`/`resultData`; no explicit PASS/FAIL prints are required.
- Declare suite compatibility (e.g., `node`, `esp32`) via suite registration (planned).

## Coding Guidelines
- Node.js LTS (v18+); CommonJS modules; JSDoc on exported functions.
- No side effects; clear, actionable errors; small, focused modules.

## Validation Steps
- Manifests/firmware: `node scripts/dry-run.js --board <name> --version <v>`.
- Flash command preview: `node scripts/flash.js --board <name> --version <v> --port <tty> --dry-run`.
- For new boards, add at least one firmware bundle to verify artifact resolution.

## GPIO Control Notes
- Linux sysfs GPIO is deprecated. The harness does not require host GPIO for ESP32-family flashing; esptool.py uses DTR/RTS on the serial adapter to enter/exit bootloader on most dev boards.
- Host GPIO is optional and best-effort. If unavailable, flashing proceeds without it. Future backends may support libgpiod (`gpioset`) or pigpio where needed.
- Manifests SHOULD omit (avoid host GPIO; not required) unless your rig requires manual EN/BOOT control. If provided and unsupported on the host, the harness logs a warning and continues.

## Flashing Modes
- UART with DTR/RTS (most dev boards): set manifest `flash.extraArgs` to `["--before","default_reset","--after","hard_reset"]` (default).
- USB Serial-JTAG (native USB on C3/S3): set manifest `flash.extraArgs` to `["--before","usb_reset","--after","hard_reset"]`.

Usage examples:
- DTR/RTS (UART bridge):
  - `node scripts/flash.js --board ESP32 --version <v> --port /dev/ttyUSB0 --dry-run`
  - `esptool.py --chip esp32 --port /dev/ttyUSB0 --before default_reset --after hard_reset chip_id`
- USB Serial-JTAG (C3/S3):
  - `node scripts/flash.js --board ESP32C3 --version <v> --port /dev/ttyACM0 --dry-run`
  - `esptool.py --chip esp32c3 --port /dev/ttyACM0 --before usb_reset --after hard_reset chip_id`

Notes:
- No host GPIO is required. The harness relies on esptool’s reset modes.
- If your custom board lacks the auto-programming network (EN/BOOT wiring), use manual button procedure or create a board-specific flashing note; host GPIO is not supported by this harness.

## Running Tests on Hardware
- Discover tests: currently `javascript-core` maps to `tests/generic/test_abstract_comparison.js` (prints PASS/FAIL).
- Execute on device:
  - `node scripts/run-tests.js --board ESP32C3 --port /dev/ttyACM0 --suites javascript-core`
- Exit codes: non-zero if any test fails; output lists each test result.
- Requires EspruinoTools available as a module (`npm install` or `npm link espruino`).

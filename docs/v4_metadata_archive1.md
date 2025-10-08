# v4 metadata specification notes

## Revised test harness structure

```
MyEspruinoTester01/
├─ boards/
│  ├─ <board>/
│  │  ├─ manifest.json
│  │  ├─ cliBoardFiles/
│  │  ├─ firmware/<version>/...
│  │  ├─ config/<*.json>
│  │  └─ fixtures/<*.json>
├─ configs/
├─ docs/
├─ lib/
├─ results/
├─ scripts/
├─ tests/
│  ├─ <target>/
│  │  ├─ <suite>/
│  │  │  ├─ manifest.js
│  │  │  ├─ test_*.js
│  │  │  ├─ testConfig.json
│  │  │  └─ assets/
│  │  └─ manifest.json (optional execution manifest)
├─ EspruinoTools/
└─ ... (original Gordon-era support folders)
```

- **boards/** – homes every board-specific artefact. Each `<board>/` folder contains the manifest consumed by the harness, the CLI board definition (`cliBoardFiles/`), firmware bundles organised by version, optional `config/` overrides applied before suites run, and canonical board-level fixtures describing wiring or transport details.
- **configs/** – shared run-session defaults (e.g., harness-wide fixture templates, environment selections) that seed the resolver before board or suite specialisation.
- **docs/** – living documentation, including this specification and operational run books.
- **lib/** – reusable modules (manifest loader, config resolver, discovery helpers) underpinning the harness scripts.
- **results/** – timestamped run outputs (`results/<stamp>/<board>/…`) containing wrapped sources, logs, per-test JSON artefacts, and resolved configuration snapshots.
- **scripts/** – entry points for runners, flash helpers, dry-run checks, and utility CLIs.
- **tests/** – organised first by target (`esp32`, `esp32c3`, `node`, etc.) then by suite. Each suite ships its tests, a `testConfig.json` with suite-level defaults, optional `assets/` used by metadata (storage preload files, fixtures, etc.), and may add a `manifest.json` to lock discovery ordering when sequencing matters.
- **EspruinoTools/** plus other historical folders (flashers, firmware, openocd, etc.) remain untouched, providing Gordon-era tooling and third-party dependencies.

## The test platform contains three types of config metadata 

`Fixture data` (config.fixture), data to be injected into tests, providing constants for the physical  connection and environment  of the target for the test.  E.g.  WiFi credentials, I2c addresses, Gpio mappings etc. 

`Espruino cli data` (config.cli) , variables to be passed to the espruino CLI which direct:

- the transfer to the target (eg set port and baud rate) 
- storage of the test payload on the target. (eg SAVE_ON_SEND to RAM,Flash,Storage)
- additional target controls (eg RESET_BEFORE_SEND)
- console output (quiet, verbose, color)

`Test loader data` (config.loader) , variables which direct the operation of the test loading and execution. Principally, the creation of the test payload,  building the Espruino CLI command (with the config.cli variables) and the timing and execution of the cli.  Test loader data includes the test suite name, execution delays etc.  

## Layers in the test platform

The test platform is structured as a set of layers. Each layer contributes metadata and context that narrows from global run intent down to a single CLI invocation, and the values established in an upper layer are available to the layers beneath it.

### Test execution (run session)

Represents one invocation of the harness. It captures the operator intent (requested suites, chosen overrides, future fixture-environment selection), loads shared configuration such as `configDefaults.json`, (EspruinoTools/configDefaults.json) and produces the base `config` object. This layer also establishes run identifiers (timestamp, output directories) used for logging and reporting.

_Note in espruino tools configDefaults.json is effectively a reference artefact the CLI points to in help text and documentation, rather than an actively merged baseline. In our harness, we can actually load and merge it as the start of the cli config (e.g., during the “run session” layer) before applying board/suite/test overrides._

### Board profile

Pulls metadata from the selected board manifest (e.g., default suites, preferred ports, storage targets, min baud). These values specialise the run session for a specific hardware family and may set defaults for `config.cli` (port pattern, `SAVE_ON_SEND`) or `config.loader` (allowable suites).

### Test suite

Represents the collection of test scripts being executed together. Suite-level metadata (e.g., `suite_config.json`) can augment fixture data, adjust CLI arguments required by every script, or apply loader hints such as pre/post delays. The suite layer clones the run-level config and narrows it for the contained scripts.

#### Suite configuration artefact

Each suite may provide a JSON file alongside its tests at `tests/<suite>/testConfig.json`. The file describes defaults applied to every test in the suite and follows this structure:

```json
{
  "suite": "wifi-station",
  "metadataVersion": 1,
  "config": {
    "loader": {
      "preUploadDelayMs": 1500,
      "postUploadDelayMs": 1000
    },
    "cli": {
      "RESET_BEFORE_SEND": false
    },
    "fixture": {
      "wifi": {
        "required": ["wifi", "wifiInvalid"]
      }
    }
  },
  "notes": "Applied to every test in this suite."
}
```

The `config` object mirrors the top-level `config` shape used elsewhere (`loader`, `cli`, `fixture`). During merging we treat these keys exactly like other layers; we do **not** prefix them with the source. To retain provenance, the resolver records which layer supplied each key when it serialises the resolved configuration for debugging/reporting.

#### Suite execution manifest

Suite authors can define a stable execution order by adding `tests/<suite>/manifest.json`. The manifest lists an ordered array of test script paths (relative to the suite directory) that the resolver honours during discovery. Manifest files must be valid JSON—no trailing commas or comments—so the loader can parse them reliably. Paths may traverse into shared folders using `../` when a suite borrows common tests. When a manifest is present it must enumerate every `test_*.js` inside the suite directory; missing entries are treated as configuration errors so test coverage cannot silently shrink.

```json
{
  "version": 1,
  "order": [
    "test_setup.js",
    "../shared/test_library_require.js",
    "test_consumes_library.js"
  ]
}
```

When the manifest references a file that cannot be resolved within the repository—or points at a script that no longer exists—discovery aborts with a configuration error. This ensures suites never run with partial ordering or missing dependencies.

### Test script

The individual `test_*.js` file contributes per-test metadata via its JSON header. It can override fixture keys, adjust timeouts, request storage preloads, or mark itself as skip/experimental. The merged output becomes the plan for the upcoming upload.

### CLI invocation

Each script turns into at least one Espruino CLI command. This layer materialises the merged metadata into concrete actions: wrap source, stage storage payloads, calculate delays, build the CLI argument list, and track stdout/stderr. Results from the CLI feed back into the reporting layer.

#### CLI flag mapping and precedence

The flags described here belong to the **test harness command line**, not the downstream EspruinoTools CLI. Harness-level switches apply last and therefore override any conflicting values from prior layers. The table below maps each supported harness flag to the configuration branch it affects; when a flag is supplied multiple times, the right-most value wins.

| Flag | Destination | Notes |
| --- | --- | --- |
| `--board <id>` | `config.loader.board` | Also determines which board manifest is loaded. A conflicting board inside metadata aborts the run. |
| `--port <tty>` | `config.loader.port`, `config.cli.ports[0]` | Replaces any port hints. Multiple `--port` flags append to the ports array in order supplied. |
| `--pre-cli-delay <ms>` | `config.loader.preUploadDelayMs` | Parsed as an integer; overrides suite/test metadata delays. |
| `--post-cli-delay <ms>` | `config.loader.postUploadDelayMs` | Parsed as an integer; overrides suite/test metadata delays. |
| `--no-reset` | `config.loader.noReset = true`, `config.cli.RESET_BEFORE_SEND = false` | Silently overrides suite/test requests for resets; provenance records the override. |
| `--fixtures <path>` | `config.fixtureSource`, merged into `config.fixture` | The supplied JSON is injected at the run layer; lower layers can still override individual keys. |
| `--suites a,b` | `config.loader.requestedSuites` | Overrides manifest defaults. Unknown suite names cause the run to abort before execution. |
| `--only <pattern>` (planned) | `config.loader.testFilter.pattern` | Applied after discovery to restrict execution to matching test IDs. |
| `--quiet` / `--verbose` | `config.loader.quiet`, `config.loader.verbose` | Influence logging; downstream code honours these booleans. |

Collision handling follows these rules:

- Scalar fields (`preUploadDelayMs`, `postUploadDelayMs`, `noReset`, `RESET_BEFORE_SEND`) are replaced outright by the CLI value.
- Array fields (for example, `ports`, `cliArgs`) are rebuilt from the supplied flags; when no CLI override is present the metadata-provided array remains untouched.
- If the CLI value makes earlier metadata impossible (for example, a suite demands a reset but `--no-reset` is present) the resolver records the conflict in the provenance log and emits a warning in the resolved configuration snapshot; execution proceeds with the CLI directive unless the conflict is fatal.

The layers flow into the collection and reporting pipeline: after each CLI invocation completes, the harness persists logs, the merged metadata snapshot, and the pass/fail decision so the run session can produce suite and run summaries.

### Merge and precedence rules

Each layer applies its metadata to the in-flight `config` object using last-writer-wins as the default: keys that do not yet exist are added, and scalar values or objects are replaced when a later layer supplies a new value. Arrays, however, have explicit rules so we do not accidentally discard required data. The harness recognises the exceptions in the table below and applies merge logic accordingly.

| Key | Default Behaviour | Merge Rule |
| --- | --- | --- |
| `config.loader.preUploadDelayMs`, `config.loader.postUploadDelayMs`, `config.loader.timeoutMs`, `config.loader.noReset`, `config.loader.reset` | Replace | Later value replaces earlier ones. |
| `config.cli.SAVE_ON_SEND`, `config.cli.RESET_BEFORE_SEND`, `config.cli.BAUD_RATE`, other scalar `config.cli.*` | Replace | The most recent layer wins. |
| `config.cli.ports` | Replace array unless new layer appends | Layers may supply an array; CLI `--port` flags append in the order supplied. |
| `config.cli.cliArgs` | Append | Treats entries as a queue; later layers append, CLI flags may replace explicitly via `--config`. |
| `config.cli.espruinoConfig` | Append | Metadata contributes `{key,value}` pairs; duplicates are deduplicated by key with the most recent value kept. |
| `config.loader.storagePreload` | Append | Storage descriptors accumulate; an empty array explicitly clears prior entries. |
| `config.fixture.*` | Replace per key | Entire fixture sub-objects (e.g., `wifi`) are replaced; finer-grained merges may be added later. |
| `config.loader.chain`, `config.loader.order`, `config.loader.requirements` | Replace | Per-test metadata is authoritative; higher layers typically do not set these. |

This yields an explicit precedence order: run session defaults → board profile → suite overrides → test metadata → command-line flags. After each layer is applied, the harness validates the resulting config so conflicting or unsupported combinations (for example, requesting `saveOnSend=storage` when the board forbids Storage writes) surface immediately.

## Validation expectations

The resolver emits diagnostics while layers merge. Each entry captures a `level` (`warning` or `error`), the originating `source` (run, board, suite, test, CLI), the affected `path` (for example `config.cli.SAVE_ON_SEND`), and a human-readable `message`. Harness scripts halt before execution if any error-level diagnostics exist; warnings are surfaced in the run summary and persisted alongside the resolved configuration snapshot.

### Fixture checks
- Confirm every fixture block declared as required by suite or test metadata exists; missing blocks are errors, missing optional leaf fields generate warnings.
- Flag obvious placeholders (empty strings, `"<changeme>"`, etc.) when the suite marks a value mandatory.

### CLI configuration checks (`config.cli`)
- Validate `SAVE_ON_SEND` is within `{-1,0,1,2,3}`; raise an error when non-zero values conflict with board capabilities (for example, board forbids Storage writes).
- Keep `RESET_BEFORE_SEND` aligned with `config.loader.noReset`; when both are true the resolver logs a warning and enforces `noReset`.
- Deduplicate `cliArgs` and `espruinoConfig` entries by key, noting when later layers replace earlier values; malformed `key=value` pairs raise errors.
- Check port overrides against manifest hints; emit warnings for ports outside allowed patterns.
- Ensure baud rate overrides are numeric and fall within any manifest-defined range.

### Loader checks (`config.loader`)
- Verify `timeoutMs`, `preUploadDelayMs`, and `postUploadDelayMs` are non-negative integers and honour manifest bounds.
- Validate chain metadata: each named chain must have contiguous `order` indices; missing steps or duplicates are errors. Chains without explicit order trigger warnings.
- Resolve reset conflicts: if metadata demands a hard reset but the final config disables resets, log a warning; when the manifest marks the reset mandatory, escalate to an error.
- Confirm storage preload descriptors reference existing files; missing assets are fatal unless explicitly marked optional.

### Run-session checks
- Abort when requested suites are unknown or resolve to zero tests while marked required.
- Ensure the selected board manifest matches the harness `--board` flag.
- Record fixture provenance so the final config snapshot shows which layer supplied each value when replacements occur.

### Execution-time checks
- Before spawning the Espruino CLI, validate that every `config.cli` key corresponds to a supported `--config` option; unknown keys cause an error to avoid silent no-ops.
- At run time, confirm fixture requirements declared in test metadata are satisfied; missing prerequisites produce a `SKIP` result with a recorded reason.
- Validate JSON payloads emitted by the device; malformed or missing payloads are classified as `invalid_result_json` to highlight parsing errors.
- Verify referenced asset files (e.g., `storagePreload` entries or other suite assets) exist under the expected suite `assets/` directory, carry readable permissions, and comply with any manifest-defined size limits before staging them for upload.
- Ensure required external tools are available: check that `espruino` (and any manifest-provided overrides) is executable prior to invoking tests; similarly, flashing helpers (`esptool.py`, OpenOCD) are validated during setup so runs fail fast when dependencies are missing.

### Reporting
- Persist diagnostics next to the resolved configuration (`results/<stamp>/<board>/runner-metadata/<testId>.json`).
- Emit a consolidated diagnostics summary before executing suites, aborting the run whenever any entry carries `level: error`.

### Discovery and artefact validation
- After globbing suites and tests, enforce naming conventions (`test_*.js`), flag duplicate test identifiers across targets, and warn when suites contain no runnable tests or are referenced by manifests but absent on disk.
- Confirm per-test artefact output (wrapped sources, logs, per-test JSON) is successfully written; if the harness cannot persist artefacts (permission issues, disk full), surface immediate errors rather than deferring to later analysis.

## Run artefacts and persistence

Every harness run writes a structured set of artefacts under `results/<timestamp>/<board>/` so future tooling can analyse outcomes without rerunning suites.

```
results/<timestamp>/<board>/
├─ sources/<testId>
├─ logs/
│  ├─ <testId>.stdout
│  ├─ <testId>.stderr
│  ├─ <testId>.storage.stdout (optional)
│  └─ <testId>.storage.stderr (optional)
├─ runner-metadata/
│  └─ <testId>.json
├─ <suite>.json
└─ run-summary.json (planned)
```

- **sources/<testId>** – the wrapped JavaScript sent to the device, including injected fixtures and harness prologue. This enables repro/debugging and diffing of generated payloads.
- **logs/<testId>.(stdout|stderr)** – raw CLI output for each upload, capturing keep-alive heartbeats, diagnostic warnings, and Espruino responses. When storage preload occurs, separate suffixed files record the preload phase.
- **runner-metadata/<testId>.json** – resolved configuration and provenance snapshot for the test. Fields include the merged `config` object, the diagnostics array, CLI commands issued, artefact paths, timestamps, and any errors caught while executing the stage chain.
- **<suite>.json** – per-suite roll-up summarising test outcomes (`pass`, `fail`, `skip` counts, reasons), carrying the board/port metadata, manifest reference, and run timestamp for traceability.
- **run-summary.json** (planned) – a top-level index spanning all suites executed in the session, duplicating headline counts and collating warnings/errors encountered across tests.

All JSON artefacts use stable schemas so downstream tooling (dashboards, report generators) can ingest them without knowledge of the harness internals. The resolver records file paths in per-test metadata to improve discoverability.

## End-to-end configuration example

The following walkthrough demonstrates how configuration layers merge for a single ESP32C3 Wi-Fi station test.

### Scenario
- Operator runs `node scripts/run-tests-gordon.js --board ESP32C3 --port /dev/ttyACM0 --suites wifi-station --pre-cli-delay 2000 --no-reset`.
- Run-session default loader delay: `preUploadDelayMs = 1000`, `postUploadDelayMs = 1000`, `timeoutMs = 10000`.
- `boards/ESP32C3/manifest.json` sets `SAVE_ON_SEND = 0`, `ports.baud = 115200`, enables suites `wifi-station` and `wifi-core`.
- `tests/esp32c3/wifi-station/testConfig.json` specifies `preUploadDelayMs = 1500`, `timeoutMs = 20000`, and requires fixture blocks `wifi` and `wifiInvalid`.
- The test file `tests/esp32c3/wifi-station/test_connect_get_ip.js` declares metadata:
  ```
  /* JSON {
    "timeoutMs": 25000,
    "preUploadDelayMs": 0,
    "storagePreload": [{ "filename": "wifi.log", "contents": "start" }],
    "requirements": ["WIFI-CONNECT-001"],
    "chain": "wifi_connect_sequence",
    "order": 1
  } */
  ```

### Merge timeline

| Layer | Key contributions | Diagnostics |
| --- | --- | --- |
| Run session | `config.loader.preUploadDelayMs = 1000`, `postUploadDelayMs = 1000`, `timeoutMs = 10000`; loads fixture file `configs/fixtures.wifi_station.json`. | none |
| Board profile | Overrides `config.cli.SAVE_ON_SEND = 0`, `config.cli.BAUD_RATE = 115200`; selects default suites (`wifi-station`, `wifi-core`). | Warn if requested suite not in manifest (not triggered). |
| CLI invocation (suites flag) | `--suites wifi-station` restricts execution. | none |
| Suite config | Sets `config.loader.preUploadDelayMs = 1500`, `timeoutMs = 20000`; marks fixture blocks `wifi`, `wifiInvalid` as required. | none |
| Test metadata | Overrides `config.loader.timeoutMs = 25000`, `preUploadDelayMs = 0`; appends storage preload descriptor; sets `requirements`, `chain`, `order`. | Warn if required fixture missing (not triggered). |
| CLI overrides (final) | `--pre-cli-delay 2000` → `config.loader.preUploadDelayMs = 2000`; `--no-reset` → `config.loader.noReset = true`, `config.cli.RESET_BEFORE_SEND = false`; `--port /dev/ttyACM0` populates `config.loader.port` and `config.cli.ports = ['/dev/ttyACM0']`. | Resolver logs that suite/test reset requests (none here) would be overridden if present. |

### Final resolved config (abridged)

```json
{
  "fixture": {
    "wifi": { "ssid": "SHED", "password": "MyGreatShed", "timeoutMs": 25000 },
    "wifiInvalid": { "enabled": false, "ssid": "SHED", "password": "WRONG" }
  },
  "cli": {
    "ports": ["/dev/ttyACM0"],
    "SAVE_ON_SEND": 0,
    "BAUD_RATE": 115200,
    "RESET_BEFORE_SEND": false,
    "cliArgs": ["--config", "BAUD_RATE=115200"],
    "espruinoConfig": []
  },
  "loader": {
    "board": "ESP32C3",
    "port": "/dev/ttyACM0",
    "requestedSuites": ["wifi-station"],
    "preUploadDelayMs": 2000,
    "postUploadDelayMs": 1000,
    "timeoutMs": 25000,
    "noReset": true,
    "storagePreload": [
      { "filename": "wifi.log", "contents": "start" }
    ],
    "chain": "wifi_connect_sequence",
    "order": 1,
    "requirements": ["WIFI-CONNECT-001"]
  },
  "diagnostics": [],
  "provenance": [
    { "source": "run", "path": "loader.preUploadDelayMs", "value": 1000 },
    { "source": "board", "path": "cli.BAUD_RATE", "value": 115200 },
    { "source": "suite", "path": "loader.timeoutMs", "value": 20000 },
    { "source": "test", "path": "loader.timeoutMs", "value": 25000 },
    { "source": "cli", "path": "loader.preUploadDelayMs", "value": 2000 }
  ]
}
```

The provenance array records the final value’s lineage, making it clear that the CLI override ultimately won for `preUploadDelayMs` while the test metadata provided the timeout. This snapshot is written to `results/<stamp>/ESP32C3/runner-metadata/test_connect_get_ip.js.json` with any accompanying diagnostics.

## Fixture metadata schema and injection

The harness loads fixture data from JSON files and threads it through the same layering model as other metadata types. Each layer may add new fixture keys or replace existing ones, following the overwrite precedence described above.

A fixture document is a JSON object whose top-level keys group related data (for example `wifi`, `peripherals`, `mqtt`). The structure stays flexible, but authors should prefer descriptive leaf fields and avoid sharing secrets across suites unintentionally.

```json
{
  "wifi": {
    "ssid": "SHED",
    "password": "MyGreatShed",
    "timeoutMs": 25000
  },
  "wifiInvalid": {
    "enabled": false,
    "ssid": "SHED",
    "password": "WRONG"
  },
  "peripherals": {
    "i2cSensors": ["0x40", "0x48"],
    "gpio": { "led": 2, "button": 0 }
  }
}
```

### Sources and resolution

- Board catalogue: each board provides a `fixtures/<board>/base.json` (or equivalent module) that captures non-negotiable wiring such as GPIO mappings, storage slots, and default transport credentials. This file seeds `config.fixture` as soon as the board is selected.
- Suite overlays: every suite may ship a `tests/<suite>/suite.fixtures.json` file. When present, it overwrites or extends the board catalogue for matching fixture keys so that the suite's functional requirements are applied consistently across boards.
- Environment profile (future): a later revision may allow the run session to select an environment label (for example `lab`, `ci`) that loads `fixtures/environments/<env>.json`. Until then, teams can model environment differences directly inside the suite overlays or board catalogues.
- Test metadata: individual scripts may override or extend fixture values within their JSON header when they need bespoke data (for example a temporary SSID or expected certificate fingerprint).

With these sources the harness still applies last-writer-wins precedence, but the catalogue gives each layer a predictable place to declare its needs.

### Declaring requirements

Test metadata should list the fixture paths it expects via `fixtures.required` (an array of dotted keys). During the merge the harness verifies that every required path is present after all overlays are applied, and the same list is used to slice the merged fixture object before injection so only the requested branches reach the device. When a script omits `fixtures.required`, the harness falls back to injecting the entire fixture object. Suites may also provide a `fixtures.required` list so the run fails early if the board catalogue or suite overlay lacks the necessary blocks.

### Injection point

Just before the CLI invocation layer wraps and uploads a script, the harness serialises the fixture subset dictated by `fixtures.required` (or the full object when no list is provided) and assigns it to `global.ESPRUINO_FIXTURES` within the generated prologue. Tests access their data via that global (for example, `global.ESPRUINO_FIXTURES.wifi`). The final fixture snapshot is appended to the existing execution log for the test (for example, as a JSON block at the end of `results/<timestamp>/<board>/logs/<test>.stdout`), so no additional `.fixtures.json` artifact is produced.

Validation hooks can reject fixture overrides that contradict board capabilities, ensuring mismatches surface before the CLI command executes.

## Operational flow approach

The principal behind building the complete metadata set , containing all types, for the execution of a test can be thought of as a rolling review of metadata definition files, at each layer. In a way that each layer review can add or update specific metadata values. Each subsequent review taking precedence  over any previously established value.  

## Metadata aquisation workflow.

The meta data definition , building and utilisation process can be summarised with respect to the testing execution workflow as: 

1) Load the EspruinoTools default configuration (EspruinoTools/configDefaults.json) to seed `config.cli` and `config.loader` for the run session.

2) Resolve the selected board manifest. Apply board defaults (suite scope, CLI hints) and load the board fixture catalogue (`fixtures/<board>/base.json`) into `config.fixture`.

3) Apply run-level overrides: `test_config.json` (identified on the command line). Environment fixture profiles are reserved for a future revision; for now any environment-specific tweaks live in the board catalogue or suite overlay. These updates produce the run-specific config object used as the starting point for each suite.

4) For each suite, clone the run config, merge suite metadata (`suite_config.json`), and apply any suite fixture overlay (`tests/<suite>/suite.fixtures.json`). Validate suite-level `fixtures.required` declarations at this stage.

5) For each test script, merge its JSON header metadata into the suite config. Enforce `fixtures.required` and any other per-test constraints before proceeding.

6) Immediately before execution, materialise the final config: wrap the test source, inject `global.ESPRUINO_FIXTURES`, create the Espruino CLI command, and honour configured delays around the invocation.

 
## Reference The espruino CLI config flags and defaults in configDefaults.json

 {
  "baudRate": 0,
  "expr": "",
  "color": false,
  "file": "",
  "firmwareFlashOffset": 0,
  "minify": false,
  "no-ble": false,
  "outputJS": "",
  "ports": [""],
  "quiet": false,
  "setTime": false,
  "watchFile": false,
  "showDevices": false,
  "verbose": false,
  "updateFirmware": "",
  "espruino": {
    "BAUD_RATE": 9600,
    "BLUETOOTH_LOW_ENERGY": true,
    "BOARD_JSON_URL": "http://www.espruino.com/json",
    "COMPILATION": true,
    "COMPILATION_URL": "http://www.espruino.com:32766",
    "ENV_ON_CONNECT": true,
    "MINIFICATION_LEVEL": "",
    "MINIFICATION_Mangle": true,
    "MODULE_AS_FUNCTION": false,
    "MODULE_EXTENSIONS": ".min.js|.js",
    "MODULE_MINIFICATION_LEVEL": "ESPRIMA",
    "MODULE_URL": "http://www.espruino.com/modules",
    "NPM_MODULES": false,
    "RESET_BEFORE_SEND": true,
    "SAVE_ON_SEND": 0,
    "SAVE_STORAGE_FILE": "",
    "SERIAL_AUDIO": 0,
    "SERIAL_TCPIP": "",
    "SERIAL_THROTTLE_SEND": false,
    "SET_TIME_ON_WRITE": false,
    "STORE_LINE_NUMBERS": true,
    "UI_MODE": "Normal",
    "WEB_BLUETOOTH": true
  }
}

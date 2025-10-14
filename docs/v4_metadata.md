# Espruino Test Harness v4 – Metadata Specification

## 1. Overview
This document captures the v4 metadata model that governs how the Espruino test harness configures, executes, and records test runs. It describes the repository layout, the configuration object exposed to the harness (“config”), the layering and precedence rules that build that object, validation expectations, and the artefacts emitted after each run. The goal is to provide a stable foundation for future automation while keeping Gordon’s original tooling usable.

## 2. Repository Structure
```
MyEspruinoTester01/
├─ boards/
│  └─ <board>/
│     ├─ board.json                    # required board metadata (identity, firmware, flash, suites)
│     ├─ fixture.json                  # optional fixture catalogue defaults for this board
│     ├─ cli.json                      # optional board-level CLI defaults (ports, args)
│     ├─ README.md                     # reference for board quirks and setup
│     ├─ cliBoardFiles/                # EspruinoTools board JSON overrides
│     └─ firmware/<version>/...        # prebuilt Espruino flash firmware bundles
├─ configs/                             # shared run-session defaults / environments
├─ docs/                                # specifications, run books, archives
├─ lib/                                 # reusable harness source libraries (resolver, discovery, etc.)
├─ results/                             # timestamped run artefacts
├─ scripts/                             # CLI entrypoints (runners, flashers, utilities)
├─ tests/
│  └─ <group>/.../<suite>/              # `group` segments optional; final directory is the suite
│        ├─ README.md                  # suite overview, required fixtures, execution notes
│        ├─ test_*.js                  # test scripts
│        ├─ testConfig.json            # suite-level defaults (see §4.3)
│        └─ assets/                    # storage preload files, supporting fixtures
├─ EspruinoTools/                       # upstream CLI and dependencies
└─ … other historical support folders (flashers, firmware, openocd, etc.)
```

## 3. Configuration Model
The harness builds a single `config` object per test. Metadata is grouped into three logical branches:

- **`config.fixture`** – constants injected into the device under test (Wi-Fi credentials, GPIO mappings, sensor addresses). These values are exposed to tests via `global.ESPRUINO_FIXTURES`.
- **`config.cli`** – parameters passed to the Espruino CLI (`SAVE_ON_SEND`, `RESET_BEFORE_SEND`, `--config` pairs, port list, baud rate).
- **`config.loader`** – harness execution controls (selected board and suites, pre/post delays, timeouts, storage preload descriptors, execution order, requirement tags).

Each layer of the harness contributes to these branches; later layers may override earlier ones subject to the merge rules in §6.

## 4. Layered Merge Pipeline
Metadata is applied from highest scope (run session) down to the individual EspruinoTools CLI invocation. Values established by an upper layer are available to all layers beneath it.

### 4.1 Run Session
A single harness invocation (“run session”) captures operator intent: requested suites, CLI overrides, fixture source, and output directory. The session loads shared defaults such as `EspruinoTools/configDefaults.json`, seeding `config.cli` and `config.loader` before specialising for any board.

> _Note:_ In EspruinoTools the `configDefaults.json` file is a reference template. The harness may actively load and merge it to establish baseline CLI settings before applying board/suite/test overrides.

### 4.2 Board Profile
Each board directory supplies typed metadata files that seed the run configuration:

- `boards/<board>/board.json` (**required**) populates `config.board` with identification, firmware bundle details, flash adapter settings, default and available suites, and any EspruinoTools linkage (for example `localJSON`).
- `boards/<board>/fixture.json` (**optional**) contributes to `config.fixture`. When absent, the resolver assumes no default fixtures for the board.
- `boards/<board>/cli.json` (**optional**) contributes to `config.cli` and `config.loader.ports`, allowing baud/port defaults without embedding them in the required board JSON.
- Board metadata may also establish default artefact persistence under `config.loader.output` (see §9.5) so noisy directories can be trimmed when necessary.

Files that are not present are simply skipped, keeping the entry-level experience lightweight. The loader reads each file once, infers its destination branch from the filename, and merges the resulting objects (board → fixture → cli) before moving on to suite metadata. No additional overlay files are supported in v4; board authors should express all defaults inside these typed documents.

### 4.3 Suite Layer

Suites live under `tests/`, optionally nested within descriptive grouping directories. For example `tests/wifi/core/wifi-station/` or `tests/demo/flash-storage/`. When referenced from a board profile or the CLI, omit the leading `tests/` and use the relative path (e.g. `wifi/core/wifi-station`). The final directory name is treated as the suite identifier; intermediate segments are purely organisational and have no semantic meaning in the merge pipeline. Harness discovery walks the tree depth-first, so the execution order is determined by `testConfig.json` plus deterministic file discovery within each suite. The runner executes suites in the order they are supplied on the harness CLI (after board defaults when `--suites` is omitted).

Suites narrow the run session to a functional set of tests. Each suite is addressed by its path relative to `tests/` (for example `demo/flash-storage` or `wifi/core/wifi-station`). Each such directory may ship a `testConfig.json` with the schema below:

```json
{
  "suite": "wifi-station",
  "metadataVersion": 1,
  "config": {
    "loader": {
      "preUploadDelayMs": 1500,
      "timeoutMs": 20000
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
  "notes": "Defaults applied to every wifi-station test."
}
```

Keys inside `config` mirror the top-level branches (`loader`, `cli`, `fixture`). The resolver merges them into the in-flight `config` object without prefixing. Provenance is recorded separately so downstream tools can see which layer supplied each value.

Suites can also define execution order by supplying an `execution.order` array:

```json
{
  "suite": "wifi-station",
  "metadataVersion": 1,
  "execution": {
    "order": [
      "test_setup.js",
      "../shared/test_library_require.js",
      "test_consumes_library.js"
    ]
  },
  "config": { /* … */ }
}
```

The harness maps this list onto the discovered tests (and any shared helpers) to derive the execution sequence. After visiting the listed files in order, any remaining `test_*.js` files are appended using deterministic discovery order. Per-test overrides are not supported—suite metadata is the single source of truth for ordering.

Suites should source reusable fixture data from their board profile rather than duplicating JSON. The board-level catalogue (`boards/<board>/fixture.json`) merges automatically into `config.fixture`, letting the resolver share wiring and credential data across suites. When a suite needs custom values, keep them minimal and additive in `testConfig.json` or suite-local assets so future changes to the board fixture stay authoritative.

### 4.4 Test Script Layer
Individual `test_*.js` files contribute metadata through an opening `/* JSON { … } */` comment. Common keys include `timeoutMs`, `preUploadDelayMs`, `storagePreload`, `cliArgs`, `espruinoConfig`, `fixtures.required`, and `requirements`. The harness parses the header, merges it into the suite-level `config`, and validates the result before scheduling the CLI upload.

### 4.5 CLI Overrides
Harness command-line switches always apply last. §5.2 lists the mapping between flags and `config` branches. When supplied multiple times, the rightmost flag wins. CLI overrides are also responsible for seeding values such as `config.loader.port` and `config.cli.ports`.

### 4.6 CLI Invocation
Each test ultimately becomes one or more Espruino CLI invocations. At this layer the harness:
- wraps the test source with harness helpers (keep-alive heartbeat, result capture),
- injects the resolved fixture subset into `global.ESPRUINO_FIXTURES`,
- stages any storage preload assets,
- constructs the CLI argument list from `config.cli`,
- enforces configured pre/post delays, and
- captures stdout/stderr to per-test logs.

The invocation layer also persists artefacts described in §8.

### 4.7 Metadata Acquisition Workflow Summary
1. Load shared defaults (including `configDefaults.json`) to seed the run-session `config`.
2. Load `boards/<board>/board.json`, then merge any optional siblings (`fixture.json`, `cli.json`) to seed `config.board`, `config.fixture`, and `config.cli`.
3. Apply run-level overrides declared on the harness CLI (fixture file selection, suites, output dir).
4. For each suite, clone the run config, merge `testConfig.json`, and apply any suite fixture overlay. Validate suite-level `fixtures.required` at this stage.
5. For each test, merge metadata from the JSON header, validate requirements, and collect diagnostics.
6. Immediately before execution, materialise the final CLI command, inject fixtures, and execute.

## 5. Harness CLI Integration

### 5.1 Supported Flags
The harness exposes a small set of CLI switches. These belong to the **harness CLI**, not the downstream EspruinoTools CLI.

| Flag | Destination | Notes |
| --- | --- | --- |
| `--board <id>` | `config.loader.board` | Also determines the board profile. Missing `boards/<board>/board.json` aborts the run. |
| `--port <tty>` | `config.loader.port`, `config.cli.ports[0]` | Additional `--port` flags append to the ports array in order supplied. |
| `--suites a,b` | `config.loader.requestedSuites` | Bypasses board defaults; suites execute in the order listed; unknown names trigger a fatal error. |
| `--fixtures <path>` | `config.fixtureSource` (merged into `config.fixture`) | Supplies the top-level fixture document; lower layers can still override branches. |
| `--pre-cli-delay <ms>` | `config.loader.preUploadDelayMs` | Parsed as integer; overrides metadata-provided delays. |
| `--post-cli-delay <ms>` | `config.loader.postUploadDelayMs` | Parsed as integer; overrides metadata-provided delays. |
| `--no-reset` | `config.loader.noReset = true`, `config.cli.RESET_BEFORE_SEND = false` | Overrides any metadata requesting resets; provenance records the override. |
| `--only <pattern>` (planned) | `config.loader.testFilter.pattern` | Filters discovered tests by ID/title. |
| `--quiet` / `--verbose` | `config.loader.quiet`, `config.loader.verbose` | Govern logging behaviour within the harness. |

### 5.2 Collision Handling
Collisions occur when two layers assign competing values to the same configuration field. The harness resolves them as follows:

- Scalar fields (`preUploadDelayMs`, `timeoutMs`, `noReset`, `RESET_BEFORE_SEND`) are replaced outright by the CLI value.
- Array fields (`ports`, `cliArgs`, `espruinoConfig`, `storagePreload`) follow the merge behaviour defined in §6.
- When a CLI override makes earlier metadata impossible (for example, `--no-reset` against a mandatory reset), the resolver records a warning and honours the CLI directive unless the board profile marks the behaviour as fatal.

## 6. Merge Behaviour and Precedence
The resolver applies a last-writer-wins policy by default: unknown keys are added; scalar values and objects are replaced when new values arrive. Arrays have explicit exceptions to avoid clobbering necessary data.

| Key | Default Behaviour | Merge Rule |
| --- | --- | --- |
| `config.loader.preUploadDelayMs`, `config.loader.postUploadDelayMs`, `config.loader.timeoutMs`, `config.loader.noReset`, `config.loader.reset` | Replace | Later value replaces earlier ones. |
| `config.cli.SAVE_ON_SEND`, `config.cli.RESET_BEFORE_SEND`, `config.cli.BAUD_RATE`, other scalar `config.cli.*` | Replace | The most recent layer wins. |
| `config.cli.ports` | Replace array unless appended via CLI | Metadata supplies a default array; each `--port` flag appends in order. |
| `config.cli.cliArgs` | Append | Treat entries as a queue; CLI `--config` pairs may replace specific values. |
| `config.cli.espruinoConfig` | Append with dedupe | `{key,value}` pairs accumulate; later values overwrite duplicate keys. |
| `config.loader.storagePreload` | Append | Descriptors accumulate; supplying an empty array clears prior entries. |
| `config.fixture.*` | Replace per key | Entire fixture sub-objects (e.g., `wifi`) are replaced by later layers. |
| `config.loader.execution.order` | Replace | Suite metadata is authoritative for ordering; tests not listed follow deterministic discovery order. |
| `config.loader.requirements` | Replace | Per-test metadata is authoritative. |
| `config.loader.output.writeSources`, `config.loader.output.writeLogs`, `config.loader.output.writeMetadata` | Replace | Boolean flags that toggle the persistence of sources, raw logs, and per-test metadata files. Defaults are `true` when unspecified. |

Resulting precedence order: **run session defaults → board profile → suite overrides → test metadata → harness CLI flags.**

## 7. Fixture Metadata
Fixture documents are JSON objects whose top-level keys group related values (for example, `wifi`, `peripherals`, `mqtt`). Authors should keep payloads descriptive and avoid hard-coding secrets into source control.

### 7.1 Schema Example
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
This example matches the shape of `boards/<board>/fixture.json`. Files loaded from the fixture pipeline always expose the fixture keys at the top level. When a layer such as a board profile or suite config wants to inline fixture overrides, it nests them under the `config.fixture` branch (see §4.3) so the resolver can merge the standalone catalogue and the inline patches into the same tree.

### 7.2 Sources and Overlays
- **Board catalogue:** `boards/<board>/fixture.json` seeds defaults such as wiring, storage slots, and immutable transport credentials when present.
- **Suite overlay:** `tests/<suite>/suite.fixtures.json` (optional) extends or overrides board catalogues to enforce suite-specific requirements.
- **Run-session fixture file:** selected via `--fixtures <path>`; typically references `configs/fixtures.<env>.json`.
- **Test metadata:** individual scripts can tweak fixture values in their header when they require bespoke inputs.

### 7.3 Declaring Fixture Requirements
Suites and tests may declare `fixtures.required` (array of dotted paths). The resolver validates the merged fixture object against these requirements, fails early when mandatory data is missing, and trims the injected object so the device only receives the requested branches. When `fixtures.required` is omitted the entire fixture tree is injected.

**Examples:**

- Suite (`tests/esp32c3/wifi-station/testConfig.json`):
  ```json
  {
    "suite": "wifi-station",
    "config": {
      "fixture": {
        "required": ["wifi", "wifiInvalid"]
      }
    }
  }
  ```
- Test header:
  ```
  /* JSON {
    "fixtures": {
      "required": ["wifi.ssid", "wifi.password"]
    }
  } */
  ```

### 7.4 Injection
Immediately before wrapping the test, the harness serialises the required fixture subset and assigns it to `global.ESPRUINO_FIXTURES`. The final fixture snapshot is recorded within `results/<stamp>/<board>/runner-metadata/<testId>.json`; no separate `.fixtures.json` artefact or log append is produced.

## 8. Validation Expectations
The resolver and harness emit diagnostics while merging and executing. Each diagnostic records a `level` (`warning` or `error`), `source` (run, board, suite, test, CLI), `path`, and `message`. Runs halt before execution if any errors are present.

### 8.1 Fixture Checks
- Every required fixture block is present; missing blocks are errors, missing optional leaf keys produce warnings.
- Placeholders such as empty strings or `"<changeme>"` are flagged when marked mandatory.

### 8.2 CLI Configuration Checks
- `SAVE_ON_SEND` must be within `{-1,0,1,2,3}`; non-zero values conflicting with board capabilities raise errors.
- `RESET_BEFORE_SEND` must align with `config.loader.noReset` (set by the harness CLI); conflicting settings generate warnings and favour the loader value.
- `cliArgs` and `espruinoConfig` entries are deduplicated; malformed `key=value` pairs cause errors.
- Port overrides are checked against board-provided hints; out-of-pattern selections generate warnings.
- Baud rate overrides must be numeric and remain within board-defined ranges.

### 8.3 Loader Checks
- `timeoutMs`, `preUploadDelayMs`, and `postUploadDelayMs` are validated as non-negative integers and clamped to board-defined bounds.
- Execution order lists declared in suite metadata must reference existing tests exactly once; duplicates or gaps raise errors.
- Reset conflicts escalate to errors when the board profile marks the reset mandatory; otherwise they produce warnings.
- Storage preload descriptors must reference existing files; missing assets are fatal unless explicitly flagged optional.

### 8.4 Run-session Checks
- Requested suites must exist; required suites with no discovered tests trigger errors (optional suites raise warnings).
- The selected board profile must match `--board`; mismatches abort the run.
- Fixture provenance is captured so final snapshots show the source of each value when overrides occur.

### 8.5 Execution-time Checks
- Before spawning the Espruino CLI every `config.cli` key is validated against supported `--config` options; unknown keys cause errors.
- Fixture requirements are rechecked per test; missing prerequisites force a `FAIL` outcome with the first missing path recorded as the reason.
- Device output is parsed to ensure JSON payloads are well formed; malformed payloads appear as `invalid_result_json` errors.
- Storage preload assets are verified for existence, permissions, and board-defined size limits.
- External tools (`espruino`, `esptool.py`, OpenOCD) are verified up front so runs fail fast when dependencies are missing.

### 8.6 Discovery & Artefact Checks
- The discovery phase enforces naming (`test_*.js`), flags duplicate IDs across targets, and warns about empty suites referenced by board profiles.
- After execution the harness confirms that per-test artefacts (wrapped sources, logs, JSON) were written successfully, surfacing permission or disk issues immediately.

### 8.7 Reporting
- Diagnostics are persisted next to the resolved configuration (`results/<stamp>/<board>/runner-metadata/<testId>.json`).
- A consolidated diagnostics summary is emitted before suites execute; any `error` level entry aborts the run.

## 9. Run Artefacts and Persistence
Each run writes a predictable artefact set under `results/<timestamp>/<board>/`:

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

### `sources/<testId>`
- Wrapped JavaScript exactly as submitted to EspruinoTools (`-e` payload), including:
  - Prologue with timeout/fixture injection.
  - Original test source (minus leading metadata comment).
  - Epilogue that polls `result` and prints the JSON sentinel.
- Useful for replaying the upload outside the harness or diffing injected fixtures.

### `logs/<testId>.stdout` / `logs/<testId>.stderr`
- Raw EspruinoTools stdout/stderr.
- Contains console banners, upload progress, JSON sentinel, and (for failures) any diagnostic noise the harness prints (for example raw CLI output when `no_result` occurs).
- Storage preload stages write additional suffixed logs (for example `.storage.stdout`) so diagnostics remain isolated.

### `runner-metadata/<testId>.json`
- Resolved configuration after all layers merge. CLI defaults pulled from `EspruinoTools/configDefaults.json` are filtered so only overrides remain; fixture data reflects the merged tree that was injected into the device.
- Provenance entries capture `{source, path, value}` in merge order, showing whether a surviving value came from session defaults, board profile, suite metadata, test header, or CLI overrides. When multiple layers touch the same field (for example `cli.ports` or `cli.cliArgs`) successive entries form a readable audit trail explaining the final value.
- `diagnostics` records validation warnings/errors emitted during merge or execution.
- `cliCommand` is the literal argument vector used to spawn EspruinoTools, making the test run replayable even if defaults are hidden elsewhere.
- `artefacts` lists helper paths (`sources/<testId>`, `logs/<testId>.*`, etc.) so downstream tooling can navigate the run output without hard-coded directory knowledge.

### `<suite>.json`
- Per-suite roll-up produced after execution.
- Contains:
  - `board`, `port`, and `suite` identifiers.
  - `when` timestamp (ISO-like `YYYYMMDD-HHmmss`).
  - `summary` with pass/fail/skip counts and per-test stats.
  - `boardFiles` echoing the board metadata sources for traceability.

### `run-summary.json` (planned)
- Not emitted yet; placeholder for a future top-level roll-up spanning every suite in the invocation.

All JSON artefacts follow stable schemas so external tooling can consume them without intimate knowledge of the harness code.

### 9.5 Controlling Artefact Output
The harness honours `config.loader.output` booleans to suppress specific artefacts:

- `config.loader.output.writeSources` (default `true`) – when `false`, skips writing `sources/<testId>`.
- `config.loader.output.writeLogs` (default `true`) – when `false`, omits `logs/<testId>.stdout` and `logs/<testId>.stderr`.
- `config.loader.output.writeMetadata` (default `true`) – when `false`, suppresses `runner-metadata/<testId>.json`.

Regardless of these flags, suite-level JSON summaries are always produced so downstream automation can track aggregate results.

## 10. End-to-end Example
**Scenario:**
- Command: `node scripts/run-tests-gordonV4.js --board ESP32C3 --port /dev/ttyACM0 --suites wifi-station --pre-cli-delay 2000 --no-reset`
- Run defaults: `preUploadDelayMs=1000`, `postUploadDelayMs=1000`, `timeoutMs=10000`
- Board profile (`boards/ESP32C3/board.json`): `SAVE_ON_SEND=0`, default suites `wifi-station`, `wifi-core`
- Board CLI defaults (`boards/ESP32C3/cli.json`): `ports.serial=["/dev/ttyUSB*","/dev/ttyACM*"]`, `ports.baud=115200`
- Suite config (`testConfig.json`): `preUploadDelayMs=1500`, `timeoutMs=20000`, fixtures `wifi`, `wifiInvalid` required
- Test metadata (`test_connect_get_ip.js`):
  ```json
  {
    "timeoutMs": 25000,
    "preUploadDelayMs": 0,
    "storagePreload": [{ "filename": "wifi.log", "contents": "start" }],
    "requirements": ["WIFI-CONNECT-001"]
  }
  ```

**Merge timeline:**

| Layer | Key contributions | Diagnostics |
| --- | --- | --- |
| Run session | `preUploadDelayMs=1000`, `postUploadDelayMs=1000`, `timeoutMs=10000`; fixture file `configs/fixtures.wifi_station.json`. | None |
| Board profile | `SAVE_ON_SEND=0`; default suites. | None |
| Board CLI defaults | `BAUD_RATE=115200`; serial glob hints. | None |
| CLI (`--suites`) | Restricts execution to `wifi-station`. | None |
| Suite config | `preUploadDelayMs=1500`, `timeoutMs=20000`; `fixtures.required=["wifi","wifiInvalid"]`. | None |
| Test metadata | `timeoutMs=25000`, `preUploadDelayMs=0`; storage preload, requirements. | None |
| CLI overrides | `preUploadDelayMs=2000`, `noReset=true`, `RESET_BEFORE_SEND=false`, `ports=['/dev/ttyACM0']`. | Warning recorded if metadata had requested a reset (not present). |

**Final config (abridged):**
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
    "storagePreload": [ { "filename": "wifi.log", "contents": "start" } ],
    "requirements": ["WIFI-CONNECT-001"]
  },
  "diagnostics": [],
  "provenance": [
    { "source": "run", "path": "loader.preUploadDelayMs", "value": 1000 },
    { "source": "suite", "path": "loader.timeoutMs", "value": 20000 },
    { "source": "test", "path": "loader.timeoutMs", "value": 25000 },
    { "source": "cli", "path": "loader.preUploadDelayMs", "value": 2000 }
  ]
}
```

This snapshot, alongside diagnostics, is written to `results/<stamp>/ESP32C3/runner-metadata/test_connect_get_ip.js.json` for later analysis.

## 11. Appendix – Espruino CLI Defaults
For reference, `EspruinoTools/configDefaults.json` ships with the CLI and provides baseline values:

```json
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
```

## 12. Appendix – Migration Notes (v3 → v4)
The legacy harness expects `boards/<board>.json` to contain every board detail. Moving to the typed directory layout requires coordinated code, data, and documentation updates. The sections below summarise the key touchpoints and offer an execution checklist.

### 12.1 Current Loader Touchpoints
- `lib/manifest.js` lists boards, resolves paths, loads JSON, and exposes helpers such as `resolveFirmware` and `resolveSuites`.
- Runner CLIs (`scripts/run-tests.js`, `scripts/run-tests-espruino.js`, `scripts/run-tests-gordon.js`) consume the manifest object directly for ports, suites, upstream ID, and optional `localJSON`.
- Support tooling (`scripts/flash.js`, `scripts/dry-run.js`, `scripts/run-node-baseline.js`) relies on the same schema when choosing flash adapters, firmware bundles, and logging manifest paths.
- Tests under `lib/__tests__` stub manifests and will need fixture updates to reflect the new layout.

### 12.2 Fields To Remap
Map each legacy manifest branch into the new typed files:

| Legacy field | New location |
| --- | --- |
| `board`, `description`, `upstream`, `firmware`, `flash`, `suites`, `localJSON` | `boards/<board>/board.json` |
| `ports`, CLI defaults (`RESET_BEFORE_SEND`, `cliArgs`, etc.) | `boards/<board>/cli.json` |
| `fixtures` and other board-level constants | `boards/<board>/fixture.json` |

Ensure relative path logic (for example, resolving `localJSON` next to the board file) still functions after the move.

### 12.3 Migration Steps
1. **Create board directory:** move `boards/<board>.json` to `boards/<board>/board.json` and update any scripts that glob manifests.
2. **Extract fixtures:** copy fixture branches into `boards/<board>/fixture.json` when needed; omit the file entirely for boards without defaults.
3. **Extract CLI defaults:** move port patterns, baud rate, and Espruino CLI hints into `boards/<board>/cli.json` so `board.json` remains identity/firmware focused.
4. **Update loaders:** teach the new `run-tests-gordonV4.js` (and the helper modules it depends on) to load `board.json`, then merge `fixture.json` and `cli.json` if they exist. Apply the same logic to `flash.js`, `dry-run.js`, and other CLIs; v4 does not provide a compatibility shim, so the new layout must be in place before enabling these loaders.
5. **Refresh tests:** adjust unit fixtures and mocks to load the new files. Add coverage to ensure missing optional files are handled gracefully.
6. **Align documentation:** update run books, developer notes, and any external docs that reference the old manifest path.
7. **Validate end-to-end:** run `scripts/dry-run.js` (or the new runner) across each board to verify firmware resolution, suite discovery, and CLI arguments.

Once all boards adopt the directory layout and the v4 loader is in place, delete any remaining flat `boards/<board>.json` files to prevent drift.

## Appendix – Future Considerations

### Flash-based Test Wrapper (optional mode)

The current harness injects a full JavaScript wrapper ahead of every test. The wrapper provides fixture injection, keep-alive heartbeats, timeout handling, and result normalisation. For large suites or slower links it may be desirable to ship a lightweight per-test payload and load the wrapper from Espruino Storage instead.

**Proposed approach**
- Introduce a new harness switch (for example `--wrapper-mode flash`).
- At the start of a run, upload a versioned wrapper module into Espruino Storage (e.g. `Storage.write("harness_wrapper", "...")`).
- Each test uploads only a small stub that still injects fixtures inline, then calls `require("harness_wrapper").run(options, function(){ /* original test */ });` while passing timeout, suite metadata, etc.
- The Storage module mirrors today's wrapper behaviour (keep-alive heartbeat, polling, JSON result output) so result semantics stay identical.
- Maintain inline mode as the default to keep compatibility and simplify troubleshooting.

**Open questions**
- How to version the wrapper module and deal with stale copies when the device resets mid-run.
- Whether to automatically delete the Storage module after the run concludes.
- How to expose this mode in board profiles or CI (global switch vs per-suite selection).

This appendix describes exploration work only; no code currently implements the flash wrapper mode.


### Lightweight Assertions

Future test suites could benefit from simple on-device assertions that feel familiar to developers who use Jest or Mocha. A minimal harness-provided helper might offer:

```javascript
(function injectAssertions(){
  function assertionError(message) {
    var err = new Error(message);
    err.isHarnessAssertion = true;
    return err;
  }

  function format(val) {
    try { return JSON.stringify(val); }
    catch (_) { return String(val); }
  }

  function expect(actual) {
    return {
      toBe: function(expected) {
        if (actual !== expected) throw assertionError('Expected ' + format(actual) + ' to be ' + format(expected));
      },
      toEqual: function(expected) {
        if (JSON.stringify(actual) !== JSON.stringify(expected)) throw assertionError('Expected ' + format(actual) + ' to equal ' + format(expected));
      },
      toBeTruthy: function() {
        if (!actual) throw assertionError('Expected ' + format(actual) + ' to be truthy');
      },
      toBeFalsy: function() {
        if (actual) throw assertionError('Expected ' + format(actual) + ' to be falsy');
      }
    };
  }

  global.expect = expect;
})();
```

A wrapper-level `try/catch` could recognise `err.isHarnessAssertion` and convert it into the canonical `{ status: 'fail', reason }` shape. Tests would then read naturally:

```javascript
try {
  expect(helper.double(5)).toBe(10);
  __pass();
} catch (err) {
  if (err.isHarnessAssertion) {
    __fail(err.message);
  } else {
    __fail('Unexpected error: ' + (err && err.message || err));
  }
}
```

This would keep the harness minimal while meeting developers halfway with familiar assertion semantics.


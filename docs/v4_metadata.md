# Espruino Test Harness v4 – Metadata Specification

## 1. Overview
This document captures the v4 metadata model that governs how the Espruino test harness configures, executes, and records test runs. It describes the repository layout, the configuration object exposed to the harness (“config”), the layering and precedence rules that build that object, validation expectations, and the artefacts emitted after each run. The goal is to provide a stable foundation for future automation while keeping Gordon’s original tooling usable.

## 2. Repository Structure
```
MyEspruinoTester01/
├─ boards/
│  └─ <board>/
│     ├─ manifest.json                 # board-specific harness manifest
│     ├─ cliBoardFiles/                # EspruinoTools board JSON overrides
│     ├─ firmware/<version>/...        # prebuilt firmware bundles
│     ├─ config/<*.json>               # optional manifest-level overrides
│     └─ fixtures/<*.json>             # baseline board fixture catalogues
├─ configs/                             # shared run-session defaults / environments
├─ docs/                                # specifications, run books, archives
├─ lib/                                 # reusable harness source libraries (resolver, discovery, etc.)
├─ results/                             # timestamped run artefacts
├─ scripts/                             # CLI entrypoints (runners, flashers, utilities)
├─ tests/
│  └─ <target>/
│     └─ <suite>/
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
The selected board manifest provides defaults for suites, port hints, baud rates, and storage policy. It may also seed `config.fixture` by referencing `boards/<board>/fixtures/base.json` and can wire in additional configuration overrides from `boards/<board>/config/`.

### 4.3 Suite Layer
Suites narrow the run session to a functional area. Each suite may ship a `tests/<target>/<suite>/testConfig.json` with the schema below:

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

The harness maps this list onto the discovered tests (and any shared helpers) to derive the execution sequence. Tests not listed follow deterministic discovery order. Internally the runner turns this into the chained execution flow, so authors do not need to declare per-test `chain` / `order` metadata unless they wish to override the suite default.

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
2. Merge board manifest defaults and board-level fixtures.
3. Apply run-level overrides declared on the harness CLI (fixture file selection, suites, output dir).
4. For each suite, clone the run config, merge `testConfig.json`, and apply any suite fixture overlay. Validate suite-level `fixtures.required` at this stage.
5. For each test, merge metadata from the JSON header, validate requirements, and collect diagnostics.
6. Immediately before execution, materialise the final CLI command, inject fixtures, and execute.

## 5. Harness CLI Integration

### 5.1 Supported Flags
The harness exposes a small set of CLI switches. These belong to the **harness CLI**, not the downstream EspruinoTools CLI.

| Flag | Destination | Notes |
| --- | --- | --- |
| `--board <id>` | `config.loader.board` | Also determines the board manifest. Conflicting metadata aborts the run. |
| `--port <tty>` | `config.loader.port`, `config.cli.ports[0]` | Additional `--port` flags append to the ports array in order supplied. |
| `--suites a,b` | `config.loader.requestedSuites` | Bypasses manifest defaults; unknown suite names trigger a fatal error. |
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
- When a CLI override makes earlier metadata impossible (for example, `--no-reset` against a mandatory reset), the resolver records a warning and honours the CLI directive unless the board manifest marks the behaviour as fatal.

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

### 7.2 Sources and Overlays
- **Board catalogue:** all `boards/<board>/fixtures/*.json` files are loaded (typically starting with `base.json`) to capture wiring, storage slots, and immutable transport credentials.
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
- Port overrides are checked against manifest hints; out-of-pattern selections generate warnings.
- Baud rate overrides must be numeric and remain within manifest-defined ranges.

### 8.3 Loader Checks
- `timeoutMs`, `preUploadDelayMs`, and `postUploadDelayMs` are validated as non-negative integers and clamped to manifest bounds.
- Execution order lists declared in suite metadata must reference existing tests exactly once; duplicates or gaps raise errors.
- Reset conflicts escalate to errors when the manifest marks the reset mandatory; otherwise they produce warnings.
- Storage preload descriptors must reference existing files; missing assets are fatal unless explicitly flagged optional.

### 8.4 Run-session Checks
- Requested suites must exist; required suites with no discovered tests trigger errors (optional suites raise warnings).
- The selected board manifest must match `--board`; mismatches abort the run.
- Fixture provenance is captured so final snapshots show the source of each value when overrides occur.

### 8.5 Execution-time Checks
- Before spawning the Espruino CLI every `config.cli` key is validated against supported `--config` options; unknown keys cause errors.
- Fixture requirements are rechecked per test; missing prerequisites result in a `SKIP` outcome with an explicit reason.
- Device output is parsed to ensure JSON payloads are well formed; malformed payloads appear as `invalid_result_json` errors.
- Storage preload assets are verified for existence, permissions, and manifest-defined size limits.
- External tools (`espruino`, `esptool.py`, OpenOCD) are verified up front so runs fail fast when dependencies are missing.

### 8.6 Discovery & Artefact Checks
- The discovery phase enforces naming (`test_*.js`), flags duplicate IDs across targets, and warns about empty suites referenced by manifests.
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

- `sources/<testId>` – wrapped JavaScript with injected fixtures and harness prologue.
- `logs/<testId>.*` – raw CLI stdout/stderr per invocation; storage preload phases write their own suffixed logs.
- `runner-metadata/<testId>.json` – resolved configuration, diagnostics, provenance, CLI commands, and artefact references.
- `<suite>.json` – per-suite summary with pass/fail/skip counts, board metadata, manifest path, and run timestamp.
- `run-summary.json` (planned) – top-level roll-up spanning all suites executed in the session.

All JSON artefacts follow stable schemas so external tooling can consume them without intimate knowledge of the harness code.

## 10. End-to-end Example
**Scenario:**
- Command: `node scripts/run-tests-gordon.js --board ESP32C3 --port /dev/ttyACM0 --suites wifi-station --pre-cli-delay 2000 --no-reset`
- Run defaults: `preUploadDelayMs=1000`, `postUploadDelayMs=1000`, `timeoutMs=10000`
- Board manifest: `SAVE_ON_SEND=0`, `ports.baud=115200`, suites `wifi-station`, `wifi-core`
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
| Board profile | `SAVE_ON_SEND=0`, `BAUD_RATE=115200`; default suites. | None |
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

# v4 metadata specification notes

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
Represents one invocation of the harness. It captures the operator intent (requested suites, chosen overrides, future fixture-environment selection), loads shared configuration such as `configDefaults.json`, and produces the base `config` object. This layer also establishes run identifiers (timestamp, output directories) used for logging and reporting.

### Board profile
Pulls metadata from the selected board manifest (e.g., default suites, preferred ports, storage targets, min baud). These values specialise the run session for a specific hardware family and may set defaults for `config.cli` (port pattern, `SAVE_ON_SEND`) or `config.loader` (allowable suites).

### Test suite
Represents the collection of test scripts being executed together. Suite-level metadata (e.g., `suite_config.json`) can augment fixture data, adjust CLI arguments required by every script, or apply loader hints such as pre/post delays. The suite layer clones the run-level config and narrows it for the contained scripts.

### Test script
The individual `test_*.js` file contributes per-test metadata via its JSON header. It can override fixture keys, adjust timeouts, request storage preloads, or mark itself as skip/experimental. The merged output becomes the plan for the upcoming upload.

### CLI invocation
Each script turns into at least one Espruino CLI command. This layer materialises the merged metadata into concrete actions: wrap source, stage storage payloads, calculate delays, build the CLI argument list, and track stdout/stderr. Results from the CLI feed back into the reporting layer.

The layers flow into the collection and reporting pipeline: after each CLI invocation completes, the harness persists logs, the merged metadata snapshot, and the pass/fail decision so the run session can produce suite and run summaries.

### Merge and precedence rules
Each layer applies its metadata to the in-flight `config` object using a simple overwrite strategy:
- Keys that do not yet exist are added.
- Keys that already exist are replaced with the new value, even when the value is an array or nested object.

This yields an explicit precedence order: run session defaults → board profile → suite overrides → test metadata → command-line flags. After each layer is applied, the harness validates the resulting config so conflicting or unsupported combinations (for example, requesting `saveOnSend=storage` when the board forbids Storage writes) surface immediately.

Future iterations can introduce richer merge semantics (append, deep-merge) on a per-key basis, but the v4 baseline assumes last-writer-wins for clarity.

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

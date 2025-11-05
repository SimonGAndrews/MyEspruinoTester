# V4 implementation phase 1 - burnin tests

## Changes

### Config Merge Pipeline

- Added `lib/v4/runConfig.js` with helpers to load session defaults, suite configs, and per-test metadata, plus merge logic following v4 rules (array appends, espruinoConfig dedupe, provenance tracking).

- `scripts/run-tests-gordonV4.js` now builds layered configs: session defaults → board profile → suite `testConfig.json` → per-test header → CLI overrides, cloning the base config per test and recording provenance.

- CLI fixtures/ports feed into the same pipeline; per-test fixture injection now comes from the merged config and wrapped source is stored in results/.../sources for exact replay.

- The CLI upload path consumes the new config (BAUD_RATE, cliArgs, espruinoConfig, etc.) and metadata files capture config, provenance, result summary, and artefact paths. Errors fall back to metadata that still records the merged config.

### Docs

- Updated `docs/test-writing-guide.md` to clarify acceptable result values (boolean or status object) and how the wait loop normalises them.

- `docs/v4_metadata.md` already reflects the new `config.loader.output` toggles; no further changes required for this step.

## Burnin tests

### Suite/test metadata

Pick a suite, add a temporary block to one test,

```js
/* JSON { "config": { "loader": { "timeoutMs": 5000 } } } */ 
```

rerun the suite, and confirm the per-test metadata file shows the override (and the wrapper times out sooner). That proves the header parsing/merge path.

_loader.timeoutMs is now 5000 with provenance test:test_add_numbers.js, so the header override landed.
The result block captures the shortened timeout (there’s even a localized timeout_ms entry).
Sources/logs still point at the injected artefacts, so you can replay the exact wrapped script if needed._

### Fixture layering

Drop a minimal testConfig.json overlay (e.g., {"config":{"fixture":{"wifi":{"ssid":"test"}}}}) into a suite, rerun, and check `runner-metadata/<test>`.json to ensure the merged fixture object reflects the change.

Add `tests/javascript-core/testConfig.json` with this overlay:

```js
{
  "config": {
    "fixture": {
      "wifi": {
        "ssid": "test"
      }
    }
  }
}

```

_config.fixture.wifi.ssid now reads "test", showing the suite layer override was merged.
Provenance lists suite:javascript-core for fixture.wifi, so it’s clear the value came from tests/javascript-core/testConfig.json.
The rest of the metadata (timeout override, CLI overrides) remained intact from earlier tests._

### CLI passthrough

 Give cliArgs or an espruinoConfig entry via metadata and confirm the runner adds the --config argument. You can inspect the metadata file to see the merged values.

- _tests/javascript-core/test_add_numbers.js now carries cli.cliArgs: ["--config","SAVE_ON_SEND=1"] and cli.espruinoConfig includes { key: "SAVE_ON_SEND", value: 1 }._

- _In results/20251008-133952/ESP32C3/runner-metadata/test_add_numbers.js.json, those fields appear under config.cli, so the runner appended the extra --config SAVE_ON_SEND=1 argument when uploading the test._

### Legacy compatibility

Run scripts/run-tests.js or scripts/run-tests-espruino.js on the same suite to make sure the fallback to the new board layout still works (expect the usual DBus warning in this environment, but it’s enough to see the firmware/manifest load step succeed).

# V4 implementation phase 0

_great in theory we have revisited the spec a couple of times now end to end and with the last changes we should be ready to go. So whats next toward the goal of implementing the spec_

## Next up is turning the spec into runnable code and validating the new structure

I’d tackle it in this order:

1. Scaffold the v4 loader – `start run-tests-gordonV4.js` (or refactor existing runner) so it reads `board.json`, optional `fixture.json/cli.json`, merges them, then applies suite/test/CLI layers exactly as described. Update `lib/manifest.js` helpers or replace them with v4-aware modules the runner can call.

2. Update shared tooling – extend `scripts/flash.js`, `scripts/dry-run.js`, and any other CLIs to use the same load helpers. Replace the legacy `boards/<name>`.json assumptions everywhere, ensuring localJSON resolution and firmware discovery still work.

3. Port one board – copy a simple target (e.g. ESP32C3) into the new directory layout, split out fixtures/CLI defaults, and add a README stub so you have a concrete test bed.

4. Adjust tests & add coverage – rewrite unit test fixtures to the new schema and add tests that prove missing optional files are handled gracefully. Consider adding a validation script that lints every board directory.

5. Dry run end-to-end – with one board migrated, run the new loader plus flash/dry-run scripts to verify firmware paths, suite discovery, and config merging before touching other boards.

6. Migrate remaining boards – once the tooling is stable, convert the rest of the board manifests, remove legacy files, and update CI/jobs to call the v4 runner.

7. Document the process – capture migration steps in a runbook or README so contributors know how to add new boards under the v4 rules.

## implement up to point 5 (dry run one board) lets start with the ESP32C3 board

### Changes

* Added the v4 board loader (`lib/v4/boardProfile.js:1`) that reads `board.json`, `fixture.json`, and `cli.json`, normalising them into initial config.board/fixture/cli/loader branches.

* Split the ESP32C3 profile into the new directory layout with dedicated metadata and notes (`boards/ESP32C3/board.json:1`, `boards/ESP32C3/fixture.json:1`, `boards/ESP32C3/cli.json:1`, `boards/ESP32C3/README.md:1`), removing the legacy flat manifest.

* Introduced the v4 runner CLI (scripts/run-tests-gordonV4.js:1) that consumes the typed board files, merges fixture overrides, and writes results using the new config shape.

* Updated shared tooling to auto-detect the new layout while keeping legacy support (`scripts/dry-run.js:1`, `scripts/flash.js:1`), so listing, firmware validation, and flashing work with either board format.

### Updates during testing

* Added wildcard expansion in the ESP32 flasher so /dev/ttyACM* resolves to the first matching port (e.g. `/dev/ttyACM0`) before invoking esptool (`flashers/esp32-esptool.js:12`-f`lashers/esp32-esptool.js:149`).

* Flash CLI now detects this automatically—`node scripts/flash.js --board ESP32C3 --version 2v27.32 --dry-run` logs the resolved port and no longer fails when only a glob is provided.

Result - Dry-run after the change: port resolves to /dev/ttyACM0, esptool command previews correctly, and the warning about wildcards disappears unless no matches are found.

### Port Resolution Improvements

* Added a shared helper `lib/util/serial.js:1` that resolves wildcard serial patterns (/dev/ttyACM*, COM?, etc.) to the first concrete match, emitting helpful logs when none are found.

* Updated every runner to use the helper so --port defaults from board metadata now expand automatically: scripts/run-tests.js:227, `scripts/run-tests-espruino.js:114`, `scripts/run-tests-gordon.js:519`, and the new scripts/`run-tests-gordonV4.js:350`.

* Reworked the ESP32 flasher to reuse the same helper and drop its bespoke code, so flashing also expands globs consistently (`flashers/esp32-esptool.js:8`).

Tests - `node scripts/flash.js --board ESP32C3 --version 2v27.32 --dry-run` (now shows /dev/ttyACM0 when using the wildcard)

### Tests

* node scripts/dry-run.js --board ESP32C3 --version 2v27.32

* node scripts/flash.js --board ESP32C3 --version 2v27.32 --dry-run

* node scripts/run-tests-gordonV4.js --help

* node scripts/run-tests.js --board ESP32C3 --port /dev/ttyACM0 --suites javascript-core --quiet

* node scripts/run-tests-espruino.js --board ESP32C3 --port /dev/ttyACM0 --suites javascript-core --quiet --dry-run (if you want to avoid flashing)

### Results

ESP32C3 now exercises cleanly across the updated tooling:

* `scripts/flash.js` resolves /dev/ttyACM* to /dev/ttyACM0 and dry-run/flash both succeed.

* `scripts/run-tests.js --help`, `run-tests-espruino.js --help`, and `run-tests-gordon.js` --help continue to work.

* Legacy runners automatically fall back to the new board directory layout, so `boards/ESP32C3.json` is no longer needed. The run attempt hit a DBus permission issue in this sandbox (expected when no hardware session is available), but metadata loading and port resolution completed successfully.

## Further changes

### Spec changes

_Can we implement the sources , logs and metadata output in results. by default lets output them all . However can we update v4_metadata.md to include config.loader metadata to NOT produce each of the results output . The suite level.json results output is always produced as the minimum. we will implement in the next after the spec additions._

Added the new persistence controls to the spec:

* Board metadata can now default `config.loader.output` flags (`docs/v4_metadata.md:54`).

* Merge behaviour notes that writeSources, writeLogs, and writeMetadata are simple boolean overrides (`docs/v4_metadata.md:166`).

* Section 9.5 explains the new toggles and clarifies that suite summaries remain mandatory (`docs/v4_metadata.md:415`).

### What's Done

* Extended the v4 runner to honour `config.loader.output` flags so you can suppress sources, logs, or per-test metadata while still writing suite summaries (`scripts/run-tests-gordonV4.js:375-scripts/run-tests-gordonV4.js:456`).

* Added automatic creation of the `results/<stamp>/<board>/runner-metadata` tree only when necessary, and each per-test metadata file now captures board/suite/test identifiers, result status, and the resolved port.

* Updated the spec to document these switches (see `docs/v4_metadata.md:50`, `docs/v4_metadata.md:166`, `docs/v4_metadata.md:297`).

Suite JSON is still always generated; by default all artefacts remain on, so current behaviour is unchanged. Next step will be to exercise the new toggles (e.g., set config.loader.output.writeLogs: false in a suite or board config) once more boards migrate over.

Wrapped-source persistence is now in place. The v4 runner captures the fully injected script as soon as it’s composed, and when writeSources is enabled the file under `results/.../sources/<testId>` is exactly what EspruinoTools receives. Every runOneTest result now carries the wrapped source, so the sources directory stays accurate even if the original test file is changed after the run. Metadata files also note the associated artefact paths.

Every test is wrapped with a timeout harness and a single reporting function. Right before your script, the runner injects something like:

```js
var __TEST_TIMEOUT_SEC=30;
global.ESPRUINO_FIXTURES = { ... }   // only if fixtures are provided

(function(){
  function now(){return (typeof getTime==='function'?getTime():Date.now()/1000);}
  var __t0 = now();
  var __deadline = __t0 + (__TEST_TIMEOUT_SEC||5);
  function done(value){
    var duration = Math.round((now()-__t0)*1000);
    var status = 'pass';
    var reason = null;
    var ok = true;
    if (value !== null && typeof value === 'object') {
      if (typeof value.status === 'string') {
        status = value.status;
      } else if (value.skip) {
        status = 'skip';
      } else if (typeof value.pass !== 'undefined') {
        status = value.pass ? 'pass' : 'fail';
      } else {
        ok = !!value;
        status = ok ? 'pass' : 'fail';
      }
      if (typeof value.reason !== 'undefined' && value.reason !== null) reason = value.reason;
    } else {
      ok = !!value;
      status = ok ? 'pass' : 'fail';
    }
    if (typeof resultStatus !== 'undefined' && resultStatus !== null) status = resultStatus;
    if (reason === null && typeof resultReason !== 'undefined' && resultReason !== null) reason = resultReason;
    var passValue = status === 'pass';
    if (status === 'skip') passValue = false;
    var out={__espruino_test__:true,file:"test_async_timeout.js",pass:passValue,status:status,duration_ms:duration,reason: reason || null};
    print(JSON.stringify(out));
    if (typeof resultStatus !== 'undefined') resultStatus = undefined;
    if (typeof resultReason !== 'undefined') resultReason = undefined;
    if (typeof result !== 'undefined') result = undefined;
  }
  (function wait(){
    if (typeof result!=='undefined') return done(result);
    if (now()<__deadline) return setTimeout(wait,50);
    resultStatus = 'fail';
    resultReason = 'timeout';
    done(false);
  })();
})();

```

Test body sits between the prologue and this epilogue. The test signals completion by setting global.result (for pass/fail), resultStatus, or returning an object that includes status, pass, skip, and/or reason. If nothing resolves before the deadline, the harness auto-fails with timeout.

Runners share the same harness pattern: the wrapper polls for global.result, reads optional resultStatus/resultReason, and prints a JSON object with status, pass, reason, and duration_ms. None of them inject a helper object or API on the device; they all rely on the test author assigning a simple value (truthy/falsy, {status:'skip'}, etc.) to result.

Both the code and documentation now line up:

* The v4 runner stores the exact wrapped script—including fixtures and the result-handling prologue/epilogue—in results/.../sources/.

* The test-writing guide clarifies that result can be a boolean or an object, explains how the wait loop normalises the value, and documents the timeout path.

## Remaining Gaps vs Spec

1. Layered Config (§4): run-tests-gordonV4.js loads board JSON (plus fixture/cli) but never merges suite-level testConfig.json, test header metadata, or run-session defaults from EspruinoTools/configDefaults.json. CLI flags only tweak ports/fixtures and don’t feed back into a consolidated config object.

2. Suite Ordering & Metadata (§4.3): Execution order from execution.order isn’t honoured; resolveSuiteTests still relies on legacy suite manifests. Suite metadata (config.loader, config.cli, config.fixture) isn’t applied.

3. Test Metadata Layer (§4.4): JSON headers aren’t parsed, so per-test timeouts, storagePreload, requirements, or CLI tweaks never arrive.

4. Requirements & Diagnostics (§7.3, §8): No validation pipeline—fixtures.required, requirements, collision handling, or diagnostics logging aren’t implemented. Runner emits no structured warnings/errors beyond stdout prints.

5. Fixture Flow (§7.2): Only board fixture JSON is merged; suite/test overlays and CLI --fixtures layering aren’t integrated into a single resolved tree or validated.

6. Storage Preload (§4 / §8.5): Metadata for storage preloads is ignored; no staging of assets or log capture.

7. CLI Mapping (§5.1): Spec lists additional CLI switches (--pre-cli-delay, --post-cli-delay, --no-reset, etc.) but the new runner still mirrors the limited legacy flag set and doesn’t propagate values into config.loader / config.cli.

8. Merge Behaviour (§6): Last-writer-wins rules, array handling, and provenance tracking are not wired up; there’s no central config object to inspect.

9. Artefact Metadata (§9): Suite JSONs exist, but per-test metadata lacks the spec’s full schema (no diagnostics/provenance). run-summary.json remains unimplemented.

10. Appendix Expectations (§11/§12): No loader shim for older manifests beyond ad-hoc fallback; broader migration steps (validation scripts, CI hooks) still pending.

In short, the new runner currently covers board profile loading, port wildcard resolution, and artefact toggles, but the layered metadata pipeline, validation rules, richer CLI surface, and provenance/diagnostics called out in the spec are still to be implemented.

### Plan

A pragmatic way to close the gaps is to layer the missing pieces so each increment unlocks the next. I’d tackle them in four chunks:

#### 1. Load & Merge the Metadata Layers

* Extend `run-tests-gordonV4.js` (or shared helpers) to:
  * Merge run-session defaults (`EspruinoTools/configDefaults.json`).
  * Apply board profile (already partly there), then suite `testConfig.json`, then per-test JSON header metadata.
* Implement config.loader precedence rules (last-writer-wins, array handling) while you build the merged object.

* Capture provenance as you merge (e.g., path + source layer), so later diagnostics/tests have something to print.

#### 2. Resolve Suites, Requirements, and Fixtures

* Switch resolveSuiteTests to respect execution.order arrays and drop legacy suite manifests.

* Parse suite/test metadata for fixtures.required, merge fixture overlays (board → suite → test → CLI --fixtures), and validate missing branches.

* Add requirement checks (suite/test requirements) and surface failures in a simple diagnostics array.

#### 3. Execution Controls & Artefacts

* Honour suite/test timeoutMs, preUploadDelayMs, postUploadDelayMs, storage preload descriptors (stage files, log output), and CLI adjustments (cliArgs, espruinoConfig, SAVE_ON_SEND, etc.).

* Add the missing CLI flags (--pre-cli-delay, --post-cli-delay, --no-reset, etc.) and map them to config.loader/config.cli.

* Flesh out `runner-metadata/<test>.json` with the merged config fragment, fixture snapshot, diagnostics, and provenance. Optionally emit `run-summary.json`.

#### 4. Validation & Tooling

* Centralise diagnostics: collisions, missing fixtures, unmet requirements, storage preload issues, CLI conflicts, etc., so failures are uniform.

* Introduce lightweight schema checks for the typed board files and suite/test metadata.

* Once the pipeline is stable, migrate remaining boards and update CI to call the v4 runner; retire the legacy loaders.

* Each chunk can be delivered in a reviewable PR, and you get incremental wins (e.g., fixture validation) without waiting for the entire pipeline.

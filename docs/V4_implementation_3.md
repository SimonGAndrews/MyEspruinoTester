# V4 implementation phase 3

## Phase Plan

- **Load & Merge Layers** – ✅ already implemented during phase 2 burn-in
  - Session defaults (`EspruinoTools/configDefaults.json`) load once and seed `config.cli` / `config.loader` (see `SESSION_DEFAULTS` merge in `scripts/run-tests-gordonV4.js:423`)
  - Board fixture/CLI overlays continue to merge via `mergeConfig`/`board:…` provenance entries
  - Suite `testConfig.json` overlays normalised through `loadSuiteConfig` and merged per suite during execution
  - Per-test JSON headers parsed by `parseTestMetadata` feed loader/CLI/fixture fields, including timeout/delay/storage metadata
  - Provenance recorded for every merge step (session defaults, board, suite, test, CLI overrides) and surfaced in runner metadata

- **Resolve Suites & Fixtures** – ✅ covered during phase 2
  - `resolveSuiteTests` now honours `execution.order`; fixture layers merge board → suite → test → CLI (`cliLayer.fixture`) before upload
  - Fixture requirements and requirement tags are gathered via `gatherFixtureRequirements` / `gatherRequirements`, deduped with `Set`, and missing fixtures emit diagnostics plus hard FAIL status
  - Runner metadata persists `requiredFixtures`, merged `requirements`, and final pass/fail outcome for each test

- **Execution Controls & CLI Surface** – ▶️ code paths implemented, hardware burn-in still flaky
  - Honour timeoutMs, preUploadDelayMs, postUploadDelayMs when scheduling uploads
  - Implement storagePreload descriptors (stage files, emit logs, list artefacts)
  - Expand CLI surface (--pre-cli-delay, --post-cli-delay, --no-reset, etc.) and map to config branches + provenance
  - Emit run-summary.json summarising per-suite results and diagnostics
  - _Status_: feature work landed (pre/post delays, storage preload runner, CLI overrides, metadata/run-summary). Repeated device runs occasionally hit Espruino CLI `FIFO_FULL` errors when suite-level preUploadDelayMs > 0; needs follow-up before marking complete.

- **Diagnostics & Tooling**
  - Centralise diagnostics collection/logging for fixture, CLI, loader checks
  - Add lightweight schema validation for board, suite, and test metadata
  - Lay out the board-migration + CI adoption steps once feature-complete
  - _Status_: fixture validations produce structured diagnostics already, but broader CLI/loader checks still inline; schema validation and board-migration tooling remain TODO.

## Changes  _(Summarise commits/edits as you make them. Keep bullet points short and reference key files/paths.)_

### Execution Controls & CLI Surface

- Runner now honours per‑test timeoutMs, preUploadDelayMs, and postUploadDelayMs when scheduling uploads, while allowing CLI overrides (--pre-cli-delay, --post-cli-delay, --no-reset) that feed into the merged config and provenance.
- Implemented Storage preload support: suite/test metadata storagePreload entries stage files through a dedicated CLI pass, capture stdout/stderr under `logs/<test>.storage.*`, and record the exact preload command plus a storagePreloadApplied flag in runner metadata.
- Each run now emits `results/<stamp>/<board>/run-summary.json` with per‑suite totals and the CLI arguments used.

In Detail:

- `scripts/run-tests-gordonV4.js`
  - Added helper utilities (`normaliseDelay`, `runStoragePreload`, `resolveBoardArg`, `formatConfigValue`) and refactored run loop to apply pre/post upload delays per test, respect CLI overrides, and capture provenance-friendly config updates.
  - Introduced Storage preload pipeline: resolves suite/test descriptors to temp files, shells out to Espruino CLI with `--storage`, records logs (`*.storage.(stdout|stderr)`), and surfaces the CLI command + artefacts in runner metadata.
  - Extended CLI parsing to support `--pre-cli-delay`, `--post-cli-delay`, `--no-reset`, keeping overrides in provenance while pushing `RESET_BEFORE_SEND=false` for no-reset flows.
  - Ensured metadata captures storage state (`storagePreloadApplied`, `storageCliCommand`, storage log paths) and added `run-summary.json` per run with totals and suite roll-ups.
  - Added connection-error detection so port failures lead to explicit diagnostics/reason instead of silent `no_result` failures.

- `tests/flash-storage/` (new suite)
  - `test_write_module.js`, `test_use_module.js`, and `testConfig.json` validate Storage persistence across a no-reset boundary; README documents intent and run command.
- `boards/ESP32C3/board.json` now exposes `flash-storage` in the available suite list.

- `docs/v4_metadata.md`
  - (earlier) Documented missing fixture requirements as hard FAILs; no further schema changes required for this slice.

## Tests & Results

_(Record each manual/automated run: command, purpose, outcome, and any notable artefacts or follow-up actions.)_

- `node scripts/run-tests-gordonV4.js --board ESP32C3 --port /dev/ttyACM0 --suites javascript-core --quiet --pre-cli-delay 0` (20251010-055844) – All tests pass; new `results/.../run-summary.json` emitted, metadata shows filtered CLI config and `storagePreloadApplied=false` for tests without staged files.
- `node scripts/run-tests-gordonV4.js --board ESP32C3 --port /dev/ttyACM0 --suites javascript-core --quiet` (multiple timestamps) – Reproducible `FIFO_FULL`/`no_result` failures once suite-level `preUploadDelayMs=1500` kicks in. CLI output lacks the JSON sentinel, causing harness FAIL despite device printing `PASS`. Needs investigation (see Open Questions).
- Storage preload exercise: temporarily added
  ```json
  "storagePreload": [{ "filename": "storage_preload.txt", "contents": "phase3" }]
  ```
  to `tests/javascript-core/test_store_cli_config.js` header and ran `node scripts/run-tests-gordonV4.js --board ESP32C3 --port /dev/ttyACM0 --suites javascript-core --quiet --pre-cli-delay 0` (results/20251010-060020). Metadata records `storagePreloadApplied=true`, `storageCliCommand`, and storage logs (`logs/test_store_cli_config.js.storage.*`). CLI stub populates Storage successfully.
- CLI overrides: `node scripts/run-tests-gordonV4.js ... --pre-cli-delay 0 --no-reset` (results/20251010-060147) – metadata shows `loader.noReset=true` and `cli.RESET_BEFORE_SEND=false`. Uploads become unstable (`FIFO_FULL`, syntax errors) without reset; likely requires device-specific tuning but proves override wiring.
- Flash storage suite: `node scripts/run-tests-gordonV4.js --board ESP32C3 --port /dev/ttyACM0 --suites flash-storage --quiet --pre-cli-delay 0` (results/20251010-181145) – exercises module write/read/no-reset and the new storagePreload helper. All three tests pass; metadata shows `storagePreloadApplied=true`, CLI commands for both preload and main uploads, and storage logs under `logs/test_preload_module.js.storage.*`.
  - Combined run: `flash-storage,javascript-core` with `--pre-cli-delay 0` (results/20251010-183412) confirmed multi-suite sequencing; only failure was the known FIFO_FULL hiccup in `test_abstract_comparison.js`.
  - Added RAM persistence sanity check: `test_ram_state_first.js` and `test_ram_state_second.js` (results/20251010-182026) confirm `noReset` uploads retain global state across consecutive runs.
- `node scripts/run-tests-gordonV4.js --board ESP32C3 --port /dev/ttyACM1 --suites flash-storage --quiet --pre-cli-delay 0` (results/20251010-175721) – board intermittently fails to reconnect; harness now surfaces `Connection error: Unable to connect to /dev/ttyACM1` in console, diagnostics, and per-test metadata instead of the ambiguous `no_result`.

## Open Questions / Follow-ups

_(Log outstanding decisions, spec clarifications, or cleanup tasks so nothing is lost between sessions.)_

- Persistent `FIFO_FULL` / missing JSON sentinel when suite-level `preUploadDelayMs` is non-zero. Need to debug whether delay should occur after CLI spawn (vs before), throttle settings, or device reset behaviour.
- Flash-storage suite: verify module write/read once hardware stabilises; confirm whether dropping `.js` suffix eliminates `require` failures.
- Harden storage preload error handling (propagate diagnostics when CLI fails, consider retries) and ensure logs are flushed even when `writeLogs=false`.
- Formalise CLI surface docs (`--post-cli-delay`, `--no-reset`, `--pre-cli-delay`) in `docs/test-runner-cli-guide.md` once behaviour is stabilised.
- Explore port failover: runner currently surfaces connection errors but still attempts only the first resolved port; need follow-up to iterate across `config.cli.ports` when available.
- , tighten diagnostics around storage/CLI errors, and mirror the new CLI surface in the runner CLI guide.

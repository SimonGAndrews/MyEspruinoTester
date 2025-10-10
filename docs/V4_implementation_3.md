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

- **Execution Controls & CLI Surface**
  - Honour timeoutMs, preUploadDelayMs, postUploadDelayMs when scheduling uploads
  - Implement storagePreload descriptors (stage files, emit logs, list artefacts)
  - Expand CLI surface (--pre-cli-delay, --post-cli-delay, --no-reset, etc.) and map to config branches + provenance
  - Emit run-summary.json summarising per-suite results and diagnostics
  - _Status_: timeout/pre-delay metadata is merged into `config.loader`, but not yet used to drive scheduling; storage preload handling, extended CLI flags, and run summary emission remain outstanding.

- **Diagnostics & Tooling**
  - Centralise diagnostics collection/logging for fixture, CLI, loader checks
  - Add lightweight schema validation for board, suite, and test metadata
  - Lay out the board-migration + CI adoption steps once feature-complete
  - _Status_: fixture validations produce structured diagnostics already, but broader CLI/loader checks still inline; schema validation and board-migration tooling remain TODO.

## Changes

_(Summarise commits/edits as you make them. Keep bullet points short and reference key files/paths.)_

## Tests & Results

_(Record each manual/automated run: command, purpose, outcome, and any notable artefacts or follow-up actions.)_

## Open Questions / Follow-ups

_(Log outstanding decisions, spec clarifications, or cleanup tasks so nothing is lost between sessions.)_

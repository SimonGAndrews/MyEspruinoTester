# V4 implementation phase 4

_Continuation of the v4 test harness build-out. Use this document to track new scope for phase 4, capture significant edits, and log validation runs._

## Status Snapshot (November 2025)

- Branch `V5` is the working baseline; it includes Gordon’s serial debug improvements and reverts the unsuccessful MDBT42Q upload tweaks.
- MDBT42Q bring-up is still pending. Consult `docs/issues/MDBT42Q_harness_upload_issue.md` before attempting new fixes, and use branch `mdbt42q-experiments` for reference code from the previous investigation.
- Wrapper/test behaviour matches the guidance in `docs/test-writing-guide.md`; any future wrapper changes should be reflected there.

## Phase Plan

- **Harness Stability**
  - Tackle the outstanding `FIFO_FULL` / missing sentinel behaviour when pre-upload delays are non-zero.
  - Improve connection failover/retries across multiple serial candidates.
- **Board Enablement**
  - Finalise MDBT42Q bring-up and extend coverage to additional nRF52 boards as needed.
  - Document flashing and fixture expectations for every newly added board profile.
- **Suite Expansion**
  - Stand up BLE-focused suites for MDBT42Q (and siblings), covering storage, CLI overrides, and harness plumbing.
  - Backfill regression suites that exercise storage preload and provenance reporting end-to-end.
- **Documentation & Tooling**
  - Fold new CLI behaviours into `docs/test-runner-cli-guide.md` and expand `docs/test-harness-architecture.md`.
  - Begin lightweight schema validation prototypes for board/suite/test metadata.

_Update bullets as tasks are completed or reprioritised._

## Changes  _(Summarise commits/edits as you make them. Keep bullet points short and reference key files/paths.)_

- Added `boards/PICO_R1_3/cli.json` to disable legacy resets, keep BLE scans off, enforce deterministic uploads (RESET_BEFORE_SEND=false, SAVE_ON_SEND=0, SET_TIME_ON_WRITE=false), and advertise Pico USB CDC port globs.
- Harness now honours `cli.sleepAfterUploadMs` (`scripts/run-tests-gordonV4.js`), automatically adding `--sleep` when present so boards can hold the Espruino CLI connection open for wrapper output.
- MDBT42Q metadata sets `sleepAfterUploadMs=9000` (`boards/MDBT42Q/cli.json`) to keep the serial link alive long enough for guard tests to emit their JSON result.

## Tests & Results

_(Record each manual/automated run: command, purpose, outcome, and any notable artefacts or follow-up actions.)_

- `node scripts/run-tests-gordonV4.js --board MDBT42Q --port /dev/ttyUSB0 --suites demo/getStarted --serial-debug` (20251105-201634) – Wrapper JSON captured without fallback; four passes, one intentional guard fail, and the missing LED test now reports `skip` with reason logged.

## Open Questions / Follow-ups

_(Log outstanding decisions, spec clarifications, or cleanup tasks so nothing is lost between sessions.)_

- _Carry over unresolved items from phase 3 once triaged._
- Track MDBT42Q upload/result capture issue via `docs/issues/MDBT42Q_harness_upload_issue.md`; resolve there before re-enabling the board in automated runs.

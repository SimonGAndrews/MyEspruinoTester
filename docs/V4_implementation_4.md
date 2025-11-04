# V4 implementation phase 4

_Continuation of the v4 test harness build-out. Use this document to track new scope for phase 4, capture significant edits, and log validation runs._

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

## Tests & Results

_(Record each manual/automated run: command, purpose, outcome, and any notable artefacts or follow-up actions.)_

- _None recorded yet._

## Open Questions / Follow-ups

_(Log outstanding decisions, spec clarifications, or cleanup tasks so nothing is lost between sessions.)_

- _Carry over unresolved items from phase 3 once triaged._

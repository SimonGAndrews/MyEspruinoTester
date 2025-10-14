# Test Harness Architecture (Outline)

_Work in progress. This document will capture the technical details of the v4 test harness so the test-writing guide can stay beginner friendly._

## 1. Overview
- Goals of the harness
- High-level workflow (discovery → wrapping → execution → artefacts)

## 2. Discovery Pipeline
- Suite registration (`board.json`, `testConfig.json`)
- `resolveSuiteTests` flow (execution order, manifest fallback)
- Handling of grouping directories (e.g., `tests/demo/getStarted`)

## 3. Wrapper Anatomy
- Prologue injections (helpers, fixtures, guard variables)
- Heartbeat, timeout, and result polling
- Relationship between helpers (`__pass`, etc.) and the final JSON payload

## 4. Merge Layers
- Session defaults (`configDefaults.json`)
- Board metadata (`board.json`, `fixture.json`, `cli.json`)
- Suite metadata (`testConfig.json`)
- Per-test metadata (`/* JSON { ... } */`)
- CLI overrides (command-line flags)
- Provenance tracking

## 5. Execution & CLI Interaction
- Pre/post delays
- Storage preload flow
- Handling `SAVE_ON_SEND`, `RESET_BEFORE_SEND`, `--config` pairs
- Error paths (device busy, no_result, invalid JSON)

## 6. Artefacts
- `runner-metadata/<test>.json`
- `sources/<test>.js`
- `<suite>.json`
- `run-summary.json`
- Logs (`.stdout`, `.stderr`, storage logs)

## 7. Future Considerations
- Flash-based wrapper mode
- Assertion helpers
- Additional CLI/sandbox scenarios


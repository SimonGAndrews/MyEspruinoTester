# Espruino Test Harness v5 – Feature Spec (WIP)

This document continues the v4 metadata work captured in `docs/v4_metadata.md`. With the baseline layering and artefact model in place, `v5` tracks incremental features that extend the harness, CLI surfaces, and supporting tooling as development continues. Each section records the requirement, proposed approach, and current implementation status.

## 1. Serial Debug Logging Toggle

- **Requirement:** During deep-dive debugging (especially when investigating CLI/hardware timing issues), developers need to see Gordon’s low-level serial send/receive traces without editing the harness or EspruinoTools manually.
- **Approach:** Expose a harness CLI flag (`--serial-debug`) that invokes `Espruino.Core.Serial.debug()` before warm-up. This leverages the upstream logging gate added in EspruinoTools commit `299ef9d` (log level toggle) without changing metadata. When the flag is provided, the harness prints a confirmation (unless `--quiet` is set).
- **Implementation:**
  - Added argument parsing and documentation in `scripts/run-tests-gordonV4.js` (see `git blame` around the new flag).
  - Usage example: `node scripts/run-tests-gordonV4.js --board PICO_R1_3 --port /dev/ttyACM0 --suites demo/getStarted --serial-debug`.
  - No changes were made to metadata or legacy runners; this remains an on-demand troubleshooting tool.
  - Docs updated in `docs/test-runner-cli-guide.md` under the v4 runner section.

(Additional v5 features will be recorded in subsequent sections as they are designed and implemented.)

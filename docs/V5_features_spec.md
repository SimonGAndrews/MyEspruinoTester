# Espruino Test Harness v5 – Feature Spec (WIP)

This document continues the v4 metadata work captured in `docs/v4_metadata.md`. With the baseline layering and artefact model in place, `v5` tracks incremental features that extend the harness, CLI surfaces, and supporting tooling as development continues. Each section records the requirement, proposed approach, and current implementation status.

(Additional v5 features will be recorded here as they are designed and implemented.)

## 1. Serial Debug Logging Toggle (Implemented in branch V5)

- **Requirement:** During deep-dive debugging (especially when investigating CLI/hardware timing issues), developers need to see Gordon’s low-level serial send/receive traces without editing the harness or EspruinoTools manually.
- **Approach:** Expose a harness CLI flag (`--serial-debug`) that invokes `Espruino.Core.Serial.debug()` before warm-up. This leverages the upstream logging gate added in EspruinoTools commit `299ef9d` (log level toggle) without changing metadata. When the flag is provided, the harness prints a confirmation (unless `--quiet` is set).
- **Implementation:**
  - Added argument parsing and documentation in `scripts/run-tests-gordonV4.js` (see `git blame` around the new flag).
  - Usage example: `node scripts/run-tests-gordonV4.js --board PICO_R1_3 --port /dev/ttyACM0 --suites demo/getStarted --serial-debug`.
  - No changes were made to metadata or legacy runners; this remains an on-demand troubleshooting tool.
  - Docs updated in `docs/test-runner-cli-guide.md` under the v4 runner section.

## 2. Heartbeat – Potential Requirement

- **Background:** Earlier harness iterations emitted periodic keep-alive prints from the wrapper to stop the Espruino CLI from timing out during long tests. V4 removed this heartbeat because board-specific sleep delays now keep the CLI connection open while wrapper JSON is emitted.
- **Pros if reintroduced:**  
  - Keeps idle-prone CLI sessions alive on hardware/serial stacks that still drop silent connections.  
  - Provides an obvious signal when the device crashes or stalls (no further heartbeat).  
  - Reassures developers during long waits that the wrapper is still running.
- **Cons:**  
  - Adds noisy console/log output, making results harder to scan.  
  - Extra wrapper complexity (timers, teardown) that could skew duration measurements or introduce race conditions.  
  - Potential to interfere with tests that expect exclusive control of timers/console output.  
  - Current sleep-delay handling already addresses the primary timeout issue for MDBT42Q-class boards.
- **Next steps:** Keep monitoring real hardware runs. If certain boards or adapters still suffer from mid-run disconnects, revisit a configurable heartbeat (e.g., enabled via board metadata). Until then, prefer the simpler wrapper.

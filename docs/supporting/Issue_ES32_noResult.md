# ESP32 `no_result` investigation

## Symptoms

- Every Gordon-runner test on ESP32 finished with `FAIL (no_result)` even though the same scripts passed on ESP32C3 and in the Web IDE.
- CLI logs showed the banner and “Upload Complete,” immediately followed by EspruinoTools’ shutdown `TypeError`. No keep-alive prints or `{"__espruino_test__":…}` payloads were ever captured, so the harness aborted the run.

## Root cause

- ESP32 firmware exposes its REPL on `/dev/ttyUSB0` at 115200 baud. The CLI defaults to 9600 baud unless told otherwise, so uploads ran at the wrong speed and all prompt/output bytes were effectively lost.

## Experiments (chronological)

1. Added extra blank line to the test wrapper → no change.
2. Firmware tweaks (prompt injection, console flush, flow-control adjustments) → still required manual Enter to see `>`.
3. Stretched CLI prompt timeout and inspected serial traffic → board only responded after host activity, confirming handshake mismatch rather than firmware crash.
4. Forced CLI baud manually with `--config BAUD_RATE=115200` → prompt and JSON payload appeared immediately. This exposed the real issue: mismatched baud.

## Resolution

- Harness now inherits the preferred baud from `manifest.ports.baud` for every test run. Both runners append `--config BAUD_RATE=<value>` automatically, so ESP32 CLI sessions operate at 115200 by default.
- Per-test metadata no longer needs to carry manual baud overrides; default CLI args start from the manifest and are merged with test hints.

## Outcome

- `tests/runner-metadata` now pass on stock ESP32 firmware (see `results/20251001-190535/ESP32`).
- ESP32 test harness is usable again; CLI receives prompts and result payloads on every invocation.

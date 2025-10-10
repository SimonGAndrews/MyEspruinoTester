# Flash Storage Suite

This suite verifies that helper modules written to Espruino Storage persist across uploads and can be consumed without resetting the device between tests.

Tests run in order:

1. `test_write_module.js` – erases any previous artefact, writes `phase3_helper.js`, and confirms `require("phase3_helper")` exposes `double()`.
2. `test_use_module.js` – runs with `noReset` metadata, loads the stored module, and checks it still returns the expected value.

Run the suite with:

```bash
node scripts/run-tests-gordonV4.js --board ESP32C3 --port /dev/ttyACM0 --suites flash-storage --quiet --pre-cli-delay 0
```

Optionally add `--no-reset` to exercise CLI overrides; the second test already requests `RESET_BEFORE_SEND=false`.

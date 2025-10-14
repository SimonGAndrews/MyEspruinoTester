# Demo suite (getStarted)

This suite showcases core harness features without relying on device-specific hardware. Each test uses the `__pass/__fail/__skip` helpers.

1. **test_sync_basic.js** – Synchronous happy path (no metadata, simple `try/catch`).
2. **test_async_example.js** – Minimal async completion: schedules a short timeout and reports success.
3. **test_timeout_guard.js** – Illustrates a guard timeout pattern; if the async work never finishes, the test fails with a readable reason.
4. **test_fixture_usage.js** – Reads fixture data seeded via `testConfig.json` (`demo.message`, `demo.number`).
5. **test_skip_on_missing_led.js** – Demonstrates skipping: looks for `demo.ledPin` in the fixture, skips when absent.
6. **test_metadata_led_override.js** – Adds `demo.ledPin` via per-test metadata so the LED check passes.

Add more examples (metadata overrides, storage preload, etc.) as needed.

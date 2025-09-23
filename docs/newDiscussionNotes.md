Continuation of Espruino Test Harness Development - 3 WIFI tests (cont). 
This conversation is a continuation of the discussion 'Continuation of Espruino Test Harness Development - 2 WIFI tests. This conversation is a continuation (previous conversati'  whcih has had to be abandoined due to the Error 'stream disconnected before completion: Your input exceeds the context window of this model. Please adjust your input and try again.'   and is no longer usable.

The objective is to continue with the development of an Espruino test Harness as described in local docs
/home/simon/Espruino/MyEspruinoTester01/docs/baseline-requirements.md, docs/cli-guide.md, docs/manifest-reference.md. The current task is to complete a set of test suites for the ESP32 family wifi functionality as described in docs/TestPlan_Wifi.md.

After a number of deelopment (see /scripts/*.js ) we are seeking to bring the design and implmementation in line with that originally designed and used in this repository within index.js .  This was the original approach designed for this test harness aby the Espruino developer Gordn Williams.  This current development is executteds with 

node scripts/run-tests-gordon.js   --board ESP32C3   --port /dev/ttyACM0   --suites wifi-core 

This approach has been proved, and is broadly operational with:

node scripts/run-tests-gordon.js   --board ESP32C3   --port /dev/ttyACM0   --suites wifi-core 

but is still proving problemmatic testing the wifi components .  The errors being tests returning 'results.status' as fail because of no results.  We are in the middle of debuggin this when the previous dioscussion became unusable.  The error seem to be bound up with the espruino CLI execution of the scripts.  Hence the re-focus on use of Gordons approach as it should be sound. 

The development of the new approach is still WIP and not all of the functionality tried in the other versions has been ported to run-tests-gordon.js  as of yet.  

Some of the key points in the previous conversdation are:

- The requirements doc was updated prior to starting on the 'Gordon version'  so current status and gaps are not accurate.

 - scripts/run-tests.js:10-162 now accepts --fixtures/-f, loads JSON (see configs/fixtures.example.json:1) and injects it as global.ESPRUINO_WIFI_FIXTURES for every test; station-suite timeouts were bumped to 30 s so connects have room to succeed.
 
 - tests/wifi-station/test_connect_get_ip.js:1 now resets the Wi‑Fi state, connects using credentials from global.ESPRUINO_WIFI_FIXTURES, and waits for a real IP (with cleanup on failure/success).

 - tests/wifi-station/test_scan_for_fixture.js:1 now scans repeatedly for the fixture SSID/BSSID (with configurable attempts/intervals) before any connection logic runs, skipping cleanly when fixtures are absent.

and more recently with run-tests-gordon.js:

- Set up a “Gordon-style” baseline that bypasses all Wi-Fi complexity so we can validate the harness end to end:

Added a tiny async test suite at tests/basicAsync/test_async_example.js.
Updated boards/ESP32C3.json and lib/tests.js so basicAsync is a recognised suite.
Built scripts/run-tests-gordon.js, a lean runner that shells out to the espruino CLI for each test (just like the original index.js flow), wraps test sources in a simple result harness, and reports PASS/FAIL/SKIP. No fixtures, no Wi-Fi modules required.
You can try it straight away:

node scripts/run-tests-gordon.js \
  --board ESP32C3 \
  --port /dev/ttyACM0 \
  --suites basicAsync
You should see:

Test Run Summary
================
Board:    ESP32C3
...
Tests:    test_async_example.js
Running test_async_example.js ... PASS

Results: 1 passed, 0 failed, 0 skipped
That gives us a clean baseline for the harness. Once you’re happy with this approach, we can start layering the Wi-Fi tests back on, knowing the underlying runner works.

- We built a minimal “Gordon-style” harness and confirmed it runs our basicAsync test end-to-end. The harness shells out to the espruino CLI just like Gordon’s original index.js, and definitely lets us evaluate PASS/FAIL/SKIP without any Wi-Fi side effects.

- original Wi‑Fi tests still returned simple booleans, so any crash left the harness with no_result. I just updated the suite so each test now wraps its logic in an IIFE and assigns a structured object to result:

tests/wifi-core/test_module_presence.js
tests/wifi-core/test_api_methods.js
tests/wifi-core/test_scan_callback.js

Each test now sets something like { status:'pass', pass:true }, { status:'fail', pass:false, reason:'...' }, or { status:'skip', pass:false, reason:'...' }. That won’t stop the underlying crash (the board still reboots before completion), but once the Wi‑Fi code stabilises the harness will report PASS/FAIL/SKIP cleanly instead of timing out. Let me know when you want to dig into the crash itself—we can do that interactively in the REPL next.

- The important bit is the “PASS” at the end: the async test actually ran and reported success, so the new harness is doing its job.

The noise above it comes from the Espruino CLI itself as it boots and tries to initialise optional transports (BLE, HID). Because your host doesn’t have a BLE adapter, those modules throw ENODEV and the CLI ends up hitting a bug in getPortPath after the script has already completed. It doesn’t affect the test outcome—Espruino has already printed the PASS line before the CLI logs that stack trace.

If you want to quiet it down you can try running with the CLI flag --no-ble (or set export ESPR_DISABLE_BLE=1), which stops EspruinoTools from initialising the BLE stack. But from a harness perspective we’ve got a working baseline: basicAsync executes cleanly and returns PASS. That gives us a safe starting point to start layering the Wi-Fi tests back in.

- The Gordon-style runner now prints where it saved the test sources and logs at the end of each run:

Saved test sources to …
Saved logs to …
For example, after a run you’ll see entries like:

results/20250921-141742/ESP32C3/
  ├─ basicAsync.json
  ├─ logs/
  └─ sources/

This way every test execution—quiet mode included—captures its inputs and CLI output under the timestamped results directory.
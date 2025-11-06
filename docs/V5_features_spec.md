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

## 3. Host Test Service (HTS) – Proposal

- **Requirement:** Some scenarios require the host machine to participate in the test (HTTP listener for clients on the DUT, echo servers, mock BLE gateways, etc.). Today those flows are handled manually. We need a first-class way to launch a cooperating Node.js helper alongside a suite/test so on-device code can exercise host-bound interactions.

- **Terminology:**  
  - *Host Test Service (HTS)* – a Node program (JS file/module) that runs on the host for the duration of a suite or single test.  
  - *Suite HTS / Test HTS* – metadata entries pointing to the service to launch before a suite starts or before an individual test executes.

- **Proposed flow:**
  1. Metadata (`testConfig.json` or per-test `/* JSON */`) gains `hostTestService` fields, e.g.:
     ```json
     {
       "hostTestService": {
         "name": "http-listener",
         "script": "host-services/http-listener.js",
         "env": { "PORT": 8080 },
         "fixtures": { "wifi.hostServer": "http://127.0.0.1:8080" }
       }
     }
     ```
  2. Runner resolves the script path, spawns the service before executing the suite/test, and tears it down afterwards (or when the test finishes). CLI logs capture HTS stdout/stderr (under `logs/<test>.hts.*`).
  3. Fixture data bridges DUT ↔ host — either supplied statically in metadata (`fixtures.wifi.hostServer`) or emitted dynamically by the HTS (e.g., printing a JSON blob prefixed with `__HTS_FIXTURES__` on stdout). Tests read those fixtures via `global.ESPRUINO_FIXTURES`.
  4. The on-device script and HTS agree on a protocol (HTTP, serial echo, etc.). The harness’s responsibility is limited to orchestration (launch, monitor, fixture merge, teardown).

- **Responsibilities:**
  - *HTS author* ensures the host program:  
    - Emits readiness information (`__HTS_READY__`) so the harness knows when it can start the DUT upload.  
    - Produces optional `__HTS_FIXTURES__` JSON before the ready sentinel so the DUT can consume dynamic configuration.  
    - Cleans up resources on SIGTERM/SIGINT (the harness will terminate it after the suite/test).
  - *Device test author* consumes fixture data and talks to the HTS via the agreed protocol. Tests remain responsible for asserting pass/fail; if the runner injects `fixtures.hostService.<name>.error` (e.g., `hts_startup_failed`), the test should detect it and `__skip('Host test service unavailable: ...')`.
  - *Harness* orchestrates lifecycle (spawn → wait for ready → run test(s) → stop), surfaces HTS logs, merges any HTS-provided fixture overrides before uploading the DUT test, and injects `error` metadata when the HTS fails so tests can skip gracefully.

- **Fixture usage & readiness contract:**
  - Static configuration: metadata can define `fixtures.hostService` objects so both HTS and DUT know shared parameters (host IP, port, credentials).
  - Dynamic configuration: HTS prints `__HTS_FIXTURES__{...JSON...}` once it has chosen its runtime parameters (ports, tokens). Each line must contain valid JSON; the harness merges it into `config.fixture` (e.g., under `fixtures.hostService.http`).
  - Readiness sentinel: after emitting zero or more `__HTS_FIXTURES__` lines, the HTS must print `__HTS_READY__` to stdout. The harness waits up to `hostTestService.startupTimeoutMs` (default 5000 ms) for this sentinel; absence results in an `hts_startup_timeout` failure, with HTS stdout/stderr attached to diagnostics.
  - **Schema/merging rules:**  
    - Each `__HTS_FIXTURES__` payload must be a JSON object.  
    - The harness namespaces the payload under `fixtures.hostService.<htsName>` (where `<htsName>` is the `hostTestService.name`). Existing metadata fixtures for that HTS are deep-merged with HTS-provided values (HTS data wins).  
    - Payloads may contain a special `global` object if the HTS needs to publish fixtures outside its namespace; those keys are merged into the root `config.fixture`. This should be used sparingly to avoid collisions.  
    - Values must be JSON primitives/arrays/objects (no functions); invalid JSON or unsupported types cause `hts_fixture_error`.

- **Reusable HTS modules:** Host services should be reusable scripts parameterised by env vars/fixtures so multiple tests can share the same implementation (e.g., `host-services/http-server.js`, `host-services/serial-echo.js`). Metadata supplies the per-test overrides.

- **Example: HTTP server for DUT HTTP client**
  - Metadata:
    ```json
    {
      "hostTestService": {
        "name": "http-server",
        "script": "host-services/http-server.js",
        "env": {
          "HTS_EXPECTED_PATH": "/probe",
          "HTS_RESPONSE": "{\"ok\":true}"
        }
      }
    }
    ```
  - HTS behaviour: start an HTTP server (optionally on an ephemeral port), log requests, and emit `__HTS_FIXTURES__{"http":{"host":"127.0.0.1","port":43125,"path":"/probe"}}` followed by `__HTS_READY__`.
  - DUT test reads `global.ESPRUINO_FIXTURES.http`, issues `http.get` to `host:port/path`, and calls `__pass` once it gets the expected response.

- **Example: Host polling service for AP verification**
  - Metadata points to `host-services/http-client.js` with env `{ "HTS_POLL_URL": "http://192.168.4.1/status", "HTS_TIMEOUT_MS": 8000 }`.
  - HTS repeatedly issues HTTP requests to the DUT AP endpoint, logging whether it receives a response.
  - Fixtures include any data the DUT needs (e.g., credentials to serve). The DUT test monitors for host requests (e.g., via `wifi.on('server', ...)`) and declares PASS when a poll arrives within the timeout.
  - HTS itself does not mark tests pass/fail; it simply supports the DUT by performing the agreed polling.

- **Open questions / TODOs:**
  1. **Readiness contract:** Implement sentinel-based startup with the timeout/spec above (ensure failure diagnostics include HTS logs).
  2. **Lifecycle scope:** Only one HTS runs at a time. If a suite-level HTS is defined it stays alive for the whole suite and per-test HTS entries are rejected (fail-fast validation). Tests without their own HTS inherit the suite HTS; tests that need bespoke host helpers should run in suites with no suite HTS configured.
  3. **Failure semantics:** On HTS startup failure, harness injects `fixtures.hostService.<name>.error = 'hts_startup_failed'` (with optional message) and still runs the DUT test so it can `__skip`. Consider a future `mandatory: true` flag to hard-fail instead of skip.
  4. **Fixture schema:** Implement the namespacing/merge rules above (hostService namespace + optional `global`) and add validation errors (`hts_fixture_error`) when payloads are invalid.
  5. **Resource cleanup:** Ensure HTS processes are terminated if the harness aborts mid-suite and their logs are archived consistently.
  6. **Security / isolation:** Decide whether HTS scripts are restricted to repo-tracked files and whether external dependencies are allowed.

Once these items are agreed, we can extend the metadata schema and runner to spawn HTS processes and pipe their logs/fixtures into the standard artefact set.

## Notes 

(1) SIGTERM/SIGINT are the standard Unix signals the OS uses to ask a process to exit:

  SIGINT (“interrupt”) is what you get when someone hits Ctrl+C in the terminal. It’s intended as a polite “please stop now” so the program can clean up before exiting.
  SIGTERM (“terminate”) is a more general shutdown request sent programmatically (kill <pid> with no signal specified). Processes can catch it to perform cleanup, but if they ignore it the caller may escalate to SIGKILL (which cannot be trapped).

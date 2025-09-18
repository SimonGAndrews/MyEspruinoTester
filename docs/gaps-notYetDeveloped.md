# Outstanding gaps

Here are the outstanding gaps relative to the documented requirements in docs/baseline-requirements.md:

## Suite Registry

The spec references a central tests/suites.json describing suite metadata/compatibility. We still hard-code discovery in lib/tests.js; no standalone suite registry exists.

## Fixtures & Lab Config

Manifests expose a fixtures block, but the runtime doesn’t consume it. There’s no configs/<hostname>.json or fixture-driven skipping/parameterisation.

## Result Granularity & Metadata

Requirements call for per-test JSON under results/<date>/<board>/<suite>/<testId>.json with firmware size, metrics, logs. Current runner writes a single suite-level JSON with pass/fail + duration only; no firmware metadata or log excerpts.

## Diffing / Comparison CLI

Planned --compare node esp32 --suite ... command to highlight discrepancies across targets isn’t implemented. We have a Node baseline runner, but no automated comparison or reporting step.

## Verbose/Minify CLI Flags

The orchestration section mentions flags for verbose traces and minification; none of the CLI scripts currently expose or honour these options.

## Scheduler / Multi-board Support

Document suggests a scheduler queuing multiple boards sequentially. All scripts still operate on a single board per invocation.

## Node Baseline Integration

While run-node-baseline.js exists, it doesn’t persist results, honour fixture overrides, or compare Node vs device runs automatically.

## Dashboard / Aggregation Hook

Future dashboard integration is anticipated. Beyond writing suite JSON, there’s no aggregated metrics endpoint or pipeline.

## Documentation Clean-up

Some legacy references (e.g., to a shared tests/common.js, [TEST] PASS/FAIL) remain in docs though the runner now uses injected wrappers and global result.

## Suite Skipping for Missing Modules

Troubleshooting notes suggest skipping suites when modules are unavailable; the runner currently attempts all requested tests and leaves it to individual tests to flag failures.

Addressing these will bring implementation into full alignment with the documented requirements.
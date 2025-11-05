# Migration or Not?

This note summarises how the Espruino test tooling consumes board manifests today and what we would have to touch if we migrate to a different manifest layout (for example, merging `boards/<name>.json` with other metadata files).

## Current Usage

The existing loader always reads `boards/<name>.json` and the following entry points rely on that shape:

- `lib/manifest.js` (`1-142`) hardcodes the list/resolve/load helpers to that path and schema, including firmware helpers and suite resolution.
- `scripts/run-tests.js` (`136-276`) expects a parsed manifest plus the originating `manifestPath`; it assumes the `<name>.json` mapping when logging summaries.
- `scripts/run-tests-espruino.js` (`94-210`) mirrors the same access patterns (ports fallback, suites, upstream board ID) and logs the manifest path.
- `scripts/run-tests-gordon.js` (`510-706`) follows the same pattern while adding CLI delay/reset flags, fixture injection, and `manifest.localJSON`.
- `scripts/flash.js` (`131-213`) consumes `manifest.flash`, `manifest.firmware`, `manifest.ports`, and `manifest.suites` to select adapters, firmware bundles, and to print the manifest path.
- `scripts/dry-run.js` (`120-205`) and `scripts/run-node-baseline.js` (`95-169`) reuse `loadManifest` and rely on an identical schema/layout.
- Unit tests (`lib/__tests__/resolveSuiteTests.test.js:50-138`) stub suite manifests under `tests/<suite>/manifest.json`; schema changes will require fixture updates even though the board loader itself is not called directly.

## Manifest Fields Currently Read

- **Identification** — uses `manifest.board`/`manifest.upstream.id` when applying `--board` overrides (`scripts/run-tests-espruino.js:148`, `scripts/run-tests.js:161`).
- **Firmware & flash** — reads `manifest.firmware.pattern`, `manifest.firmware.artifacts`, `manifest.flash.type`, `manifest.flash.baud`, etc. (`scripts/flash.js:142-207`, `lib/manifest.js:99-135`).
- **Serial hints** — consumes `manifest.ports.serial` and `manifest.ports.baud` (`scripts/run-tests.js:146-232`, `scripts/flash.js:193-194`).
- **Suite metadata** — depends on `manifest.suites.available/default` (`lib/manifest.js:72-79`) to validate runner CLI flags.
- **Optional overrides** — honours `manifest.localJSON` for Espruino board substitutions (`scripts/run-tests.js:151-163`, mirrored in the Gordon runner); no other overlays exist today.
- **Fixtures pointer** — `manifest.fixtures` is present in JSON samples (e.g., `boards/ESP32.json:33-40`) but remains unused; future work could integrate it into the config pipeline.
- **Documentation** — existing docs (`docs/run-tests-gordon-summary.md:13`, `docs/supporting/V4_working_notes.md:52`, `docs/v4_metadata.md:11-120`) still describe the `boards/<name>.json` layout.

## Change Impact If Merging Files

- Update the loader (`listBoards`, `getManifestPath`, `loadManifest`) to understand the new layout, adjust error messaging, and support both locations during rollout.
- Patch every CLI entry point (`scripts/run-tests*.js`, `scripts/run-node-baseline.js`, `scripts/dry-run.js`, `scripts/flash.js`) so they resolve the new manifest path and handle any key moves.
- Preserve existing keys (`firmware`, `flash`, `ports`, `suites`, `upstream`, `localJSON`, `fixtures`) or provide a translation layer to avoid breaking downstream logic.
- Maintain relative path behaviour; `manifest.localJSON` currently resolves via `path.dirname(manifestPath)` (`scripts/run-tests.js:154`) and must keep working.
- Refresh fixtures and mocks to reflect the schema change and extend unit coverage to protect the migration.
- Align documentation once the final layout is chosen so contributors do not see conflicting guidance.

## Migration Considerations

- Ship a compatibility shim that prefers the new location but falls back to `boards/<name>.json` to keep CLIs working during transition.
- Decide how board overlays should behave post-merge—either retire them or recreate the layering inside the single manifest file, and document the precedence rules.
- Audit any downstream tooling (custom scripts, CI jobs) that might consume the manifest directly.
- Schedule documentation updates alongside the code rollout so the ecosystem stays in sync.

Let me know when you are ready to draft the migration plan or prototype loader changes.

# `run-tests-gordonV4` Metadata Merge Flow

```mermaid
flowchart TD
    A["Start run (CLI args parsed)"] --> B["Load session defaults (EspruinoTools/configDefaults.json)"]
    B --> C["Create base config (loader/cli/fixture)"]

    C --> D["Load board profile (boards/<board>/board.json)"]
    D --> E["Merge board.json into config.loader + config.board"]

    E --> F["Load optional fixture.json"]
    F --> G["Merge fixture.json into config.fixture"]

    G --> H["Load optional cli.json"]
    H --> I["Merge cli.json into config.cli + config.loader.ports"]

    I --> J["Resolve suites & load testConfig.json"]
    J --> K["Merge suite layer into config (loader/cli/fixture)"]

    K --> L["Parse per-test metadata (/* JSON */ block)"]
    L --> M["Merge test layer into config (loader/cli/fixture)"]

    M --> N["Apply CLI overrides (--fixtures, --pre-cli-delay, etc.)"]
    N --> O["Compute effective config per test"]
    O --> P["Write provenance + pass to runOneTest"]
```

This diagram complements `docs/run-tests-gordonV4_workflow.md`, showing how each metadata layer contributes to the final configuration before a test is executed.

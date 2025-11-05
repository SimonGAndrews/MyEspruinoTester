# `scripts/run-tests-gordonV4.js` Execution Flow

```mermaid
flowchart TD
    A["Start script"] --> B["Parse CLI arguments"]
    B --> C{"Arguments valid?"}
    C -- "No" --> Z["Print usage/error and exit"]
    C -- "Yes" --> D["Load session defaults & board profile"]
    D --> E["Resolve suites & load suite metadata"]
    E --> F["Discover suite tests"]
    F --> G["Prepare results directories"]
    G --> H["Initialise CLI helpers & counters"]
    H --> I{"More tests?"}
    I -- "No" --> Q["Write summaries (suite & run)"]
    I -- "Yes" --> J["Merge suite config & per-test metadata"]
    J --> K{"Storage preload entries?"}
    K -- "Yes" --> K1["Run storage preload via Espruino CLI"] --> L
    K -- "No" --> L
    L["Compose wrapped test with fixtures/context"] --> M["Spawn Espruino CLI (adds --sleep if metadata requests)"]
    M --> N{"Wrapper JSON seen?"}
    N -- "No" --> R["Mark test failed (no_result)"]
    N -- "Yes" --> O["Parse JSON record"]
    O --> P["Record pass/fail/skip, logs, metadata"]
    R --> P
    P --> H
    Q --> S{"Any failures?"}
    S -- "Yes" --> T["Exit with status 1"]
    S -- "No" --> U["Exit with status 0"]
```

This flow diagram mirrors the detailed steps in `docs/run-tests-gordonV4_workflow.md`, with the CLI sleep injection annotated at the execution stage.

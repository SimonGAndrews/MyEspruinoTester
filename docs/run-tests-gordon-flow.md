# `scripts/run-tests-gordon.js` Execution Flow

```mermaid
flowchart TD
    A[Start script] --> B[Parse CLI arguments]
    B --> C{Arguments valid?}
    C -- No --> Z[Print usage/error and exit]
    C -- Yes --> D[Load board manifest]
    D --> E[Resolve requested suites]
    E --> F[Discover suite tests]
    F --> G[Prepare output directories]
    G --> H[Initialize CLI & counters]
    H --> I{More tests?}
    I -- No --> Q[Write suite summaries]
    I -- Yes --> J[Read raw test source]
    J --> K[Wrap test with harness & fixtures]
    K --> L[Save wrapped source]
    L --> M[Send code via Espruino CLI]
    M --> N{CLI result line found?}
    N -- No --> R[Mark test failed (no result)]
    N -- Yes --> O[Parse JSON result]
    O --> P[Record pass/fail/skip and logs]
    R --> P
    P --> H
    Q --> S{Any failures?}
    S -- Yes --> T[Exit with status 1]
    S -- No --> U[Exit with status 0]
```

This flow chart summarizes the major execution stages handled by `scripts/run-tests-gordon.js` when coordinating Espruino test runs.

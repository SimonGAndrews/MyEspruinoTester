# Demo CLI overrides

Examples focusing on per-test CLI/loader overrides:

1. **test_storage_preload_demo.js** – Uses `loader.storagePreload` functionality to write the module `assets/demo_module.js` to flash and call the module function`sayHello`.
2. **test_flash_no_save.js** – Forces `SAVE_ON_SEND=0` (RAM only) and performs a simple operation.
3. **test_flash_execute.js** – Forces `SAVE_ON_SEND=1` (store to flash) and demonstrates a flag persisting across uploads.
4. **test_no_reset_first.js** – Runs with `RESET_BEFORE_SEND=false`/`noReset=true`, seeds `global.__demo_no_reset_flag`.
5. **test_no_reset_second.js** – Runs without reset and confirms the flag is still present.
6. **test_cli_args_demo.js** – Adds extra `cliArgs` (`--sleep 0.1`) and `espruinoConfig` (`STORE_LINE_NUMBERS=false`).
7. **test_loader_delays_demo.js** – Applies metadata-defined pre/post upload delays.
8. **test_port_override_demo.js** – Demonstrates per-test port lists (`cli.ports`); real selection still comes from the CLI `--port` flag.

Add more examples (custom CLI args, additional flash behaviours, etc.) as needed.

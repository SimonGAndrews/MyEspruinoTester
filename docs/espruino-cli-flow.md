# Espruino CLI upload flow (as used by `run-tests-gordon.js`)

This document traces what happens inside the Espruino command-line interface when `scripts/run-tests-gordon.js` executes it in the form `espruino --port <tty> --no-ble --board <id> <tempfile>`. The goal is to explain which subsystems run, how the temporary program reaches the MCU, and where the interpreter is reset.

## 1. Argument parsing and CLI bootstrap
- `bin/espruino-cli.js` starts by parsing the argument vector. The Gordon runner supplies:
  - `--port <tty>` → adds a single `path` entry to `args.ports`, instructing the CLI to open that serial device.
  - `--no-ble` → disables Bluetooth Low Energy backends by updating the configuration flags.
  - `--board <id>` → records a board identifier so the CLI loads matching JSON metadata instead of probing a connected board.
  - `<tempfile>` → stores the wrapped test program path in `args.file` for upload.【F:node_modules/espruino/bin/espruino-cli.js†L6-L170】【F:node_modules/espruino/bin/espruino-cli.js†L416-L474】
- After parsing, the CLI prints its banner (unless `--quiet`) and loads the EspruinoTools runtime by calling `require('../index.js').init(main);`. That helper enumerates every module in `libs/`, `core/`, and `plugins/`, initializes the global `Espruino` object, and finally invokes `main` once subsystems are ready.【F:node_modules/espruino/bin/espruino-cli.js†L404-L414】【F:node_modules/espruino/index.js†L1-L85】

## 2. Applying configuration for the session
- `main()` begins by calling `setupConfig(Espruino, ...)`, which applies CLI flags to `Espruino.Config` before any connection occurs. In the Gordon runner’s mode this:
  - Forces `BAUD_RATE` (if supplied), turns off BLE stacks, and ensures the system resets before sending code.
  - Loads the requested board JSON. A plain board name (for example `PICO_R1_3`) sets `ENV_ON_CONNECT = false`, copies the board ID into the environment, and downloads the corresponding `.json` description so peripheral mappings, flash layout, and save/upload limits reflect that model. The manifest-provided path could instead point at a local JSON file, in which case it is read from disk.【F:node_modules/espruino/bin/espruino-cli.js†L200-L342】
  - Imports any `--config` overrides and prepares storage upload helpers, although the Gordon runner does not request those features.【F:node_modules/espruino/bin/espruino-cli.js†L204-L312】

## 3. Selecting the target port and starting the connection
- Because a file is queued for upload, `startConnect()` iterates the supplied ports and calls `connect(path, exitCallback)` for each until one succeeds. With a single `--port`, this resolves immediately to our Espruino board.【F:node_modules/espruino/bin/espruino-cli.js†L780-L812】
- `connect()` wires the CLI’s stdout logging by registering a listener via `Espruino.Core.Serial.startListening`. Each newline-delimited chunk from the device is prefixed with `--] ` (unless `--quiet`) and forwarded to the terminal as the runner captures the CLI’s output stream.【F:node_modules/espruino/bin/espruino-cli.js†L524-L552】
- The CLI opens the serial link with `Espruino.Core.Serial.open(devicePath, ...)`. Under Node.js this dispatches to `core/serial_node_serial.js`, which constructs a `serialport.SerialPort` instance at the configured baud rate and forwards each data buffer to EspruinoTools.【F:node_modules/espruino/core/serial.js†L520-L607】【F:node_modules/espruino/core/serial_node_serial.js†L1-L69】

## 4. Preparing the upload payload
- Once connected, `connect()` calls `sendCode()` to build the payload:
  - It reads the temporary file into memory and, because a file is present, leaves `RESET_BEFORE_SEND` enabled.
  - It runs `Espruino.callProcessor('transformForEspruino', code, ...)`, allowing plugins (module resolver, minifier, etc.) to rewrite the program before transmission. In the runner’s simple case this usually just preserves the wrapped script.
  - `Espruino.Core.CodeWriter.writeToEspruino(code, callback)` is invoked to handle prompt synchronization, reset, and streaming of the final buffer.【F:node_modules/espruino/bin/espruino-cli.js†L438-L540】

## 5. Prompt acquisition and interpreter reset
- `CodeWriter.writeToEspruino` first sanitizes the source (`reformatCode`) and then waits for a prompt by calling `Espruino.Core.Utils.getEspruinoPrompt(...)`. That helper sends a newline, monitors serial data until it sees `>` (or issues up to two Ctrl-C characters if the interpreter is busy), and only proceeds once a clean prompt is confirmed.【F:node_modules/espruino/core/codeWriter.js†L26-L74】【F:node_modules/espruino/core/utils.js†L304-L340】
- After a prompt, `writeToEspruino` guarantees the upload ends with two newlines, prepends `\x10print()\n` to temporarily suppress the prompt echo, and—because `RESET_BEFORE_SEND` is `true` by default—injects `\x10reset();\n` at the very start. The `\x10` (Ctrl-P) toggles Espruino’s line echo off before executing each helper, so the interpreter performs a software reset and then prints a blank line without echoing helper commands. This is the critical reset step that ensures the board restarts immediately before the test harness runs.【F:node_modules/espruino/core/codeWriter.js†L45-L70】

## 6. Streaming bytes over USB/serial
- The sanitized buffer (reset helpers + wrapped test code) is handed to `Espruino.Core.Serial.write(code, true, ...)`. The serial abstraction splits the string into `chunkSize` pieces, honors software flow control (reacting to XON/XOFF), and queues writes so only one chunk is in flight at a time. When flow control is enabled, `Connection.write` pauses if the MCU asks for a delay, preventing FIFO overruns.【F:node_modules/espruino/core/serial.js†L200-L252】
- Each chunk ultimately passes to `serial_node_serial.writeSerial`, which converts the string into a Node.js `Buffer` and calls `serialport.write`. The host therefore pushes raw bytes directly onto the USB CDC or UART link with no additional framing besides the helper control characters.【F:node_modules/espruino/core/serial_node_serial.js†L45-L69】

## 7. MCU-side execution and completion timing
- As soon as the Espruino firmware receives `reset();`, it performs a soft reboot: peripherals are reinitialized, the interpreter state is cleared, and the prompt reappears after the boot banner. The remaining bytes (the test harness plus program) then stream into the clean interpreter, which executes them line-by-line as they arrive.
- `CodeWriter.writeToEspruino` polls the IDE terminal to detect when the prompt returns after upload. It waits up to ~2 s (without save) by checking `Espruino.Core.Terminal.getTerminalLine()`; if the prompt does not reappear it sends `Ctrl-C` and `echo(1)` to recover. On success it calls the callback supplied by `sendCode()`.【F:node_modules/espruino/core/codeWriter.js†L52-L75】
- Back in `sendCode()`, the CLI logs “Upload Complete” (to stdout captured by the runner). If `--sleep` were requested it would wait longer, but in the runner’s default configuration it simply schedules `exitCallback` after 500 ms. This post-upload delay gives the MCU time to emit any final lines (such as the JSON test result) before the CLI closes the port.【F:node_modules/espruino/bin/espruino-cli.js†L512-L540】

## 8. Capturing results and shutting down
- While the CLI runs, every byte printed by the Espruino board flows through `Espruino.Core.Serial.startListening` into the CLI’s stdout. `run-tests-gordon.js` captures these streams and searches for the JSON payload emitted by its wrapper to determine the test outcome.【F:node_modules/espruino/bin/espruino-cli.js†L524-L552】【F:scripts/run-tests-gordon.js†L214-L278】
- When the CLI’s `exitTimeout` fires, it prints `Disconnected.` (if the device closes) and resolves control back to the runner. The CLI process exits with code `0` on success, so the Node harness can continue with the next test file.【F:node_modules/espruino/bin/espruino-cli.js†L524-L612】

In summary, the Gordon runner’s invocation of the Espruino CLI results in a predictable sequence: parse options, load board metadata, open the requested serial port, reset the MCU via injected helper commands, stream the wrapped program through a flow-controlled write queue, and wait briefly for the interpreter’s prompt and result payload before disconnecting.

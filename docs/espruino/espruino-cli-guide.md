# Espruino CLI User Guide

This guide contributes to the documentation for the [EspruinoTools](https://github.com/espruino/EspruinoTools) command-line interface that ships with  and expands upon the [README](https://github.com/espruino/EspruinoTools/blob/master/README.md) found there. The CLI shares its internals with the Web IDE, so everything described here uses the same underlying `Espruino.Core` modules (`bin/espruino-cli.js`).

Espruino’s CLI provides the Web IDE’s capabilities—device discovery, code upload, firmware flashing, Storage management—without the GUI. This guide explains each flag, covers connection and upload workflows, and outlines how board metadata, job files, and offline builds integrate so you can script consistent deployments and diagnostics.

## Getting Started

- **Install**: `npm install -g espruino` exposes the `espruino` command. For local development inside this repo use `node ./bin/espruino-cli.js`.
- **Node access**: Ensure your user can open serial or BLE devices. On Linux, grant BLE capability: `sudo setcap cap_net_raw+eip $(readlink -f $(which node))`.
- **Firmware support**: Keep boards on current firmware to ensure CLI features like Storage uploads and remote configs work correctly.

## Core Workflow

At runtime the CLI:

1. Parses CLI flags and optional job files into an `args` object (`bin/espruino-cli.js:67-185`).
2. Calls `setupConfig` to apply CLI intent to `Espruino.Config` (baud, minification, BLE, board JSON, storage bundling, etc.).
3. Establishes connections and runs `sendCode`, firmware, download, or terminal flows depending on arguments.

If no file (`args.file`), expression (`args.expr`), or firmware (`args.updateFirmware`) is provided, the tool opens a terminal session. Press Ctrl-C twice to exit (`bin/espruino-cli.js:683-758`).

## Selecting Devices and Ports

The CLI decides which connection to open using the following precedence:

1. **Explicit ports** (`-p` / `--port`): one or more serial paths, BLE MACs, or TCP URLs. When multiple ports are supplied the CLI iterates through them sequentially (`bin/espruino-cli.js:111-118`, `808-829`).
2. **Name-based search** (`-d <substring>`): the CLI repeatedly scans `Espruino.Core.Serial.getPorts`, looking for the first device whose description/path contains the substring (case-insensitive). Use `--scan-timeout` to extend the search window (`bin/espruino-cli.js:773-799`).
3. **Remote/WebRTC** (`--remote <peer>`): configures the WebRTC bridge and then follows the same port-selection logic once the remote device appears (`bin/espruino-cli.js:291-295`).
4. **Auto-selection**: when no port arguments are provided the CLI scans and picks the first discovered port (`bin/espruino-cli.js:840-884`).

Helpful discovery commands:

- `espruino --list` continuously prints ports as they appear—ideal for verifying USB or BLE visibility.
- `espruino -v` shows discovery logs even without `--list`, useful when troubleshooting missing serial drivers or BLE permissions.

Once connected, `--watch` and multi-port uploads reuse the same selection order, so prefer `-p`/`-d` when you need deterministic targeting.

## Connecting to Hardware

- **Auto-discovery**: Run `espruino --list` to enumerate ports. Without explicit ports, the CLI auto-selects the first available serial/BLE/TCP target (`bin/espruino-cli.js:840-884`).
- **Serial/TCP**: `espruino -p /dev/ttyACM0` or `espruino -p tcp://192.168.1.50[:port]`. Multiple `-p` values upload sequentially.
- **BLE**: `-p` accepts MAC addresses; `-d puck` finds the first device whose name contains `puck`. The CLI registers recognised BLE names/addresses so reconnects are faster (`bin/espruino-cli.js:244-261`).
- **Remote WebRTC**: Pair via https://www.espruino.com/ide/remote and connect using `espruino --remote PEERID` (`bin/espruino-cli.js:291-295`).
- **Terminal mode**: `espruino -p PORT` streams the REPL. Raw mode is enabled when supported so Espruino control characters (Ctrl-C, Ctrl-D) pass through.
- **Web IDE proxy**: `espruino --ide [PORT]` launches a local HTTP/WebSocket bridge so the browser IDE can connect to the same device without a USB connection to that machine (`bin/espruino-cli.js:629-680`).

## Uploading and Running Code

Once a connection is established the CLI can upload source files, inline expressions, and Storage assets in one pass. Everything funnels through the internal `sendCode` helper, which prepares the payload and delegates to `Espruino.Core.CodeWriter` to handle resets, prompt detection, and error recovery. The patterns below cover the most common workflows.

### Recommended Patterns

- **Single upload**: `espruino -p /dev/ttyACM0 app.js`
- **Upload + run command**: `espruino -p /dev/ttyACM0 app.js -e "save()"`  (save the state and ram code to flash in .varimg)
- **Quick command without reset**: `espruino -e "digitalWrite(LED1,1)"`
- **Continuous deployment**: `espruino -p /dev/ttyACM0 --watch app.js` (500 ms debounce).
- **Delay exit**: Use `--sleep N` to keep the connection open after upload for boards that reboot or stream logs.

### MCU Control Snippets

- Soft reset: `espruino -e "reset()"`
- Hard reboot on modern boards: `espruino -e "E.reboot()"`
- Save to flash: `espruino -e "save()"`
- Check free memory: `espruino -e "process.memory()"`

These expressions can be combined with file uploads or run standalone. When no file is provided, the CLI disables the pre-upload reset so state is preserved for quick diagnostics.

### The internal workflow

The function `sendCode` orchestrates uploads (`bin/espruino-cli.js:436-523`).   It pulls together the steps to assemble the payload (file contents, -e expressions, Storage injections), then hands the final string off to Espruino.Core.CodeWriter.writeToEspruino.

`sendCode`:

- Reads the specified `.js` file and concatenates any `-e "expression"` snippets.
  - The CLI reads the file first and then appends each -e expression after it.
  - Anything appended goes into the same payload that Espruino.Core.CodeWriter.writeToEspruino transmits, so the expression is executed on the device once the upload completes.

- Injects code to programmatically create Storage files before your main script when `--storage` is used.
- Calls `Espruino.Core.CodeWriter.writeToEspruino`, which resets the MCU (unless overridden) and waits for a REPl '>' prompt to confirm success (`core/codeWriter.js:24-63`).

## Storage and File Management

Use `--storage name:file` to add Storage entries to the device:

- EG will upload the local file app.js and store it in the connected MCU flash in the file named myApp with:

    ```espruino --storage myApp:app.js```

- `--storage app.js:-` the '-' character instructs the cli to uploaded code as a flash Storage file named `app.js` (primary boot entry).
  - When you use - in a --storage pair, you’re telling the CLI, “take whatever main code I’m uploading right now and store it under this Storage filename instead of sending it to RAM.” You still need to provide the code via a file or -e
  - for example:
    - Put app.js into flash Storage as app.js:

        ```espruino --storage app.js:- app.js```

    - Upload a one-liner into flash Storage under .boot0: 

        ```espruino --storage .boot0:- -e "setInterval(()=>LED1.toggle(),500)"```

  - internally the cli stores the value '-' , which the parser turns into {code:true}. Later, when sendCode runs (bin/espruino-cli.js:456-488), it sees code:true and sets Espruino.Config.SAVE_ON_SEND = 3 and Espruino.Config.SAVE_STORAGE_FILE = "app.js", so the main upload is written directly into Storage under app.js and becomes the boot entry.

- the --storage option can be used to store supporting code or program assets.  For example:
  - `--storage app.img:assets/app.img` streams a binary file in the folder assets into Storage before your JS code runs.
  - `espruino -p /dev/ttyACM0 --storage index.html:web/index.html` where index.html (left side) is the filename on the device, and web/index.html (right side) is the path to the local HTML file. After the upload you can read it back with require("Storage").read("index.html") or serve it from your app.
  - You can mix --storage entries with a normal upload in one command. For example:
  
    ```espruino -p /dev/ttyACM0 main.js --storage index.html:web/index.html'```

    first streams web/index.html into device Storage as index.html, then uploads main.js to RAM (or Storage if you also used --storage main.js:-). After the transfer finishes, main.js runs and can immediately call require("Storage").read("index.html") or similar to use the asset.

- When combined with `--ohex out.hex`, the CLI generates an Intel HEX image containing Storage contents. Without a connected device the CLI operates offline: `espruino --board BANGLEJS --ohex out.hex --storage app.js:- app.js`.
- `--download setting.json` fetches a Storage file to the current directory (`bin/espruino-cli.js:525-539`).

note: The CLI doesn’t have a dedicated delete flag, so you remove Storage files by executing Storage API calls through -e:

  - Delete one file:
  `espruino -p /dev/ttyACM0 -e "require('Storage').erase('app.js')"`
  - Wipe everything in Storage (use with care):
  `espruino -p /dev/ttyACM0 -e "require('Storage').eraseAll()"`


## Store to Flash and Execute

The CLI handles the “write to flash, then execute” flow when you give a --storage name:- entry alongside the code you want to run, for example:

  ```espruino -p /dev/ttyACM0 main.js --storage main.js:-```

- The right-hand - tells the CLI “take the main upload (main.js) and store it in flash (Storage) under main.js instead of just sending it to RAM.”
- While doing so, it forces SAVE_ON_SEND=3, SAVE_STORAGE_FILE="main.js", and LOAD_STORAGE_FILE=2, so Espruino writes the file to flash and then immediately loads it—your program runs right away.
- On the next power-on you can bring it back with load("main.js"), or make it auto-run by naming the Storage file `.bootcde` (or `.boot0` for boards that expect that):

  ```espruino -p /dev/ttyACM0 app.js --storage .bootcde:-```

  If you prefer the traditional “save RAM image” workflow, upload normally and append `-e "save()"`; that writes the whole interpreter state to the board’s saved-program flash slot and it runs automatically after reset.

## Controlling CLI Output

Three flags adjust how much feedback the CLI prints:

- `-v` / `--verbose` enables detailed logs from the CLI and core modules—useful when diagnosing connection or module-loading issues. Verbose logs still respect `console.log` overrides so payload echoes remain grouped (`bin/espruino-cli.js:60-65`).
- `-q` / `--quiet` suppresses the banner and reduces console noise to device output only. The CLI still prefixes each incoming line with `--]` (or a coloured variant) so you can distinguish host/device messages (`bin/espruino-cli.js:194-199`).
- `-c` / `--color` paints device output green using ANSI escape codes; combine with quiet mode for a minimalist but readable terminal stream (`bin/espruino-cli.js:194-199`).

You can mix these switches. For example, `espruino -q -c -v` gives colourised device output while still emitting verbose diagnostics.
There is overlap between `-v` and `-q`.  `-q`  temporarily redefines console.log so anything the CLI would print (including the extra verbose messages added by `-v`) usually stays hidden. Device output still comes through, with the --] prefix (or color if you also passed `-c`). But the two flags aren’t mutually exclusive: the code sets the verbose flag first, then quiet mode wraps console.log, so you can still run `-v -q` together—useful if you want minimal console noise but need the extra detail when a problem occurs.

## Managing Delays and Timeouts

Two options influence how long the CLI waits at different stages:

- `--sleep <seconds>` adds a delay *after* an upload completes (`bin/espruino-cli.js:173-175`, `507-515`). Use it when firmware reboots on upload, when you expect immediate serial logs, or when a follow-up automation (for example a shell script) must wait for the device to finish initialising before closing the port.
- `--scan-timeout <seconds>` extends the discovery window while searching for named/BLE devices (`bin/espruino-cli.js:176-178`, `773-883`). The value is doubled internally (one tick every 0.5 s) to determine how many refresh cycles to perform. Increase it in noisy RF environments or when peripherals take time to advertise.

These delays are independent, so you can pair them with other flags (`--watch`, `--storage`, etc.) without changing upload behaviour.

## Firmware Updates

Flash a bootloader-mode device with:

```bash
espruino -p /dev/ttyACM0 -f firmware.bin[:offset]
```

`flashBinaryToDevice` handles the transfer (`bin/espruino-cli.js:571-577`). The optional offset skips bytes (useful for combined images). BLE flashing is intentionally unsupported; connect via USB serial.

## Job Files and Automation

Job files capture CLI options plus resolved `Espruino.Config` values for reusable automation. The basic flow is:

1. **Create a job file from a working command**

   ```bash
   espruino -p /dev/ttyACM0 app.js --storage app.js:- -j
   ```

   - When `-j` is supplied without a filename the CLI mirrors the current arguments into a JSON file sitting next to your script (for example `app.json`).
   - The file contains every CLI flag together with the `espruino` configuration snapshot so you can edit defaults (ports, Storage entries, `SAVE_ON_SEND`, etc.) by hand.

2. **Reuse the saved job**

   ```bash
   espruino -j app.json
   ```

   - During startup the CLI loads the JSON (`bin/espruino-cli.js:187-215`), injects all stored keys into the argument object, and then processes any additional command-line overrides.
   - This lets you share a single invocation across team members or CI jobs; for example `espruino -j app.json -e "save()"` reuses everything from the job file while adding an extra expression just for that run.

Stored `espruino` config entries overwrite the built-in defaults (for example `SAVE_ON_SEND`, `BOARD_JSON_URL`) so repeated runs behave identically unless you explicitly change them.

## Command Reference

### CLI Flags

| Flag | Type / Values | Default | Description |
| --- | --- | --- | --- |
| `-h`, `--help` | toggle | false | Show usage text and exit (`bin/espruino-cli.js:100`). |
| `-v`, `--verbose` | toggle | false | Enable internal logging (CLI banners, config messages). |
| `-q`, `--quiet` | toggle | false | Suppress banner; prefix device output with `--]` (customizable with `--color`). |
| `-c`, `--color` | toggle | false | Colorize device output using ANSI escape codes. |
| `-m`, `--minify` | toggle | false | Minify uploads using the ESPRIMA pipeline (`Espruino.Config.MINIFICATION_LEVEL`). |
| `-t`, `--time` | toggle | false | Sync Espruino RTC to host time on upload. |
| `-w`, `--watch` | toggle | false | Watch source file and re-upload on change (requires `file`). |
| `-n`, `--nosend` | toggle | false | Process transforms/output without connecting to hardware. |
| `--no-ble` | toggle | false | Disable BLE scanning and support modules. |
| `--list` | toggle | false | Enumerate available devices and exit. |
| `--listconfigs` | toggle | false | Print detailed `Espruino.Config` documentation and exit. |
| `-p`, `--port` | string list | auto | Serial path, BLE MAC, or TCP URL. Multiple values upload sequentially. |
| `-d` | string | auto | Search available ports by substring (case-insensitive). |
| `--download` | string | — | Retrieve Storage file to local disk. |
| `--config key=value` | key/value | — | Override `Espruino.Config` entries (JSON parsed when possible). |
| `-e` | string | — | Evaluate expression after uploading code (or standalone). |
| `-b` | number | board default | Override serial baud rate. |
| `-j [file]` | optional path | — | Load existing job file or create one based on current args. |
| `-o` | path | — | Write final JavaScript payload (post transformations) to disk. |
| `--ohex` | path | — | Emit Intel HEX formatted Storage image from contents being uploaded. |
| `--storage name:file|pair | — |  Write files into Storage; use `-` to map main code into Storage instead of RAM. |
| `-f` | path[:offset] | — | Flash firmware binary via bootloader connection. |
| `--board` | name or JSON path | auto | Force board definition instead of probing on connect. |
| `--remote` | string | — | Connect via WebRTC bridge peer ID. |
| `--ide [port]` | number | 8080 | Serve embedded Web IDE and bridge to the device. |
| `--sleep` | seconds | 0 | Delay CLI exit after upload. |
| `--scan-timeout` | seconds | 3 | Increase BLE scan retries (timeout × 2 half-second cycles). |
| `file` | path | — | JavaScript file to upload. |

### Job File Keys (configDefaults.json)

| Key | Meaning | Default |
| --- | --- | --- |
| `file` | Source file to upload | "" |
| `expr` | Expression to evaluate | "" |
| `ports` | Array of ports to target | `[""]` |
| `baudRate` | Serial baud override | `0` (use config) |
| `watchFile` | Enable watch mode | `false` |
| `quiet` | Suppress banner | `false` |
| `verbose` | Verbose logging | `false` |
| `updateFirmware` | Firmware binary path | "" |
| `firmwareFlashOffset` | Bytes to skip when flashing | `0` |
| `outputJS` | Output JS bundle path | "" |
| `espruino` | Nested config overrides (`Espruino.Config`) | See below |
| `espruino.BAUD_RATE` | Default serial baud | `9600` |
| `espruino.BLUETOOTH_LOW_ENERGY` | Enable BLE support | `true` |
| `espruino.BOARD_JSON_URL` | Board metadata base URL | `http://www.espruino.com/json` |
| `espruino.COMPILATION` | Remote compilation toggle | `true` |
| `espruino.RESET_BEFORE_SEND` | Reset before upload | `true` |
| `espruino.SAVE_ON_SEND` | 0 = RAM, 1 = Flash, 3 = Storage | `0` |
| `espruino.SET_TIME_ON_WRITE` | Set RTC on upload | `false` |
| `espruino.MODULE_URL` | Module download URL | `http://www.espruino.com/modules` |
| `scanTimeout` | BLE scan timeout (seconds) | `3` |
| `sleepAfterUpload` | Delay before exit | `0` |

Job files can contain any CLI key (for example `storageContents`, `nosend`) and are merged over command-line values when loaded.

## Board Identification and Configuration

Espruino boards publish JSON metadata containing flash layout, module lists, and build-time configuration. The CLI uses this data for several features:

- **Automatic detection**: By default the CLI connects, queries the environment (`Espruino.Core.Env`), and loads the matching board JSON to populate settings such as saved-code addresses, Storage page sizes, and available built-in modules.
- **Explicit selection**: `--board <name or path>` skips the detection step and forces a specific definition (`bin/espruino-cli.js:296-315`). Supply either a board ID (for example `BANGLEJS`, `PUCKJS`) or a path to a custom JSON file.
- **Effect on uploads**: Board data drives Storage layout (`saved_code` blocks), firmware URLs, and module resolution; it also feeds into `--ohex` generation and firmware flashing so addresses match the target MCU.

When you provide a JSON path, the CLI injects its contents into `Espruino.Core.Env` before execution and disables the automatic environment probe (`ENV_ON_CONNECT=false`). This is essential when working offline (`--nosend`) or when the board isn’t discoverable yet but you still want accurate bundling.

### Board JSON lifecycle

- **Generation**: In the Espruino firmware repo each board has a Python descriptor (`boards/BOARDNAME.py`). The release tooling executes `scripts/build_board_json.py` to emit `BOARDNAME.json`—the file includes flash layout, Storage configuration, module lists, and metadata such as download URLs.
- **Hosting**: Official builds are published to `https://www.espruino.com/json/BOARDNAME.json`, which the CLI loads by default (`Espruino.Config.BOARD_JSON_URL`).
- **Local overrides**: For unpublished or custom boards, generate the JSON yourself and pass it to the CLI:

  ```bash
  # Inside the Espruino firmware repo
  python scripts/build_board_json.py boards/MYBOARD.py > MYBOARD.json

  # Copy into EspruinoTools and reference it
  cp MYBOARD.json /path/to/EspruinoTools/boards/
  espruino --board boards/MYBOARD.json app.js
  ```

  Once loaded, the CLI merges the JSON into `Espruino.Core.Env` just like an official definition.

- **Failure modes without JSON**: Features that rely on layout information break—`--ohex` cannot determine saved-code pages, firmware flashing rejects offsets, and module bundling loses awareness of built-ins. These symptoms disappear once the correct JSON is supplied.

### What `Espruino.Core.Env` Provides

`Espruino.Core.Env` acts as the shared knowledge base for the active device:

- **process.env cache**: After connecting, the CLI requests `process.env` and stores the parsed response (board name, firmware version, chip features) in `Espruino.Core.Env.getData()` (`core/env.js:34-74`).
- **Configuration hooks**: Modules such as the code writer, Storage helpers, and compiler consult `Espruino.Core.Env.getData()` to determine prompt behaviour, saved-code addresses, and tokenisation support (`bin/espruino-cli.js:348-388`, `core/codeWriter.js:81-126`).
- **Board JSON overlay**: When a board definition is downloaded or supplied via `--board`, its fields merge into the cached environment so downstream logic (module bundling, `--ohex`, firmware flashing) uses the right flash layout and module catalogue.
- **Firmware awareness**: `setFirmwareVersion` normalises semantic version strings into major/minor numbers so features depending on minimum firmware versions can make decisions (`core/env.js:19-33`).

Because many CLI operations depend on board capabilities, ensure `Espruino.Core.Env` has accurate data by either connecting to the device once or forcing the correct board JSON when running offline.

## Offline Bundling and Preview

Two switches let you run the tooling without actually touching a device:

- `-o <file>` writes the exact JavaScript payload that would have been transmitted to Espruino. The output includes any module bundling, minification, and Storage upload shims added by `sendCode`, so it’s perfect for auditing transformations or building a ready-to-send artifact (`bin/espruino-cli.js:144-150`, `474-500`).
- `-n` / `--nosend` skips opening a port entirely. The CLI still parses source files, applies minification and Storage handling, and honours `-o`/`--ohex`, but it never writes to the MCU (`bin/espruino-cli.js:107`, `601-604`).

Common combinations:

```bash
# Produce an offline bundle (minified, modules resolved) without connecting
espruino --board BANGLEJS --minify app.js -o dist/app.bundle.js --nosend

# Generate an Intel HEX Storage image only
espruino --board BANGLEJS app.js --storage app.js:- --ohex app.hex --nosend
```

These options are useful for CI pipelines and manufacturing lines where you want deterministic output files and defer the actual flashing to a later step.

## Practical Tips

- Use `--config RESET_BEFORE_SEND=false` when sending quick debug snippets to avoid resetting running code.
- Combine `--nosend` with `-o` or `--ohex` to pre-bundle artifacts for manufacturing or OTA distribution.
- Increase `--scan-timeout` in noisy RF environments to give BLE devices time to appear.
- Persist board-specific configurations in job files per MCU family for smoother automated builds.

## Troubleshooting

- **No ports found**: Run with `--verbose` to confirm required modules (serialport, noble) loaded cleanly.
- **Upload hangs**: `Espruino.Core.CodeWriter` waits for a prompt; check for blocking `while(true)` loops in user code or disable reset to avoid halt conditions.
- **Storage overflow**: `--ohex` conversion prints the offset and raises an error if files exceed available flash (`bin/espruino-cli.js:348-392`).
- **Firmware flash failures**: Ensure the board is in bootloader mode and connected via USB; the CLI reports `Error!` if the flasher callback returns an error.

---

Espruino® is © 2013–2024 Pur3 Ltd. “Espruino” is a trademark of Pur3 Ltd. Provided under the open-source license distributed with the Espruino project.

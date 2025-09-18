# build notes

### Added tester manifests for the ESP32 family with flashing recipes, GPIO mappings, and suite metadata:

- `boards/ESP32.json:1` defines a generic ESP32 DevKit profile with esptool artifacts/offsets, Raspberry Pi GPIO assignments for EN/GPIO0, serial port hints, and default/available suites.
- `boards/ESP32C3.json:1` captures ESP32‑C3 specifics (lower baud, GPIO9 boot strap, USB CDC port pattern) while mirroring the suite/fixture structure.
- `boards/ESP32S3.json:1` provides the S3 variant with its chip ID, baud, GPIO map, and shared test taxonomy.
Validated all three manifests via Python JSON parsing (Node isn’t present in this shell).

### Updated the baseline documentation to lock in the “prebuilt firmware” assumption:

- `docs/baseline-requirements.md:3` now states the tester never builds firmware; it expects per-target, per-version binaries to be supplied.
- New Firmware Assets section clarifies storing bundles (app/bootloader/partition) under firmware/<board>/<version>/, mirroring outputs from upstream make targets such as make/targets/ESP32_IDF4.make.
- Deployment instructions note seeding these bundles alongside board manifests.

This keeps the harness focused on flashing/testing while reusing the existing Espruino build system.

### New dry-run utility added at scripts/dry-run.js:1

- providing a zero-touch workflow to inspect board manifests, chosen suites, and firmware bundles. It accepts --board/--device, optional --version, and validates suite names against each manifest’s suites.available; when a version is supplied it checks firmware/<board>/<version>/ and reports artifact presence plus flashing adapter metadata.

- docs/baseline-requirements.md:1 now references the real dry-run command (node scripts/dry-run.js --board ESP32 --version <firmwareVersion> --suites javascript-core) so the deployment checklist matches the new tooling.

I couldn’t execute the script here because Node.js isn’t installed in the current shell; once Node is in place, run node scripts/dry-run.js --list to verify everything loads.

**Next steps:**

1) Seed firmware/<board>/<version>/ with actual bundles so the script can confirm artifacts.
2) Extend the harness runner to consume the same manifest parsing logic for real test runs.

### Dry-run tooling is wired up and working now.

- `scripts/dry-run.js:1` validates board manifests, suite selections, and firmware bundle directories. I confirmed it runs under Node v20.15.0 once PATH=/home/simon/.nvm/versions/node/v20.15.0/bin:$PATH.
- docs/baseline-requirements.md:1 references the real dry-run usage (node scripts/dry-run.js --board ESP32 --version <firmwareVersion> --suites javascript-core), so the deployment checklist matches this tool.

**Next steps:**

1) Populate firmware/<board>/<version>/ with the prebuilt binaries so the script can verify artifacts.
2) Hook the same manifest parsing into the future test runner and CI scripts.


Place prebuilt ESP32 firmware under firmware/ESP32/<version>/.
For example, after copying binaries:
firmware/
  ESP32/
    2v21/
      bootloader.bin
      partition-table.bin
      espruino_2v21_esp32.bin

PATH=/home/simon/.nvm/versions/node/v20.15.0/bin:$PATH \
  scripts/dry-run.js --board ESP32 --version 2v21

The application image name needs to match the manifest pattern. Rename espruino.bin to the expected espruino_2v27.32_esp32c3.bin  format.

### Implemented a reusable flashing pipeline for the ESP32C3 workflow:

- Added manifest helpers `lib/manifest.js:1` and refactored the dry-run CLI `scripts/dry-run.js:1` to share board/firmware parsing.
- Introduced pluggable flash adapters (flashers/index.js:1) with an ESP32/ESP32C3 esptool backend that honors GPIO boot/reset sequencing and supports dry-run mode (flashers/esp32-esptool.js:1).
- Created a flashing CLI (scripts/flash.js:1) to invoke the adapter: scripts/flash.js --board ESP32C3 --version <v> --port <tty> [--dry-run].
- Documented the new workflow in docs/baseline-requirements.md:1 and clarified firmware bundle layout under firmware/.

**Commands run**

```bash
PATH=/home/simon/.nvm/versions/node/v20.15.0/bin:$PATH scripts/dry-run.js --board ESP32C3 --version 2v27.32

PATH=/home/simon/.nvm/versions/node/v20.15.0/bin:$PATH scripts/flash.js --board ESP32C3 --version 2v27.32 --port /dev/ttyACM0 --dry-run
```

**Next steps**

- Run npm install so the onoff GPIO dependency is available before real flashing.
- Provide the actual serial device path and drop --dry-run to program the ESP32C3 with esptool.
- Replicate the firmware bundle structure for ESP32 and ESP32S3, then validate with dry-run/flash --dry-run.

### Reset mode

as background please confirm how esptool determins the reset mode. Can we keep our solution simple and utilise the esptool mechanism ?

Short version: esptool doesn’t “auto-detect” reset style; it follows what you tell it via --before/--after. The defaults work for most UART‑bridge dev boards. For native USB Serial‑JTAG, switch --before to usb_reset.

#### How esptool resets

UART bridge (CP210x/CH340/FTDI): default_reset toggles DTR/RTS to drive EN/GPIO0 through the board’s auto‑programming transistors. after=hard_reset toggles EN to reboot.
USB Serial‑JTAG (C3/S3 native USB): usb_reset asks the USB driver/device to reset into ROM bootloader; no DTR/RTS needed. after=hard_reset tells the ROM to reboot when done.
What to set

Leave it simple and let esptool handle it; configure per board in the manifest:
UART boards: extraArgs: ["--before","default_reset","--after","hard_reset"] (this is already in place)
Serial‑JTAG boards: extraArgs: ["--before","usb_reset","--after","hard_reset"]
Quick checks

UART: esptool.py --chip esp32 --port /dev/ttyUSB0 --before default_reset --after hard_reset chip_id
Serial‑JTAG: esptool.py --chip esp32c3 --port /dev/ttyACM0 --before usb_reset --after hard_reset chip_id

#### Conclusion

Agreed, we can and should keep the harness simple and rely solely on esptool’s --before/--after. No host GPIO needed. If a custom board lacks the auto‑programming circuit, document a manual boot procedure rather than adding GPIO control.

- Removed host GPIO from manifests:

- Deleted the "gpio" sections in boards/ESP32.json and boards/ESP32S3.json.
- Kept boards/ESP32C3.json and boards/ESP32.json otherwise intact.

#### ESP32‑C3 reset mode:

- `boards/ESP32C3.json:1` now uses USB Serial‑JTAG reset by default:
"extraArgs": ["--before","usb_reset","--after","hard_reset"]

- Added an inline note field for clarity:
"flash._notes_reset": "Default uses USB Serial-JTAG (usb_reset). For UART DTR/RTS, set extraArgs to ['--before','default_reset','--after','hard_reset'] and use /dev/ttyUSB*."

What to change if switching ESP32‑C3 to UART:

Edit boards/ESP32C3.json: "flash.extraArgs" to:
["--before","default_reset","--after","hard_reset"]

Use a /dev/ttyUSB* port (typical for CP210x/CH340/FTDI bridges).

No other changes are needed. You can verify configurations via:

PATH=/home/simon/.nvm/versions/node/v20.15.0/bin:$PATH scripts/dry-run.js --board ESP32C3 --version 2v27.32
PATH=/home/simon/.nvm/versions/node/v20.15.0/bin:$PATH scripts/flash.js --board ESP32C3 --version 2v27.32 --port /dev/ttyACM0 --dry-run

## ESP32 Harness Notes

- Targets generic ESP32 DevKit style boards running stock Espruino firmware (`espruino_%v_esp32.bin`).
- Console is exposed on `/dev/ttyUSB*` at 115200 baud. Earlier runners defaulted to 9600 (per `EspruinoTools/configDefaults.json`) and produced `no_result` failures (see `docs/issues/Issue_ES32_noResult.md`). Make sure `boards/ESP32/cli.json` sets `{ "key": "BAUD_RATE", "value": 115200 }` inside `cli.espruinoConfig` so the session default is overridden.  eg

```js
    "espruinoConfig": [
      { "key": "DISABLE_NOBLE", "value": true },
      { "key": "BAUD_RATE", "value": 115200 }
    ]
```

- Uses the standard ESP32 esptool flasher settings (921600 baud, DIO @ 40 MHz). Adjust `flash.extraArgs` if your adapter requires different reset semantics.
- Default suites mirror the legacy manifest (`javascript-core`, `library-xfsm`, etc.). Trim or expand once smoke tests confirm stability on hardware.

TODOs / Validation:

- Confirm `cliBoardFiles/ESP32.json` matches the firmware build used on hardware.
- Run `demo/getStarted` and `wifi-connectivity` suites once the device is wired and confirm the CLI captures wrapper JSON without the legacy fallback.

```bash
node scripts/run-tests-gordonV4.js --board ESP32 --port /dev/ttyUSB0 --suites javascript-core --serial-debug
```
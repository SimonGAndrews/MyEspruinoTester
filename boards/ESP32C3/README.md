# ESP32-C3 Harness Notes

- Uses USB Serial-JTAG (`--before usb_reset`) by default. Switch to UART DTR/RTS by adjusting `flash.extraArgs` as noted in `board.json`.
- Serial discovery hints prefer `/dev/ttyACM*`, then `/dev/ttyUSB*`. Explicit ports override the glob order.
- Fixtures assume the shared `wifi` catalogue (`wifi: "default"`). Override via suite or run-session metadata when targeting lab-specific credentials.

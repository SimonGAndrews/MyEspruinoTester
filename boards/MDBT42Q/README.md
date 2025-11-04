# MDBT42Q Harness Notes

- Nordic nRF52832 module with onboard Bluetooth LE. Harness defaults to Serial1 on D6 (TX) / D8 (RX) at 9600 baud; override the port on the CLI if the USB CDC device shows up on a different path.
- Enter DFU mode by holding BTN1 while powering the board. Use the Espruino Web IDE, nRF Connect, or `nrfutil` to upload `espruino_%v_mdbt42q.hex` over BLE or serial DFU.
- Default fixtures assume only the onboard BLE adaptor. Provide external sensors/fixtures per suite metadata when required.
- Suites enabled by default focus on core JavaScript and harness plumbing; add wireless-specific suites once BLE coverage lands.

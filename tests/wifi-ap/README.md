# Wifi access point tests

## Current coverage

- `test_start_stop_ap.js`: Verifies the soft AP can be started, wifi.getStatus() reflects AP mode, and wifi.stopAP() cleans up. Good basic lifecycle check but only exercises a single open AP configuration and doesn’t validate return values or error propagation beyond the happy path.

- `test_ap_ip_report.js`: Confirms wifi.getIP() returns an object with ip, netmask, and gw after the AP starts, and fails if any field is missing.

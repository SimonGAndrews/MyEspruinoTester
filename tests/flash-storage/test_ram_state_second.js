/* JSON {
  "notes": "Verifies the RAM flag populated by the previous test is still present.",
  "config": {
    "cli": {
      "RESET_BEFORE_SEND": false
    },
    "loader": {
      "noReset": true,
      "timeoutMs": 10000
    }
  }
} */

if (global.__phase3_ram_flag !== 123) {
  __fail("RAM flag missing after no-reset");
} else {
  __pass();
}

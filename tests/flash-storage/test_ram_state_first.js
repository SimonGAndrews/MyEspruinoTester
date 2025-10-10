/* JSON {
  "notes": "Sets a global RAM flag to demonstrate no-reset state persistence.",
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

global.__phase3_ram_flag = 123;
result = global.__phase3_ram_flag === 123;

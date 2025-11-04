## Fix Summary
- `EspruinoTools/core/env.js`: guard the `connected` processor callback so it can only fire once.
- `EspruinoTools/core/utils.js`: retry `getEspruinoPrompt` with an extra newline before issuing Ctrl-C, matching manual wake-up behaviour.
- `scripts/run-tests-gordonV4.js`: during warm-up, initialise EspruinoTools and force `ENV_ON_CONNECT=false` before sending the readiness ping (harness-only change).

## Outstanding Issues / Options

| Issue | Symptoms | Fix Status / Options |
|-------|----------|----------------------|
| Serial TX queue underflow | `TypeError: ... txItem.data.length` during CLI upload | Fixed locally via guard in `EspruinoTools/core/serial.js`; plan PR to upstream. |
| CLI iterator crash | Repeated CLI invocation fails with `port.type` error | Fixed locally via iterator rewrite in `EspruinoTools/bin/espruino-cli.js`; plan PR to upstream. |
| Post-reset prompt missing | Harness waits forever for `__RUNNER_READY__` after `reset();` | Pending harness change: send an extra newline after reset (no EspruinoTools change). |
| `ENV_ON_CONNECT` loop on Pico | Warm-up spams “Unable to retrieve board information” | Pending harness change: disable `ENV_ON_CONNECT` before warm-up (could stay harness-only or become a Pico-specific EspruinoTools tweak later). |

### Diff Reference

```diff
--- EspruinoTools/core/env.js (before)
+++ EspruinoTools/core/env.js (after)
@@
-    Espruino.Core.Utils.executeExpression("process.env", function(result) {
+    var finished = false;
+    function finish() {
+      if (finished) return;
+      finished = true;
+      callback(data);
+    }
+
+    Espruino.Core.Utils.executeExpression("process.env", function(result) {
@@
-      Espruino.callProcessor("environmentVar", environmentData, function(envData) {
-        environmentData = envData;
-        callback(data);
-      });
+      Espruino.callProcessor("environmentVar", environmentData, function(envData) {
+        environmentData = envData;
+        finish();
+      });
     });
   }
```

```diff
--- EspruinoTools/core/utils.js (before)
+++ EspruinoTools/core/utils.js (after)
@@
-    var receivedData = "";
+    var receivedData = "";
+    var promptAttempts = 0;
@@
-    var timeout = setTimeout(function() {
-      console.log("Got "+JSON.stringify(receivedData));
-      // if we haven't had the prompt displayed for us, Ctrl-C to break out of what we had
-      console.log("No Prompt found, got "+JSON.stringify(receivedData[receivedData.length-1])+" - issuing Ctrl-C to try and break out");
-      Espruino.Core.Serial.write('\x03');
-      hadToBreak = true;
-      timeout = setTimeout(function() {
-        console.log("Still no prompt - issuing another Ctrl-C");
-        Espruino.Core.Serial.write('\x03');
-        nextStep();
-      },3000);
-    },3000);
+    function issueCtrlCSequence() {
+      console.log("No Prompt found, got "+JSON.stringify(receivedData[receivedData.length-1])+" - issuing Ctrl-C to try and break out");
+      Espruino.Core.Serial.write('\x03');
+      hadToBreak = true;
+      timeout = setTimeout(function() {
+        console.log("Still no prompt - issuing another Ctrl-C");
+        Espruino.Core.Serial.write('\x03');
+        nextStep();
+      },3000);
+    }
+    var timeout = setTimeout(function onTimeout() {
+      promptAttempts++;
+      console.log("Got "+JSON.stringify(receivedData));
+      if (promptAttempts < 2) {
+        console.log("No prompt yet - sending another newline to wake device");
+        Espruino.Core.Serial.write('\n');
+        timeout = setTimeout(onTimeout, 3000);
+      } else {
+        issueCtrlCSequence();
+      }
+    },3000);
```

### Proposed Upstream Patches (for future PRs)

```diff
--- EspruinoTools/core/serial.js (before)
+++ EspruinoTools/core/serial.js (after)
@@
-          var txItem = connection.txDataQueue[0];
-          uart.writeProgress(txItem.maxLength - (txItem.data?txItem.data.length:0), txItem.maxLength);
-          connection.updateProgress(txItem.maxLength - (txItem.data?txItem.data.length:0), txItem.maxLength);
+          var txItem = connection.txDataQueue[0];
+          if (!txItem) {
+            uart.writeProgress();
+            connection.updateProgress();
+            return;
+          }
+          if (!txItem.data) {
+            log(1, 'serial: skipping empty txItem');
+            connection.txDataQueue.shift();
+            setTimeout(writeChunk, 0);
+            return;
+          }
+          var remaining = txItem.data.length;
+          uart.writeProgress(txItem.maxLength - remaining, txItem.maxLength);
+          connection.updateProgress(txItem.maxLength - remaining, txItem.maxLength);
```

```diff
--- EspruinoTools/bin/espruino-cli.js (before)
+++ EspruinoTools/bin/espruino-cli.js (after)
@@
-    (function (ports, connect) {
-      this.ports = ports;
-      this.idx = 0;
-      this.connect = connect;
-      this.iterate = function() {
-        if (this.idx>=ports.length) tasksComplete();
-        else getPortPath(ports[this.idx++], function(path) {
-          connect(path, this.iterate);
-        });
-      };
-      this.iterate();
-    })(args.ports, connect);
+    (function initialisePortQueue(ports, connectFn) {
+      const state = {
+        ports,
+        idx: 0,
+      };
+      function iterate() {
+        if (state.idx >= state.ports.length) {
+          tasksComplete();
+          return;
+        }
+        const port = state.ports[state.idx++];
+        getPortPath(port, function(path) {
+          connectFn(path, iterate);
+        });
+      }
+      iterate();
+    })(args.ports, connect);
```

```diff
--- scripts/run-tests-gordonV4.js (before)
+++ scripts/run-tests-gordonV4.js (after)
@@
-    const code = 'print("__RUNNER_READY__")';
-    const origLog = console.log;
-    const origWarn = console.warn;
-    const origErr = console.error;
-    const restore = () => {
-      console.log = origLog;
-      console.warn = origWarn;
-      console.error = origErr;
-    };
-    if (quiet) {
-      console.log = () => {};
-      console.warn = () => {};
-      console.error = () => {};
-    }
-    E.sendCode(port, code, () => {
-      restore();
-      resolve();
-    });
+    const code = 'print("__RUNNER_READY__")';
+    const origLog = console.log;
+    const origWarn = console.warn;
+    const origErr = console.error;
+    const restore = () => {
+      console.log = origLog;
+      console.warn = origWarn;
+      console.error = origErr;
+    };
+    if (quiet) {
+      console.log = () => {};
+      console.warn = () => {};
+      console.error = () => {};
+    }
+    const applyConfig = () => {
+      if (global.Espruino && global.Espruino.Config) {
+        try {
+          if (typeof global.Espruino.Config.set === 'function') {
+            global.Espruino.Config.set('ENV_ON_CONNECT', false);
+          } else {
+            global.Espruino.Config.ENV_ON_CONNECT = false;
+          }
+        } catch (_) {
+          global.Espruino.Config.ENV_ON_CONNECT = false;
+        }
+      }
+    };
+    E.init(() => {
+      applyConfig();
+      E.sendCode(port, code, () => {
+        restore();
+        resolve();
+      });
+    });
```

## Future Considerations
- Follow up on post-reset prompt handling if further hangs appear (e.g. inject explicit newline after `reset();` in runner).
- Prepare two upstream PRs once the harness is stable: one for the `core/serial.js` guard (repro case #1) and one for the CLI iterator fix (repro case #2). Both are justified with pure EspruinoTools commands above.
- Upstream EspruinoTools could adopt the prompt retry fix to aid other USB CDC boards exhibiting the same wake-up behaviour.


## For reference usefull tools used in this debug

### monitor add drop of devices

```bash
sudo dmesg -w
```

- run while reproducing the hang. If the Pico’s reset briefly drops and re-adds the USB device it will be seen.

### monitor traffic to / from device

```bash
stdbuf -o0 cat /dev/ttyACM0 ,raw
```

- try without raw also (not sure of its function).
- run before any connecting instructions , such as espruino tools or test harness
- eg run in one terminal while you power-cycle the board—to verify that the Pico really emits \r\n> automatically after reset().

### Baseline the host side

```bash
stty -F /dev/ttyACM0 115200  
```

- just before launching the Harness, so we know the TTY is configured the same way your screen session was. This doesn’t change Pico behavior (USB CDC ignores the numeric rate), but it keeps the OS settings predictable.

### verbose execution of harness

Run the harness with verbose CLI: execute node scripts/run-tests-gordonV4.js --board PICO_R1_3 --port /dev/ttyACM0 --suites demo/getStarted --quiet=false --verbose-espruino (or just set DEBUG=espruino:* in the environment). eg if we want to see whether EspruinoTools sends any follow-up newline or loses the connection after the reset.

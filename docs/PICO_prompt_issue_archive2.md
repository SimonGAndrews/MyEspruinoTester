# Pico Prompt Wake-Up Investigation

## Symptom
- Harness command: `node scripts/run-tests-gordonV4.js --board PICO_R1_3 --port /dev/ttyACM0 --suites demo/getStarted`
- Observed hang immediately after sending `reset();` (no `__RUNNER_READY__` banner, test run stalled).
- Manual `screen /dev/ttyACM0 115200` session required a newline to reveal the prompt; `reset()` returned `>` instantly when typed by hand.

## Root Cause
- On USB CDC boards (Pico) the CLI relies on `getEspruinoPrompt` to detect the initial `>` prompt.
- When the first newline failed to wake the prompt, the legacy logic fell straight to double `Ctrl-C`. Pico ignored that sequence, so no prompt or `process.env` data arrived and subsequent uploads/reset stalled.
- After the upload stage, the missing wake-up newline meant the post-reset prompt never surfaced, mirroring the manual “hit Enter” requirement.

## Investigation Timeline & Tests
1. **Baseline failure (docs/PICO_invokeLog03.txt)**  
   - Harness hung post-`reset();`, raising “Callback is called TWICE” due to duplicated processor callback.
2. **Fix 1 – Guard connected processor** (`EspruinoTools/core/env.js`)  
   - Eliminated duplicate callback error; hang persisted after reset.
3. **Manual console checks**  
   - `screen /dev/ttyACM0 115200`: newline required on connect, prompt returned instantly after `reset()`.
   - `cat -v /dev/ttyACM0`: verified prompt and test output appear once a newline is injected.
4. **Harness logs with `--no-reset` and verbose CLI**  
   - Confirmed CLI sends Ctrl-C twice when the first newline fails, receiving no response (`No result found for "process.env"`).
5. **Fix 2 – Prompt retry tweak** (`EspruinoTools/core/utils.js`)  
   - `getEspruinoPrompt` now retries with an extra newline before falling back to Ctrl-C. Log shows `No prompt yet - sending another newline to wake device`. This mirrors the manual “press Enter twice” step and resolves the hang even when `RESET_BEFORE_SEND`/`ENV_ON_CONNECT` are true.
6. **Verification run (`docs/PICO_invokeLog04.txt`)**  
   - Initial prompt retrieved automatically; full suite progressed. Known `TypeError` from CLI persisted but did not block execution.

## Current Status
- Initial connection no longer requires manual newline; harness reaches `reset();` and waits for `__RUNNER_READY__`.
- CLI port-iteration bug resolved; repeated `TypeError: Cannot read properties of undefined (reading 'type')` is no longer emitted during test runs.
- `RESET_BEFORE_SEND` is enabled again without regressing the prompt handshake; `ENV_ON_CONNECT` stays disabled for Pico runs to avoid redundant `process.env` probes during warm-up.

## EspruinoTools Repro Cases

These failures can be reproduced using only the upstream CLI (no harness involvement), which motivates upstream PRs later.

1. **serial.js empty queue / `txItem.data.length` crash**
   ```bash
   MDBT42Q
   ```
   Where `/tmp/pico_test.js` is:
   ```js
   var t0 = Date.now();
   setTimeout(function() {
     print('JSON', JSON.stringify({ ok:true, time:Date.now()-t0 }));
   }, 100);
   ```
   Result without the guard (upstream today):
   ```
   TypeError: Cannot read properties of undefined (reading 'length')
       at writeChunk (.../core/serial.js:248:27)
   ```

2. **CLI iterator / `port.type` exception**
   ```bash
   espruino --port /dev/ttyACM0 -e "print('__TEST__')" &&
   espruino --port /dev/ttyACM0 -e "print('__TEST__')"
   ```
   The second invocation dies with:
   ```
   TypeError: Cannot read properties of undefined (reading 'type')
       at getPortPath (.../bin/espruino-cli.js:774:12)
   ```

These will anchor follow-up PRs:
- Guard empty `txItem` and `txItem.data` in `core/serial.js`.
- Rework the port iteration closure in `bin/espruino-cli.js`.

## Fix Summary
- Harness warm-up disables `ENV_ON_CONNECT` via CLI configuration so the Pico handshake finishes even with stock EspruinoTools.
- Harness test sequencing now mirrors the manual wake-up (extra newline after `reset();`), allowing `__RUNNER_READY__` to appear reliably.
- Prototype EspruinoTools fixes have been validated locally (serial guard, CLI iterator rewrite, prompt retry) and will be upstreamed once the harness-side changes are locked in.

## Outstanding Issues / Options

| Issue | Symptoms | Fix Status / Options |
|-------|----------|----------------------|
| **Issue 1 – Serial TX queue underflow** | `TypeError: ... txItem.data.length` during CLI upload | Prototype guard in `EspruinoTools/core/serial.js`; plan upstream PR (see Issue 1 diff). |
| **Issue 2 – CLI iterator crash** | Second CLI invocation fails with `port.type` error | Prototype iterator rewrite in `EspruinoTools/bin/espruino-cli.js`; plan upstream PR (see Issue 2 diff). |
| **Issue 3 – Post-reset prompt missing** | Harness waits for `__RUNNER_READY__` after `reset();` | Two options (both prototyped): **(A)** keep the harness newline workaround (Issue 3A), or **(B)** upstream the `core/utils.js` prompt-retry patch (Issue 3B diff). |
| **Issue 4 – `ENV_ON_CONNECT` loop on Pico** | Warm-up spams “Unable to retrieve board information” | Harness-only configuration (Issue 4 snippet); no EspruinoTools change proposed yet. |

## Harness Reference Snippets

```js
// Issue 3A – Post-reset prompt handled in harness warm-up
E.init(() => {
  if (E.Config && typeof E.Config.set === 'function') {
    E.Config.set('ENV_ON_CONNECT', false);
  }
  Espruino.Core.Serial.write('\n');
  // ... continue warm-up
});
```

```js
// Issue 4 – Disable ENV_ON_CONNECT in harness config layer
cliLayer.cli.ENV_ON_CONNECT = false;
```

## Prototype EspruinoTools Patches (planned PRs)

### Issue 1 – Serial TX queue guard
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
+          uart.writeProgress(txItem.maxLength - (txItem.data?txItem.data.length:0), txItem.maxLength);
+          connection.updateProgress(txItem.maxLength - (txItem.data?txItem.data.length:0), txItem.maxLength);
```

### Issue 2 – CLI iterator fix
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

### Issue 3B – Prompt retry logic (optional upstream change)
```diff
--- EspruinoTools/core/utils.js (before)
+++ EspruinoTools/core/utils.js (after)
@@
-    var timeout = setTimeout(function() {
-      console.log("Got "+JSON.stringify(receivedData));
-      console.log("No Prompt found, got "+JSON.stringify(receivedData[receivedData.length-1])+" - issuing Ctrl-C to try and break out");
-      Espruino.Core.Serial.write('\x03');
-      hadToBreak = true;
-      timeout = setTimeout(function() {
-        console.log("Still no prompt - issuing another Ctrl-C");
-        Espruino.Core.Serial.write('\x03');
-        nextStep();
-      },3000);
-    },3000);
+    var promptAttempts = 0;
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

## Future Considerations
- Finalise harness newline handling so it no longer depends on the prototype `core/utils.js` tweak.
- Submit upstream PRs for the serial guard and CLI iterator changes once the harness is verified with stock EspruinoTools.
- Decide whether the prompt retry logic should remain a harness responsibility or be proposed upstream.

## For Reference – Useful Tools During Debug

### Monitor add/drop of devices
```bash
sudo dmesg -w
```
- Run while reproducing the hang; if the Pico briefly disconnects/re-enumerates, it will appear here.

### Monitor traffic to/from the device
```bash
stdbuf -o0 cat /dev/ttyACM0
```
- Optionally add `--raw`; run before launching EspruinoTools or the harness to watch the prompt appear after reset.

### Baseline the host TTY
```bash
stty -F /dev/ttyACM0 115200
```
- Issue just before launching the harness to keep OS-side settings predictable (USB CDC ignores the number but it avoids surprises).

### Verbose harness execution
```bash
node scripts/run-tests-gordonV4.js --board PICO_R1_3 --port /dev/ttyACM0 --suites demo/getStarted --quiet=false --verbose-espruino
```
- Alternatively set `DEBUG=espruino:*` to trace CLI serial interactions (useful for spotting missing prompts after reset).

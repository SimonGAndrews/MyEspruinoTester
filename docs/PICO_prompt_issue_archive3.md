# Espruino Tools - Identified Issues

## Introduction

| Issue | Symptoms | Fix Status / Options |
|-------|----------|----------------------|
| **Issue 1 – Serial TX queue underflow** | `TypeError: ... txItem.data.length` during CLI upload | Prototype guard in `EspruinoTools/core/serial.js`; plan upstream PR (see Issue 1 diff). |
| **Issue 2 – CLI iterator crash** | Second CLI invocation fails with `port.type` error | Prototype iterator rewrite in `EspruinoTools/bin/espruino-cli.js`; plan upstream PR (see Issue 2 diff). |
| **Issue 3 – Post-reset prompt missing** | Harness waits for `__RUNNER_READY__` after `reset();` | Two options: keep harness newline workaround (Issue 3A) or upstream `core/utils.js` prompt-retry patch (Issue 3B diff). |
| **Issue 4 – `ENV_ON_CONNECT` loop on Pico** | Warm-up spams “Unable to retrieve board information” | Harness-only configuration tweak (Issue 4 snippet); no EspruinoTools change proposed yet. |

## Issue 1 – Serial TX Queue Underflow

### Symptoms
- Reproduced with the upstream CLI while flashing MDBT42Q using `/tmp/pico_test.js`.
- CLI throws `TypeError: Cannot read properties of undefined (reading 'length')` from `EspruinoTools/core/serial.js:248`.

### Investigation
- `connection.txDataQueue` occasionally contains an empty entry when asynchronous uploads drain faster than the writer replenishes (`EspruinoTools/core/serial.js`).
- When the guard is missing, `writeChunk` attempts to read `txItem.data.length`, triggering the TypeError.

### Root Cause
- `writeChunk` assumes the queue head always exists and carries a `data` buffer. During Pico warm starts the queue can change while the writer is mid-loop, leaving either `undefined` entries or objects without `data`.

### Analysis
- The transmit queue is managed inside `EspruinoTools/core/serial.js:238-270`. When callbacks resolve out of order (common during Pico warm boots), the queue head is popped before `writeChunk` examines it, so `txItem` is `undefined` or its `data` property is missing.
- Once that happens, the writer executes `txItem.data.length` and throws the observed `TypeError`. The stack trace in the CLI crash matches this code path exactly.
- Adding a guard that skips empty entries and reschedules the drain loop prevents the crash without altering normal send behaviour; this mirrors the resilience in the Web IDE implementation.

### Fix Options
- Harness: no direct mitigation.
- EspruinoTools: apply the prototype guard (Issue 1 diff below) so the writer skips empty items and reschedules the drain loop.

## Issue 2 – CLI Iterator Crash

### Symptoms
- Running `espruino --port /dev/ttyACM0 -e "print('__TEST__')"` twice in succession causes the second invocation to throw `TypeError: Cannot read properties of undefined (reading 'type')` at `EspruinoTools/bin/espruino-cli.js:774`.

### Investigation
- The iterator helper captures `this` incorrectly inside the closure that resolves port metadata.
- After the first iteration, `this.iterate` references the outer scope; on the next loop the closure reads an undefined `port` object, feeding `undefined` into `getPortPath`.

### Root Cause
- The legacy IIFE pattern mutates `this` and loses context. When Pico tests recycle ports quickly, the iterator re-enters with stale state.

### Analysis
- In `EspruinoTools/bin/espruino-cli.js:773-835`, the iterator stores state on `this` (`this.ports`, `this.idx`). When `getPortPath` invokes its callback, `this` no longer refers to that object, so `this.idx` is `undefined` and the code passes a bogus port into `connect`.
- The resulting error (`TypeError: Cannot read properties of undefined (reading 'type')`) matches the CLI stack trace and occurs immediately on the second invocation of the CLI, as our reproduction shows.
- Replacing the IIFE with a closure-based state object (Issue 2 diff) keeps the iterator logic identical while removing the dependency on `this`, eliminating the crash.

### Fix Options
- Harness: continue to serialise CLI invocations; no code change needed.
- EspruinoTools: adopt the scoped state object shown in the Issue 2 diff so each iteration provides the next port reliably.

## Issue 3 – Post-reset Prompt Missing

### Symptoms
- Harness command `node scripts/run-tests-gordonV4.js --board PICO_R1_3 --port /dev/ttyACM0 --suites demo/getStarted` hangs after `reset();`.
- No `__RUNNER_READY__` banner; tests stall until a manual newline is injected.
- Manual `screen /dev/ttyACM0 115200` sessions confirm pressing Enter twice wakes the prompt immediately.

### Investigation
1. **Baseline failure** (`docs/PICO_invokeLog03.txt`): harness blocks post-reset and logs duplicated processor callback warnings.
2. **Fix 1** (`EspruinoTools/core/env.js`): guarding the connected processor removes the duplicate callback but not the hang.
3. **Manual console checks**: `screen` and `cat -v` confirm the device wakes once a newline is sent after reset.
4. **Verbose CLI traces**: with `--no-reset`, `getEspruinoPrompt` sends double Ctrl-C without retrying a newline, so Pico never responds.
5. **Fix 2 prototype** (`EspruinoTools/core/utils.js`): add an extra newline retry before falling back to Ctrl-C; harness logs show “No prompt yet - sending another newline to wake device”.
6. **Verification run** (`docs/PICO_invokeLog04.txt`): prompt retrieved automatically, suite completes; unrelated CLI TypeError persists (covered in Issue 2).

### Root Cause
- Pico’s USB CDC implementation ignores the initial Ctrl-C handshake. Without a retrying newline inside `getEspruinoPrompt`, the prompt stays hidden, mirroring the manual “press Enter twice” requirement.

### Analysis
- `EspruinoTools/core/utils.js:304-352` retrieves the prompt by sending a newline and waiting three seconds. If no prompt arrives, it immediately emits two Ctrl-C characters. On Pico, the first Ctrl-C is ignored and no newline follows, so the `>` prompt never appears.
- Harness logs (`docs/PICO_invokeLog03.txt`) and manual serial monitoring (`cat -v /dev/ttyACM0`) confirm the device responds as soon as another newline is sent, explaining why a manual Enter keypress recovers the prompt.
- Injecting a second newline (Issue 3A harness snippet) or adopting the retry logic (Issue 3B diff) aligns the automated flow with the manual sequence, allowing the CLI to see the prompt before tests run.

### Fix Options
- **Option 3A (Harness workaround)**: warm-up writes an extra newline after `reset();`, keeping `ENV_ON_CONNECT` disabled via harness config so the prompt handshake completes (`scripts/run-tests-gordonV4.js` warm-up snippet).
- **Option 3B (Upstream fix)**: merge the prompt-retry patch in `EspruinoTools/core/utils.js` so the CLI mirrors the harness workaround natively.

## Issue 4 – `ENV_ON_CONNECT` Loop on Pico

### Symptoms
- With default CLI settings, warm-up emits repeated “Unable to retrieve board information” messages when `ENV_ON_CONNECT` probes run before the prompt is ready.

### Investigation
- Logs show the Pico handshake spends time waiting for `process.env`, which the CLI requests automatically when `ENV_ON_CONNECT` is enabled.
- Combined with Issue 3’s prompt delay, the repeated probe adds several seconds to setup and can trigger harness timeouts.

### Root Cause
- Pico requires the prompt to be awake before `process.env` can return. Automatic environment fetches race with the wake-up sequence, so the CLI retries until the harness aborts.

### Analysis
- `EspruinoTools/core/env.js` calls `Espruino.Core.Utils.executeExpression("process.env")` right after connection; if the result is empty or times out, it logs “Unable to retrieve board information” and clears cached metadata.
- Pico often isn’t ready when the probe runs because `getEspruinoPrompt` (see Issue 3) falls back to double Ctrl-C without retrying a newline. Pico ignores the first Ctrl-C, so the prompt never appears and `process.env` returns nothing—this explains the error immediately after connect.
- After `reset();`, we send test code without the extra newline, leaving the board idle; subsequent `process.env` probes (triggered by `ENV_ON_CONNECT=true`) hit the same timeout and repeat the warning.
- Disabling `ENV_ON_CONNECT` stops the probe entirely, eliminating the spam. Alternatively, we can ensure the prompt is awake before probing—either via the harness newline workaround or the prototype `core/utils.js` retry logic described under Issue 3.

### Fix Options
- Harness: disable `ENV_ON_CONNECT` in the CLI layer (`cliLayer.cli.ENV_ON_CONNECT = false;`) until the upstream prompt fix lands.
- EspruinoTools: no code change proposed yet; revisit once Issue 3’s fix is upstream to see whether the automatic probe can be re-enabled.

## Reference Snippets

```js
// Issue 3A – Post-reset prompt handled in harness warm-up
E.init(() => {
  if (E.Config && typeof E.Config.set === 'function') {
    E.Config.set('ENV_ON_CONNECT', false);
  }
  Espruino.Core.Serial.write('\\n');
  // ... continue warm-up
});
```

```js
// Issue 4 – Disable ENV_ON_CONNECT in harness config layer
cliLayer.cli.ENV_ON_CONNECT = false;
```

## Prototype EspruinoTools Patches (Planned PRs)

### Issue 1 – Serial TX Queue Guard
```diff
--- EspruinoTools/core/serial.js (before)
+++ EspruinoTools/core/serial.js (after)
@@
           var txItem = connection.txDataQueue[0];
-          uart.writeProgress(txItem.maxLength - (txItem.data?txItem.data.length:0), txItem.maxLength);
-          connection.updateProgress(txItem.maxLength - (txItem.data?txItem.data.length:0), txItem.maxLength);
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

### Issue 2 – CLI Iterator Fix
```diff
--- EspruinoTools/bin/espruino-cli.js (before)
+++ EspruinoTools/bin/espruino-cli.js (after)
@@
     (function (ports, connect) {
       this.ports = ports;
       this.idx = 0;
       this.connect = connect;
       this.iterate = function() {
         if (this.idx>=ports.length) tasksComplete();
         else getPortPath(ports[this.idx++], function(path) {
           connect(path, this.iterate);
         });
       };
       this.iterate();
     })(args.ports, connect);
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

### Issue 3B – Prompt Retry Logic (Optional Upstream Change)
```diff
--- EspruinoTools/core/utils.js (before)
+++ EspruinoTools/core/utils.js (after)
@@
     var timeout = setTimeout(function() {
       console.log("Got "+JSON.stringify(receivedData));
       console.log("No Prompt found, got "+JSON.stringify(receivedData[receivedData.length-1])+" - issuing Ctrl-C to try and break out");
       Espruino.Core.Serial.write('\x03');
       hadToBreak = true;
       timeout = setTimeout(function() {
         console.log("Still no prompt - issuing another Ctrl-C");
         Espruino.Core.Serial.write('\x03');
         nextStep();
       },3000);
     },3000);
```

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

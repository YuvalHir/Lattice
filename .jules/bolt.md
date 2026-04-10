## 2024-05-18 - Avoid unnecessary object creation in frequent callbacks
**Learning:** In `TerminalWrapper.tsx`, `term.onData` instantiates a `new TextEncoder()` on every single keystroke/data event before converting the string to bytes. This causes unnecessary garbage collection and allocations on a very hot path.
**Action:** Lift the `TextEncoder` instantiation outside the `term.onData` callback so it is reused across terminal input events.

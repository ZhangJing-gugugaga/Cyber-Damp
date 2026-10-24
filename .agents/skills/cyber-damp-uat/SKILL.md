---
name: cyber-damp-uat
description: Validate the current native-icon Cyber Damp on Windows with CursorTouch Windows-MCP and honest sensory UAT.
---

# Cyber Damp native UAT

Read root AGENTS.md, docs/PRODUCT.md (including the accepted Win+D behavior),
docs/CURRENT-STATUS.md and docs/CARE-DESKTOP-UAT.md.
The old overlay, WorkerW takeover, icon hiding,
rope physics, desktop tool forwarding and dedicated previews were retired by
the user on 2026-10-25. Do not run their archived scripts or reactivate them.

1. Build the current application. Distinguish source, packaged build and installed build.
2. Use the project CursorTouch Windows-MCP. Snapshot and inspect before native input.
   Fallback: uvx --from windows-mcp==0.8.8 python scripts/windows-mcp-client.py <steps.json>.
3. For mutation tests, isolate save data with CD_UAT=1 and CD_UAT_DATA_DIR and constrain
   candidates with CD_NATIVE_PROBE_DIR. Never inspect document contents or launch unknown
   executables. Do not replace user saves or move existing icons. Read probe prerequisites.
4. Verify Explorer selection, double click, right click, box selection, drag/drop and keyboard
   remain native. Verify only supported folder/shortcut references change and restore exactly.
5. Verify capsule click, drag, transparent margins, application coverage, full-screen hiding,
   Win+D hiding and tray recall independently. Drag must not accidentally open care.
6. Verify care loading, object selection, wiping, release/blur/cancel, partial mask persistence,
   completion, harvesting, collection, purchases, pause/resume and quit restoration. Compare
   desktop appearance with the same object in care at native icon sizes.
7. Verify event triggers separately from pure rules: first batch, repeated startup, midnight
   while resident, sleep/wake, offline/default labels, pause and 240h immunity boundaries.
8. Record PASS only for observed results, otherwise FAIL or NOT TESTED. Measure startup,
   input/feedback and hidden CPU with machine/display conditions. User sensory approval is
   independent of automated checks. CDP diagnostics do not replace native input/screenshots.

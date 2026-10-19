---
name: cyber-damp-uat
description: Validate Cyber Damp on the real Windows desktop using CursorTouch Windows-MCP, native screenshots and input, and the user sensory UAT.
---

# Cyber Damp native UAT

Read `docs/REPAIR-PLAN.md` and the user's full UAT in `docs/UAT-SOURCE.md`.
Use the project `windows-mcp` MCP server. If the current client has not loaded
the project configuration, run `uvx --from windows-mcp==0.8.8 python
scripts/windows-mcp-client.py <steps.json>` to call the same server over stdio.
Do not replace native acceptance with CDP input or QA-window-only results.

1. Build and run the production desktop mode (no CD_QA or CD_NO_ATTACH).
2. Call Snapshot before native actions. Inspect its actual screenshot.
3. Use Move / Click / Shortcut for native input; retain screenshot/text evidence.
4. Verify normal windows fully cover the toy, native icons have correct artwork,
   all user/public desktop items exist, drag follows immediately, double click
   opens a real folder, blank desktop right-click works, and normal/forced exit
   restores Explorer within 500 ms without changing icon positions.
5. Inspect the complete 6-second opening and each requested visual/physical case.
6. Record PASS only for observed results. Use FAIL or NOT TESTED for missing
   features, unavailable audio/microphone or unobserved behavior.

CDP may provide read-only state assertions and captures between native actions.
Native screenshots are authoritative for layering and visible appearance.
Never read desktop document contents as part of testing, open unknown executables,
or alter the user's original desktop icon layout.

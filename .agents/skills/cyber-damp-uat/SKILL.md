---
name: cyber-damp-uat
description: Validate Cyber Damp on the real Windows desktop using CursorTouch Windows-MCP, native screenshots and input, and the user sensory UAT.
---

# Cyber Damp native UAT

Read the root `AGENTS.md` and the effective product decisions in
`docs/superpowers/specs/2026-10-21-experience-direction-and-plan.md` before acceptance.
The 2026-10-19 care design remains applicable where it does not conflict.
Use `docs/CARE-DESKTOP-UAT.md` for current requirements. `docs/REPAIR-PLAN.md`
and `docs/UAT-SOURCE.md` retain earlier context; superseded requirements do not
override the user's confirmed decisions. Keep historical evidence unchanged.
Use the project `windows-mcp` MCP server. If the current client has not loaded
the project configuration, run `uvx --from windows-mcp==0.8.8 python
scripts/windows-mcp-client.py <steps.json>` to call the same server over stdio.
Do not replace native acceptance with CDP input or QA-window-only results.

1. Build and run the production desktop mode (no CD_QA or CD_NO_ATTACH).
2. Call Snapshot before native actions. Inspect its actual screenshot.
3. Use Move / Click / Shortcut for native input; retain screenshot/text evidence.
   Verify single-click selection, blank-space clearing, Ctrl multi-selection and
   focus feedback before checking that double click still opens the real item.
4. Verify normal windows fully cover the toy, native icons have correct artwork,
   all user/public desktop items exist, drag follows immediately, double click
   opens a real folder, blank desktop right-click works, and normal/forced exit
   restores Explorer within 500 ms without changing icon positions.
5. Inspect the complete 3–5-second startup replay required by the current confirmed
   design, plus each applicable visual/physical case. Check actual behavior rather
   than treating an old comment or previous UAT result as a current pass.
6. Check the unified collapsible desktop controls and game-style shop/settings,
   plus the applicable mildew/shrink/curl/wrinkle samples. The current occlusion
   ceiling is 90%, with recognizability at native size still required. User-accepted
   performance is not reopened as a blanket optimization gate.
7. Record PASS only for observed results. Use FAIL or NOT TESTED for missing
   features, unavailable audio/microphone or unobserved behavior.

CDP may provide read-only state assertions and captures between native actions.
Native screenshots are authoritative for layering and visible appearance.
Never read desktop document contents as part of testing, open unknown executables,
or alter the user's original desktop icon layout.

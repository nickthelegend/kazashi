# Testing

All numbers below come from runs on Oct 24, 2026 (MacBook, Node 26.5, IWSDK 1.1.0-rc.2, IWER via the IWSDK
managed headless Chromium). Raw results: [`e2e-results/`](e2e-results). No mocks: the e2e drives IWER's emulated
hands and headset through the app's real systems; the only page hook (`window.__kazashi`) is read-only.

## Counts

| Suite | Where | Tests | Result |
|---|---|---:|---|
| Rasteriser, normalisation, IoU | `packages/core/test/silhouette.test.ts` | 9 | pass |
| Hold-to-ink tracker | `packages/core/test/match.test.ts` | 5 | pass |
| Daily silhouette (UTC seed) | `packages/core/test/daily.test.ts` | 3 | pass |
| Take recorder + serialiser round trip | `packages/core/test/take.test.ts` | 4 | pass |
| Room reading (unlabelled planes) | `packages/core/test/room.test.ts` | 6 | pass |
| The cast: 25 reachability + 25 distinctness + structure + report | `packages/core/test/bestiary.test.ts` | 52 | pass |
| **Unit total** | `cd packages/core && npm test` | **79** | **79 pass** |
| e2e Quest 3 hands, sunlit_living_room | `packages/app/e2e/quest.mjs` | 7 steps | 7 pass, 0 console errors |
| e2e wall-less custom room (engawa) | `packages/app/e2e/wallless.mjs` | 4 steps | 4 pass, 0 console errors |
| e2e Meta VR Glasses (gaze + hands, FoV) | `packages/app/e2e/glasses.mjs` | 6 steps | 6 pass, 0 console errors |
| Perf: 600-frame pose sweep | `packages/app/e2e/perf.mjs` | 1 | within budget |

## Gates (spec) vs measured

| Gate | Spec | Measured |
|---|---|---|
| Authored pose scores itself | ≥ 0.80 | 1.00 exact; ≥ 0.813 for every pose with σ = 2 mm Gaussian noise on all 25 joints (12 trials). With σ = 3 mm the minimum is 0.761 (reported, not gated) |
| Pose vs every other creature | ≤ 0.45 | max 0.450 over all 600 off-diagonal pairs |
| Hands-only, cold load → act 1 complete | record actions and seconds | **5 hand actions, 32.8 s** (storage cleared, page reloaded; one pose per card; each card inks 2.0–2.5 s after the hand moves; the rest is the 4 s pause before the next card). Entering XR is the one browser tap |
| Lantern pinch-grab moves the shadow scale | changes | lantern carried 0.195 m toward the wall: wall distance 1.605 → 1.410 m, shadow size 0.694 → 0.610 m |
| Poke "hint" | works | `Puzzle.hintShown` false → true (poke with index fingertip) |
| Palm-up menu | visible | `WristMenu.open` true 37 ms after the palm turned up |
| Theatre | card to wall, curtain, take saved, restored after reload | slide projected → 1 creature on stage; curtain → recording; curtain → take saved (6.9 s); reload → `Theatre.takes` 1, same take id |
| Wall-less room | shoji within 5 s, pinch, puzzle completes | 0 walls detected; shoji offered at 5.08 s after session start (the design waits 5 s for a wall), placed by one pinch, first puzzle inked on it in 1.2 s |
| Glasses | same completion via gaze + pinch; target and ring inside the mask | glasses layout turns on automatically when gaze-tracking is granted; gaze + pinch on `Glasses_next` advanced the card; gaze + pinch on the wrist menu toggled high contrast; card (0°, −18°), ring (4°, 9°) and gaze buttons (±5°, −27°) inside 37° / +25° / −43° — see `e2e-results/glasses-fov.png` |
| CPU frame time p95 (ECS + render submit) | ≤ 4 ms | **1.8 ms** (p50 1.2 ms) over 600 frames |
| Draw calls | ≤ 60 (budget 100) | **max 46** (p50 44) |
| Triangles | ≤ 100k | **max 43.1k** |
| Console errors | 0 | 0 in every e2e run |

Frame numbers are desktop Chromium + IWER, not Quest. One shadow scoring tick costs 0.1–0.2 ms.

## Unverified on hardware

Real tracking jitter on held poses, crossed-hand occlusion, thumb microgestures (`gamepad.buttons[5/6]`), 72 fps on
Quest 3, plane detection in real rooms, Quest browser permission prompts. These need a device pass.

## Clips (test recordings)

Recorded with CDP screencast from the managed browser while the e2e drove the emulated hands; captions are separate
overlay strips (no output is edited). `grokbot/videos/kazashi/`:

| File | Length | Shows |
|---|---:|---|
| `kazashi-whoa.mp4` | 22.1 s | hand rises, dog shadow inks (6.1 s), trots and leaps the corner (11.1 s), heron inks (15.9 s) and flies onto the ceiling (20.2 s) |
| `kazashi-theatre.mp4` | 26.3 s | two slides projected onto the wall, curtain starts a take, a rabbit performs, curtain saves, replay |
| `kazashi-shoji.mp4` | 21.1 s | wall-less engawa, shoji offered at 4.9 s, pinch to place, bird inks and flies |

The whoa clip is preceded by an unrecorded pre-roll (`e2e/preroll.mjs`) that plays act 1 and the heron so both are
in the cast, then switches to Free shadows from the wrist menu.

## Confusion matrix (25 × 25)

Row: the authored pose run through the live scorer. Column: the target it is scored against (IoU after centroid/area normalisation, best of ±10° roll). Diagonal: exact pose. "σ2" / "σ3" are the lowest self-scores over 12 trials with 2 mm / 3 mm Gaussian noise on every joint (σ2 is gated at ≥ 0.80; σ3 is reported only).

| pose \ target | tori | inu | usagi | hebi | kirin | sagi | kani | ga | rakud | zou | kumo | kurag | washi | koi | tsuba | tako | niwat | kamom | tonbo | kawau | ryu | kaeru | kabut | fukur | sakan | σ2 | σ3 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| tori | 1.00 | 0.43 | 0.42 | 0.30 | 0.40 | 0.22 | 0.07 | 0.28 | 0.40 | 0.38 | 0.31 | 0.41 | 0.10 | 0.29 | 0.42 | 0.41 | 0.21 | 0.18 | 0.34 | 0.40 | 0.05 | 0.24 | 0.10 | 0.14 | 0.38 | 0.88 | 0.79 |
| inu | 0.41 | 1.00 | 0.36 | 0.45 | 0.33 | 0.12 | 0.15 | 0.42 | 0.31 | 0.36 | 0.40 | 0.44 | 0.24 | 0.40 | 0.44 | 0.38 | 0.17 | 0.30 | 0.36 | 0.29 | 0.04 | 0.34 | 0.22 | 0.29 | 0.31 | 0.90 | 0.84 |
| usagi | 0.42 | 0.36 | 1.00 | 0.26 | 0.43 | 0.29 | 0.02 | 0.20 | 0.36 | 0.29 | 0.22 | 0.40 | 0.06 | 0.25 | 0.27 | 0.37 | 0.29 | 0.08 | 0.25 | 0.38 | 0.00 | 0.11 | 0.10 | 0.06 | 0.33 | 0.87 | 0.82 |
| hebi | 0.29 | 0.44 | 0.26 | 1.00 | 0.25 | 0.04 | 0.23 | 0.34 | 0.19 | 0.22 | 0.42 | 0.36 | 0.33 | 0.39 | 0.33 | 0.42 | 0.08 | 0.32 | 0.44 | 0.28 | 0.01 | 0.27 | 0.37 | 0.31 | 0.16 | 0.86 | 0.87 |
| kirin | 0.39 | 0.33 | 0.42 | 0.25 | 1.00 | 0.24 | 0.02 | 0.23 | 0.37 | 0.37 | 0.29 | 0.42 | 0.04 | 0.26 | 0.35 | 0.31 | 0.25 | 0.09 | 0.41 | 0.24 | 0.12 | 0.17 | 0.10 | 0.17 | 0.44 | 0.89 | 0.85 |
| sagi | 0.23 | 0.12 | 0.28 | 0.04 | 0.23 | 1.00 | 0.01 | 0.07 | 0.36 | 0.26 | 0.07 | 0.20 | 0.01 | 0.10 | 0.10 | 0.19 | 0.39 | 0.02 | 0.05 | 0.26 | 0.08 | 0.06 | 0.00 | 0.04 | 0.26 | 0.85 | 0.80 |
| kani | 0.07 | 0.15 | 0.02 | 0.22 | 0.02 | 0.02 | 1.00 | 0.25 | 0.08 | 0.08 | 0.20 | 0.09 | 0.42 | 0.23 | 0.19 | 0.10 | 0.00 | 0.32 | 0.19 | 0.05 | 0.13 | 0.38 | 0.37 | 0.43 | 0.04 | 0.84 | 0.80 |
| ga | 0.27 | 0.41 | 0.20 | 0.34 | 0.23 | 0.07 | 0.26 | 1.00 | 0.29 | 0.26 | 0.38 | 0.21 | 0.32 | 0.33 | 0.32 | 0.24 | 0.03 | 0.24 | 0.35 | 0.25 | 0.08 | 0.40 | 0.27 | 0.37 | 0.19 | 0.88 | 0.83 |
| rakuda | 0.40 | 0.30 | 0.36 | 0.19 | 0.36 | 0.36 | 0.08 | 0.28 | 1.00 | 0.35 | 0.19 | 0.27 | 0.08 | 0.14 | 0.34 | 0.19 | 0.19 | 0.09 | 0.25 | 0.27 | 0.11 | 0.25 | 0.11 | 0.15 | 0.39 | 0.92 | 0.85 |
| zou | 0.37 | 0.36 | 0.30 | 0.22 | 0.38 | 0.26 | 0.08 | 0.27 | 0.35 | 1.00 | 0.32 | 0.41 | 0.13 | 0.19 | 0.36 | 0.25 | 0.34 | 0.14 | 0.39 | 0.23 | 0.08 | 0.21 | 0.09 | 0.20 | 0.42 | 0.85 | 0.83 |
| kumo | 0.31 | 0.40 | 0.23 | 0.42 | 0.30 | 0.06 | 0.20 | 0.38 | 0.20 | 0.31 | 1.00 | 0.38 | 0.21 | 0.43 | 0.39 | 0.42 | 0.14 | 0.22 | 0.45 | 0.28 | 0.06 | 0.31 | 0.21 | 0.39 | 0.25 | 0.87 | 0.83 |
| kurage | 0.41 | 0.45 | 0.39 | 0.37 | 0.43 | 0.19 | 0.09 | 0.22 | 0.27 | 0.41 | 0.38 | 1.00 | 0.13 | 0.33 | 0.38 | 0.44 | 0.28 | 0.15 | 0.40 | 0.28 | 0.04 | 0.19 | 0.14 | 0.20 | 0.41 | 0.85 | 0.83 |
| washi | 0.10 | 0.24 | 0.06 | 0.33 | 0.05 | 0.01 | 0.43 | 0.31 | 0.08 | 0.14 | 0.22 | 0.13 | 1.00 | 0.22 | 0.18 | 0.16 | 0.01 | 0.39 | 0.24 | 0.09 | 0.07 | 0.31 | 0.43 | 0.36 | 0.04 | 0.84 | 0.78 |
| koi | 0.29 | 0.39 | 0.25 | 0.38 | 0.27 | 0.10 | 0.23 | 0.33 | 0.14 | 0.19 | 0.42 | 0.33 | 0.21 | 1.00 | 0.32 | 0.43 | 0.09 | 0.22 | 0.34 | 0.35 | 0.03 | 0.28 | 0.23 | 0.36 | 0.19 | 0.87 | 0.82 |
| tsubame | 0.40 | 0.44 | 0.28 | 0.33 | 0.35 | 0.10 | 0.18 | 0.32 | 0.35 | 0.35 | 0.39 | 0.37 | 0.18 | 0.32 | 1.00 | 0.38 | 0.16 | 0.25 | 0.42 | 0.29 | 0.19 | 0.44 | 0.11 | 0.28 | 0.40 | 0.87 | 0.84 |
| tako | 0.40 | 0.38 | 0.36 | 0.44 | 0.31 | 0.18 | 0.11 | 0.25 | 0.19 | 0.25 | 0.40 | 0.44 | 0.16 | 0.43 | 0.38 | 1.00 | 0.21 | 0.18 | 0.38 | 0.36 | 0.02 | 0.23 | 0.14 | 0.26 | 0.24 | 0.88 | 0.85 |
| niwatori | 0.21 | 0.18 | 0.29 | 0.08 | 0.26 | 0.39 | 0.00 | 0.03 | 0.21 | 0.35 | 0.14 | 0.29 | 0.01 | 0.09 | 0.16 | 0.21 | 1.00 | 0.05 | 0.13 | 0.16 | 0.07 | 0.08 | 0.00 | 0.06 | 0.37 | 0.86 | 0.81 |
| kamome | 0.17 | 0.30 | 0.08 | 0.32 | 0.09 | 0.02 | 0.32 | 0.24 | 0.09 | 0.15 | 0.23 | 0.15 | 0.39 | 0.22 | 0.25 | 0.17 | 0.05 | 1.00 | 0.23 | 0.13 | 0.06 | 0.41 | 0.32 | 0.28 | 0.12 | 0.90 | 0.86 |
| tonbo | 0.33 | 0.35 | 0.25 | 0.44 | 0.42 | 0.05 | 0.20 | 0.36 | 0.24 | 0.38 | 0.43 | 0.39 | 0.23 | 0.34 | 0.43 | 0.37 | 0.12 | 0.23 | 1.00 | 0.25 | 0.16 | 0.28 | 0.17 | 0.31 | 0.39 | 0.86 | 0.84 |
| kawauso | 0.40 | 0.29 | 0.40 | 0.28 | 0.24 | 0.26 | 0.05 | 0.26 | 0.26 | 0.23 | 0.27 | 0.28 | 0.09 | 0.34 | 0.28 | 0.36 | 0.16 | 0.13 | 0.25 | 1.00 | 0.00 | 0.16 | 0.08 | 0.12 | 0.19 | 0.86 | 0.83 |
| ryu | 0.05 | 0.04 | 0.00 | 0.01 | 0.13 | 0.08 | 0.12 | 0.08 | 0.11 | 0.07 | 0.06 | 0.05 | 0.06 | 0.02 | 0.19 | 0.02 | 0.07 | 0.05 | 0.16 | 0.00 | 1.00 | 0.18 | 0.00 | 0.10 | 0.24 | 0.88 | 0.84 |
| kaeru | 0.23 | 0.35 | 0.11 | 0.28 | 0.17 | 0.06 | 0.37 | 0.40 | 0.24 | 0.21 | 0.31 | 0.18 | 0.31 | 0.27 | 0.44 | 0.23 | 0.07 | 0.40 | 0.28 | 0.16 | 0.18 | 1.00 | 0.20 | 0.43 | 0.19 | 0.86 | 0.83 |
| kabuto | 0.10 | 0.22 | 0.10 | 0.37 | 0.09 | 0.00 | 0.37 | 0.27 | 0.11 | 0.09 | 0.21 | 0.14 | 0.43 | 0.23 | 0.11 | 0.14 | 0.00 | 0.33 | 0.17 | 0.08 | 0.00 | 0.21 | 1.00 | 0.29 | 0.05 | 0.86 | 0.80 |
| fukurou | 0.13 | 0.29 | 0.06 | 0.31 | 0.17 | 0.05 | 0.44 | 0.38 | 0.15 | 0.20 | 0.39 | 0.20 | 0.36 | 0.36 | 0.28 | 0.25 | 0.06 | 0.29 | 0.30 | 0.12 | 0.10 | 0.43 | 0.30 | 1.00 | 0.13 | 0.81 | 0.79 |
| sakana | 0.36 | 0.31 | 0.33 | 0.16 | 0.44 | 0.26 | 0.04 | 0.19 | 0.39 | 0.42 | 0.24 | 0.40 | 0.04 | 0.19 | 0.40 | 0.24 | 0.37 | 0.12 | 0.39 | 0.18 | 0.24 | 0.18 | 0.04 | 0.12 | 1.00 | 0.88 | 0.76 |

Max off-diagonal: 0.450. Min self-score at σ = 2 mm: 0.813; at σ = 3 mm: 0.761.

# Devpost submission draft: Kazashi

Meta VR Start Developer Competition 2026. Fields follow the Devpost form (RULES.md §10). The team's Representative
owns, edits and submits this; Nick is a non-Representative member.

| Field | Draft |
|---|---|
| Name | Kazashi |
| Tagline (≤ 140) | Hold your hands to a paper lantern: their shadow on your real wall becomes a creature, then performs your shadow play. |
| Track | Entertainment (interactive storytelling, shadow theatre) |
| Division | New Experience (repo created Oct 24, 2026, inside the window) |
| Platform | Immersive Web SDK (WebXR), submitted as a public URL (GitHub Pages from the Representative's repo) |
| Special award target | Boldest Original Concept |
| Target launch date | TBD by the Representative |
| Video | `grokbot/videos/kazashi/kazashi-film.mp4` (under 3:00, 1920×1080, IWER footage, the app's own sound; shot list in `kazashi-film.md`). Upload public to YouTube or Vimeo |

## Nov 15 update

- Every creature is now a real animal (25 procedural profile bodies with jointed legs and a walk that keeps its feet on
  the ground). The card, slides and menu meet a cap-height bar of ≥ 18 mm per metre of viewing distance.
- **Muse (Meta Model API)** writes 3–4 lines of narration for your take. It runs through `packages/proxy`, a Vercel
  function that holds the key, allows one model and one route, and rate-limits. Replays show the lines as paper
  captions. Without it, the app says "AI narration unavailable" and works fully (the "take it away" test).
- 138 core + 6 proxy tests and all five emulator suites pass (Nov 15). See TESTING.md and docs/JUDGE-NOV15.md.

## Build handoff (Oct 25)

83 core unit tests, package typechecks and both production builds pass. All existing clips fully decode, including
`../../videos/kazashi/kazashi-whoa.mp4` (22.13 s). This pass fixes one-hand chapter progression and complete
cast-book browsing. The expanded Quest/Glasses e2e suite must be rerun outside the current process-inspection
sandbox before describing these edits as emulator-verified. The figures in the criteria table are the **Oct 24
baseline**. No deployment or submission has been performed.

## Description (about 450 words)

**Inspiration.** Everyone has made a dog with their hand in a beam of light. Kazashi (翳し, "holding your hand up to
the light") turns that childhood moment into a mixed-reality shadow theatre that only works with tracked hands and a
real wall.

**What it does.** A paper lantern appears on your real desk and the room dims to dusk. Hold a hand between the lantern
and your wall and its shadow falls there, cast by the lantern's own light. A kamishibai card shows a silhouette; shape
it with your hand, hold it, and as the vermilion ring fills the shadow inks into a living creature. The ink grows it
an eye and legs, it peels off the wall, trots to the end of your real wall and leaps the corner onto the next one.
Two hands make a heron that flies up the wall onto your ceiling. Three acts teach one-hand shapes, two-hand shapes and
how the lantern's distance changes the shadow (pinch-grab the lantern to make giants or tiny things). Free shadows
answers whatever you make with the nearest of ten more creatures, and a daily silhouette, seeded from the UTC date,
brings you back. In the theatre you pinch glass slides of your cast and project them onto the wall, then part your
hands like a curtain and close them to record a 20-second play; takes replay through the same shadows and creatures.

**Narration.** After a take, Muse (`muse-spark-1.3`) writes three or four lines about what actually happened on stage (who entered, which way they went), and the replay shows them as paper captions on the wall.

**How we built it.** IWSDK on WebXR. The shadow is analytic: 25 joints per hand become tapered capsules and a palm
polygon projected through the lantern onto the wall plane, rasterised into 64 × 64 bits at 15 Hz and scored by IoU
after normalising position and size, with ±10° of roll. The same geometry casts the lantern's real-time shadow, so the
shadow you see is the shape being scored. Detected planes carry no labels on Quest, so Kazashi reads the room by
orientation, height and size: a desk for the lantern, a wall for the play, the ceiling for anything with wings. No
wall: one pinch stands a shoji screen. Every effect is drawn on planes; passthrough is never read or altered. The 25
silhouettes were authored by playing 1,212 hand recipes in the IWER emulator and choosing a set whose shadows are
mutually distinct, then running each one through the same rasteriser as live hands. Audio is synthesised (koto-like
plucks, paper rustle, ink bleed). Each creature is a procedural profile animal (head, ears or beak, tail, jointed legs) posed on the CPU; the walk cycle is driven by distance so the planted foot holds to a brush line it paints on your wall. Art direction is washi and sumi.

**Accessibility and comfort.** Seated, within two feet. Tolerance slider, one-hand mode, high-contrast silhouettes,
pictograms and a ghost hand instead of text. Meta VR Glasses get a layout inside their narrower view with gaze + pinch.

**What's next.** A device pass on Quest 3 (held-pose jitter, 72 fps), shareable takes, and a seasonal cast.

## How hand interactions are implemented (optional field)

- Shadow: WebXR hand joints (25 per hand) → analytic capsule/polygon raster, 15 Hz, 5-sample smoothing, 50 ms joint
  smoothing, 1.2 s hold, 150 ms dropout tolerance.
- Buttons: `PokeInteractable` paper tabs (≥ 3 cm) on the lantern stand; `RayInteractable` for hand ray + pinch; gaze
  + pinch on Meta VR Glasses (IWSDK `GazeSystem`). Quest 3 has no eye tracking and Kazashi has no head-gaze.
- Lantern and slides: `OneHandGrabbable` with pinch. Wrist menu: palm-up detection from joints. Curtain gesture: both
  palms facing, apart > 42 cm then together < 14 cm within 2.5 s. Thumb microgestures (hand gamepad buttons 5/6) for
  previous/next, unverified on hardware; the poke tab always works.

## Mapping to the judging criteria (25% each)

| Criterion | Kazashi |
|---|---|
| Innovation & Creativity | Your hand pose is the content, cast onto your own wall by a virtual lantern. Daily silhouette, growing cast, stars and takes drive repeat use. |
| Experience Design | Seated, hands-only from the first second; first success in seconds (open hand = bird) with a ghost hand, no wall of text. Passthrough is purposeful: the desk holds the lantern, the wall is the stage, the ceiling is the sky. FoV-aware glasses layout. |
| Technical Implementation | Analytic shadow raster with no GPU readback (0.1–0.2 ms/tick); unlabelled plane classification; anchored lantern; one 512² shadow map; depth-only hand occluders; vertex-shader creature rigs; IndexedDB takes. Oct 24 emulator baseline: CPU p95 1.8 ms, ≤ 46 draw calls, 43k triangles. |
| Polish & Presentation | Washi/sumi art direction, ink-bleed transition with a vermilion wet edge, kamishibai cards, synthesised koto and paper sounds, an honest emulator video. |
| Boldest Original Concept | Hand shadows cannot exist without tracked hands and a real wall in your real room; on a flat screen it falls apart. |

## Honesty notes for the form

- All footage so far is from the IWER emulator (synthetic rooms, emulated hands), labelled on screen. Replace or
  supplement with Quest 3 capture after a device pass.
- Unverified on hardware: held-pose jitter, crossed-hand occlusion, microgestures, 72 fps, real-room wall detection.
- No AI-generated video. Captions are overlays; app output is not edited.
- The 25 starting silhouettes were chosen by an automated search for distinctness. The Representative authors the
  final 15 puzzles and the bestiary with the pose tool and commits them from their own account.

## What the Representative must do

1. Be eligible (18+, eligible country, Meta account with Developer Access) and a VR Start member with the forum
   flair at submission. Join the Devpost hackathon, create the team, add Nick as a non-Representative member.
2. Before submission, run `npm run test:e2e` locally (both profiles, performance and wall-less rooms) and review the current changes. Genuinely own part of the build: author the 15 puzzle poses and the 10-creature bestiary with the pose tool
   (`packages/app/e2e/capture-poses.mjs` in the emulator, or real hands on a Quest), playtest, write the description
   and narration. Commits from their own account.
3. Own the public repo and GitHub Pages, upload the video (public, under 3:00) and submit (Track Entertainment,
   Division New Experience) by **Nov 17 18:00 UTC** (deadline Nov 18 20:00 UTC). Freeze the build until ~Dec 11.
4. With a Quest 3/3S: one device pass (held poses, 72 fps, wall detection in their room).

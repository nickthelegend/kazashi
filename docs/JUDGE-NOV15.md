# Kazashi: a headset judge's pass (Nov 15, 2026)

Judged as a Meta VR Start judge would see it: from the user's eye in the IWER emulator (Quest 3 profile, synthetic
living room, emulated hands), against the four equal criteria. No score inflation; scores are what the build earns now.

## Before (the Oct 24–25 build, from its emulator clips and code)

Frames from `videos/kazashi/kazashi-whoa.mp4` and `kazashi-theatre.mp4`, plus the UI sizes in the source.

| Criterion | Score | Why |
|---|---:|---|
| Innovation & Creativity | 7.5 | Your hand's shadow on your real wall becoming a creature is original and only works in MR with tracked hands. |
| Experience Design | 5.0 | Hands-only and seated, with a good ghost-hand onboarding. But the card, slides and menu glyphs are unreadable at headset distance, and the payoff (the creature) does not read as an animal. |
| Technical Implementation | 7.0 | Analytic shadow raster, unlabelled plane classification, anchored lantern, takes in IndexedDB, 83 tests. Creature rig = rotating finger groups of the hand mesh. |
| Polish & Presentation | 4.5 | The "dog" is a black stool on four stick legs; the ink-in breaks into red speckles; 800×800 clips with no sound and no film. |
| **Mean** | **6.0** | |

UI text measured from the code (cap height per metre of viewing distance; the gate is 18 mm/m):

| Element | Before |
|---|---:|
| Target card hint (26 px on a 640 px card, 0.58 m wide, ~2.2 m away) | 7.0 mm/m |
| Cast slide name (16 px on a 150 px slide, 7.5 cm wide, ~0.55 m away) | 9.6 mm/m |
| Wrist-menu label (46 px on a 4.2 cm tab, ~0.4 m) — most tabs had no words at all | 26 mm/m |
| Toast (52 px on a 0.42 m strip, 0.7 m) | 21 mm/m |

### The five biggest problems

1. **The creature does not read as an animal.** It was the hand shadow itself plus four sticks: a stool. This is the
   whoa, and it under-sells the concept.
2. **Text is unreadable from the seat.** The kamishibai card's hint is at 39 % of the gate, and the slides at 53 %.
   Most menu tabs were bare pictograms (minus, plus, eye, half-circle) with no words.
3. **The ink-in is noisy, not smooth.** A high-frequency noise front makes the wet edge a spray of red specks.
4. **The theatre has no payoff.** A replay of shadows moving, with no story, captions or sound on screen.
5. **No film and no fresh evidence.** Only 800×800 test clips. The e2e suite has not run since Oct 24 (the last session's
   sandbox denied `ps`).

### What I fix

1. A procedural animal body for each of the 25 creatures (head, ears or beak, body, tail, jointed legs, wings, fins).
   The shadow first inks as itself, then morphs into the animal. Walkers stride on a brush ground line with the planted
   foot held to it.
2. A bigger card sized by viewing distance (≥ 18 mm/m), bigger slides showing the animal, and menu tabs with words.
3. A smooth, low-frequency ink bleed with a soft feathered front and a thin vermilion wet edge.
4. **Muse narration** for your take (`muse-spark-1.3` through a key-holding proxy), played as paper captions on the wall
   (captions only; the browser-speech idea was dropped under the Chatterbox-only voice rule).
5. Re-run the emulator suites and record a 1920×1080 film with the app's own sound.

## After (Nov 15 build, judged from the new film and emulator frames)

| Criterion | Before | After | Why |
|---|---:|---:|---|
| Innovation & Creativity | 7.5 | 8.0 | The shadow now visibly *becomes* the animal, and Muse narrates the play you staged, from what actually happened. Still one core idea, extended rather than new. |
| Experience Design | 5.0 | 7.0 | Every text element reads from the seat (card 17.9–18.6 mm/m, caption 31, slides 21, menu 20); menu tabs have words; the card shows what you will get. Held back by: a 1.6 m card is a lot of wall, a pinch on the slide strip can pick the neighbouring slide (it happened in the film: a rabbit instead of the dog), and nothing is tested on a headset. |
| Technical Implementation | 7.0 | 8.0 | 25 rigged bodies with forward kinematics and ground contact (tested: planted-foot slip < 20 %), a key-holding proxy with model/route allow-list and rate limits, 138 + 6 tests, five emulator suites green, CPU p95 1.3–1.6 ms. Draw calls now sit exactly at the 60 gate. |
| Polish & Presentation | 4.5 | 7.0 | Animals with ink-in, brush ground lines, eye cut-outs; a 2:44 1080p film with the app's own sound and a live Muse payoff. Still emulator footage (no headset capture), the 2D intro card is small in frame, and the sound is sparse. |
| **Mean** | **6.0** | **7.5** | |

### What is left (honest)

1. **No headset pass.** Held-pose jitter, 72 fps, real wall detection and the Quest browser's permission prompts are
   unverified. The film is IWER footage, labelled as such.
2. **Draw calls at the gate (60).** The blot, the brush line and the bigger card added 14. On Quest this needs a
   profile pass. The easy wins are merging the blot into the body mesh and drawing the stroke into the wall's catcher.
3. **Slide pinch precision.** At 12 cm slides on a 14 cm pitch, the emulated pinch sometimes grabs the neighbour.
   Larger spacing or a pinch-time highlight would help.
4. **Narration needs a deployed proxy.** `packages/proxy` is ready (README has the steps). Until it is deployed,
   the public build says "AI narration unavailable: setup required".
5. **Spoken narration is deliberately absent.** Spoken voice must be Chatterbox (Nick's rule), and Muse's lines are
   generated live, so they are captions only.

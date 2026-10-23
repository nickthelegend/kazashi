/**
 * The shadow puzzles. Shows today's target on a kamishibai card on your wall,
 * scores the live shadow against it at 15 Hz, fills the match ring while you
 * hold the shape, and inks the creature when the hold completes.
 */
import { type CreatureDef, FREE_BESTIARY, puzzles, targetHands, targetShape } from '@kazashi/core/bestiary';
import { dailyPick } from '@kazashi/core/daily';
import { fromLightFrame, imageToWall } from '@kazashi/core/lightframe';
import { MatchTracker, thresholdForTolerance } from '@kazashi/core/match';
import { toSurface } from '@kazashi/core/room';
import { createSystem, type Entity, Vector3 } from '@iwsdk/core';
import { app, recordStar, setSettings } from './app.js';
import { sound } from './audio.js';
import { Modes, Puzzle, PuzzleStates } from './components.js';
import type { CreatureSystem } from './creature-system.js';
import { shadow } from './hand-system.js';
import { GhostHands, MatchRing, TargetCard } from './hud.js';
import { saveProgress } from './storage.js';

type Mode = (typeof Modes)[keyof typeof Modes];

export class PuzzleSystem extends createSystem({ puzzle: { required: [Puzzle] } }) {
  creatures!: CreatureSystem;
  private entity!: Entity;
  private readonly tracker = new MatchTracker();
  private readonly card = new TargetCard();
  private readonly ring = new MatchRing();
  private readonly ghost = new GhostHands();
  private seq = -1;
  private def: CreatureDef | null = null;
  private freeId = '';
  private startedAt = 0;
  private hinted = false;
  private advanceAt = Infinity;
  private time = 0;
  private lastNote = '';
  private readonly v = new Vector3();
  private readonly n = new Vector3();
  private readonly ghostHands = [new Float32Array(75), new Float32Array(75)];
  private readonly mbtn = { left: [false, false], right: [false, false] };

  init(): void {
    this.entity = this.world.createEntity();
    this.entity.addComponent(Puzzle, { mode: app.progress.onboarded ? Modes.act : Modes.onboarding, act: 1, index: 0 });
    this.scene.add(this.card.mesh, this.ring.mesh, this.ghost.root);
    app.card = this.card.mesh;
    this.cleanupFuncs.push(
      app.events.on('button', (a) => this.onButton(a)),
      app.events.on('wall', () => this.refreshCard()),
      app.events.on('settings', () => {
        this.tracker.setThreshold(thresholdForTolerance(app.settings.tolerance));
        this.refreshCard();
      }),
    );
    this.tracker.setThreshold(thresholdForTolerance(app.settings.tolerance));
    const onEnd = () => {
      this.card.mesh.visible = false;
      this.ring.mesh.visible = false;
      this.ghost.root.visible = false;
    };
    this.xrManager.addEventListener('sessionend', onEnd);
    this.cleanupFuncs.push(() => this.xrManager.removeEventListener('sessionend', onEnd));
    this.load();
  }

  get mode(): Mode {
    return this.entity.getValue(Puzzle, 'mode') as Mode;
  }

  /** The list the current mode walks through. */
  private list(): CreatureDef[] {
    const act = this.entity.getValue(Puzzle, 'act') as 1 | 2 | 3;
    let l = puzzles(act);
    if (app.settings.oneHand) l = l.filter((d) => d.hands === 1);
    return l;
  }

  setMode(mode: Mode, act?: number): void {
    this.entity.setValue(Puzzle, 'mode', mode);
    if (act) this.entity.setValue(Puzzle, 'act', act);
    this.entity.setValue(Puzzle, 'index', 0);
    this.load();
  }

  private load(): void {
    const mode = this.mode;
    this.tracker.reset();
    this.hinted = false;
    this.advanceAt = Infinity;
    this.startedAt = this.time;
    this.freeId = '';
    if (mode === Modes.theatre || mode === Modes.free) {
      this.def = null;
    } else if (mode === Modes.daily) {
      const ids = [...app.defs.values()].filter((d) => !app.settings.oneHand || d.hands === 1).map((d) => d.id);
      this.def = app.defs.get(dailyPick(ids, new Date()).id) ?? null;
    } else {
      const l = this.list();
      const i = Math.max(0, Math.min(l.length - 1, this.entity.getValue(Puzzle, 'index') as number));
      this.entity.setValue(Puzzle, 'index', i);
      this.def = l[i] ?? null;
    }
    this.entity.setValue(Puzzle, 'targetId', this.def?.id ?? '');
    this.entity.setValue(Puzzle, 'state', this.def || mode === Modes.free ? PuzzleStates.searching : PuzzleStates.idle);
    this.entity.setValue(Puzzle, 'hintShown', false);
    this.entity.setValue(Puzzle, 'threshold', this.tracker.opts.threshold);
    // Onboarding shows the ghost hand straight away: no wall of text.
    this.setGhost(mode === Modes.onboarding && !!this.def);
    this.refreshCard();
  }

  private label(): string {
    const mode = this.mode;
    if (mode === Modes.daily) return `Today · ${new Date().toISOString().slice(0, 10)}`;
    if (mode === Modes.free) return 'Free shadows';
    const act = this.entity.getValue(Puzzle, 'act') as number;
    const i = (this.entity.getValue(Puzzle, 'index') as number) + 1;
    return mode === Modes.onboarding ? `First light · ${i}/3` : `Act ${act} · ${i}/${this.list().length}`;
  }

  private sizeNote(): string {
    const s = this.def?.size;
    if (!s || !shadow.valid) return '';
    const r = this.sizeRatio();
    if (r < s.min) return 'Bigger: hands nearer the lantern';
    if (r > s.max) return 'Smaller: lantern farther back';
    return '';
  }

  /** Live shadow size relative to the authored pose (hand 30 cm from the lantern). */
  private sizeRatio(): number {
    const t = this.def ? app.targets.get(this.def.id) : undefined;
    return t && shadow.valid ? shadow.imageSize / Math.sqrt(t.measure.area) : 1;
  }

  private refreshCard(): void {
    const def = this.def ?? (this.freeId ? app.defs.get(this.freeId) ?? null : null);
    if (!def || !app.wall) {
      this.card.mesh.visible = false;
      return;
    }
    this.card.show({
      def,
      shape: targetShape(def.id),
      label: this.label(),
      stars: app.progress.stars[def.id] ?? 0,
      note: this.sizeNote(),
      highContrast: app.settings.highContrast,
    });
    this.placeCard();
  }

  private placeCard(): void {
    const w = app.wall;
    if (!w || !app.lightReady) return;
    const d = app.wallDistance;
    const width = Math.min(0.75, Math.max(0.32, 0.26 * d));
    if (app.settings.glasses) {
      // Glasses: keep the card inside the narrow view, just below eye level.
      const head = this.player.head.getWorldPosition(this.v);
      const fwd = this.player.head.getWorldDirection(this.n).negate();
      this.card.mesh.position.copy(head).addScaledVector(fwd, 0.9).add(this.n.set(0, -0.12, 0));
      this.card.mesh.lookAt(head);
      this.card.mesh.scale.setScalar(0.3);
      return;
    }
    // On the wall, up and to the left of where the shadow will fall.
    const c = imageToWall(app.frame, d, 0.05 / 0.3, 0.1 / 0.3);
    const p = toSurface(w, c);
    const a = Math.max(-w.halfU + width / 2, Math.min(w.halfU - width / 2, p.a - 0.62 * d * 0.36 - width / 2));
    const b = Math.max(-w.halfV + width / 2, Math.min(w.halfV - width * 0.4, p.b + 0.18 * d));
    this.card.mesh.position.set(...w.origin);
    this.card.mesh.position
      .addScaledVector(this.v.set(...w.u), a)
      .addScaledVector(this.n.set(...w.v), b)
      .addScaledVector(this.v.set(...w.normal), 0.008);
    this.card.mesh.lookAt(this.v.copy(this.card.mesh.position).add(this.n.set(...w.normal)));
    this.card.mesh.scale.setScalar(width);
  }

  private setGhost(on: boolean): void {
    this.entity.setValue(Puzzle, 'hintShown', on);
    if (on) this.hinted = true;
    this.ghost.root.visible = on && !!this.def && app.lightReady;
    if (!this.ghost.root.visible || !this.def) return;
    const hands = targetHands(this.def.id);
    const out: Float32Array[] = [];
    hands.forEach((h, k) => {
      const w = this.ghostHands[k];
      for (let i = 0; i < 25; i++) {
        const p = fromLightFrame(app.frame, [h[i * 3], h[i * 3 + 1], h[i * 3 + 2]]);
        w[i * 3] = p[0];
        w[i * 3 + 1] = p[1];
        w[i * 3 + 2] = p[2];
      }
      out.push(w);
    });
    this.ghost.set(out);
  }

  private onButton(action: string): void {
    switch (action) {
      case 'hint':
        this.setGhost(!this.ghost.root.visible);
        break;
      case 'retry':
        this.creatures.clear();
        this.load();
        break;
      case 'next':
      case 'prev': {
        if (this.mode === Modes.theatre || this.mode === Modes.free) break;
        const l = this.list();
        let i = (this.entity.getValue(Puzzle, 'index') as number) + (action === 'next' ? 1 : -1);
        const end = this.mode === Modes.onboarding ? Math.min(3, l.length) : l.length;
        if (i >= end && (this.mode === Modes.onboarding || this.mode === Modes.act)) {
          this.nextAct();
          break;
        }
        i = (i + l.length) % l.length;
        this.entity.setValue(Puzzle, 'index', i);
        this.load();
        break;
      }
      case 'tolerance-':
        setSettings({ tolerance: Math.max(0, app.settings.tolerance - 0.16) });
        break;
      case 'tolerance+':
        setSettings({ tolerance: Math.min(1, app.settings.tolerance + 0.16) });
        break;
      case 'act1':
      case 'act2':
      case 'act3':
        this.setMode(Modes.act, Number(action.slice(3)));
        break;
      case 'free':
        this.setMode(Modes.free);
        break;
      case 'daily':
        this.setMode(Modes.daily);
        break;
      case 'theatre':
        this.setMode(Modes.theatre);
        break;
    }
  }

  private nextAct(): void {
    const act = this.entity.getValue(Puzzle, 'act') as number;
    if (this.mode === Modes.onboarding) {
      app.progress.onboarded = true;
      saveProgress(app.progress);
      this.entity.setValue(Puzzle, 'mode', Modes.act);
      this.entity.setValue(Puzzle, 'index', 3);
      this.load();
      return;
    }
    sound.flourish();
    if (act < 3) {
      app.events.emit('toast', `Act ${act} complete`);
      this.setMode(Modes.act, act + 1);
    } else {
      app.events.emit('toast', 'All acts complete: the stage is yours');
      this.setMode(Modes.theatre);
    }
  }

  private onInked(def: CreatureDef): void {
    const w = app.wall;
    if (!w) return;
    const elapsed = this.time - this.startedAt;
    const stars = elapsed < 10 && !this.hinted ? 3 : elapsed < 25 ? 2 : 1;
    if (this.mode !== Modes.free) recordStar(def.id, stars);
    else if (!app.progress.cast.includes(def.id)) recordStar(def.id, 1);
    if (this.mode === Modes.daily) {
      app.progress.daily[new Date().toISOString().slice(0, 10)] = def.id;
      saveProgress(app.progress);
    }
    const p = toSurface(w, shadow.center);
    this.creatures.spawn(def.id, w, p.a, p.b, Math.max(0.2, shadow.size), 'puzzle');
    this.entity.setValue(Puzzle, 'inkedCount', (this.entity.getValue(Puzzle, 'inkedCount') as number) + 1);
    sound.inkBleed();
    sound.pluck((this.entity.getValue(Puzzle, 'index') as number) + 2, 0.55);
    this.setGhost(false);
    this.refreshCard();
    app.events.emit('inked', { creatureId: def.id, center: [...shadow.center], size: shadow.size, fromPuzzle: true });
    this.advanceAt = this.mode === Modes.free ? this.time + 1.5 : this.time + 4;
  }

  private microgestures(): void {
    for (const side of ['left', 'right'] as const) {
      const src = this.input.xr.getPrimaryInputSource(side);
      const pad = src?.hand ? src.gamepad : undefined;
      const b5 = !!pad?.buttons[5]?.pressed;
      const b6 = !!pad?.buttons[6]?.pressed;
      const prev = this.mbtn[side];
      if (b5 && !prev[0]) this.onButton('prev');
      if (b6 && !prev[1]) this.onButton('next');
      prev[0] = b5;
      prev[1] = b6;
    }
  }

  update(delta: number, time: number): void {
    this.time = time;
    if (!this.xrManager.isPresenting) return;
    this.microgestures();
    const mode = this.mode;
    if (this.card.mesh.visible && app.settings.glasses) this.placeCard();
    if (time >= this.advanceAt) {
      this.advanceAt = Infinity;
      if (mode === Modes.free) {
        this.tracker.reset();
        this.freeId = '';
        this.entity.setValue(Puzzle, 'state', PuzzleStates.searching);
      } else if (mode !== Modes.daily && mode !== Modes.theatre) this.onButton('next');
    }

    // Ring follows the live shadow.
    const ringOn = shadow.valid && app.lightReady && mode !== Modes.theatre && this.entity.getValue(Puzzle, 'state') !== PuzzleStates.inked;
    this.ring.mesh.visible = ringOn;
    if (ringOn && app.wall) {
      const w = app.wall;
      this.ring.mesh.position.set(...shadow.center).addScaledVector(this.n.set(...w.normal), 0.01);
      this.ring.mesh.lookAt(this.v.copy(this.ring.mesh.position).add(this.n));
      this.ring.mesh.scale.setScalar(Math.max(0.15, shadow.size * 0.95));
      this.ring.material.uniforms.uTime.value = time;
    }

    if (shadow.seq === this.seq) return;
    this.seq = shadow.seq;
    if (this.entity.getValue(Puzzle, 'state') === PuzzleStates.inked) return;

    let def = this.def;
    let score: number | null = null;
    if (mode === Modes.free) {
      const free = [...FREE_BESTIARY(), ...app.progress.cast.map((id) => app.defs.get(id)!).filter(Boolean)];
      let best = 0;
      let bestId = '';
      if (shadow.valid) {
        for (const d of free) {
          const t = app.targets.get(d.id);
          if (!t) continue;
          const s = app.scorer.score(t);
          if (s > best) {
            best = s;
            bestId = d.id;
          }
        }
      }
      if (bestId !== this.freeId) {
        this.freeId = bestId;
        this.tracker.reset();
        this.refreshCard();
      }
      def = bestId ? app.defs.get(bestId) ?? null : null;
      score = shadow.valid ? best : null;
    } else if (def) {
      const t = app.targets.get(def.id);
      score = shadow.valid && t ? app.scorer.score(t) : null;
    }
    if (!def) {
      this.entity.setValue(Puzzle, 'score', score ?? 0);
      return;
    }
    let sizeOk = true;
    if (def.size && shadow.valid) {
      const r = this.sizeRatio();
      sizeOk = r >= def.size.min && r <= def.size.max;
    }
    const state = this.tracker.push(score === null ? null : sizeOk ? score : Math.min(score, this.tracker.opts.threshold - 0.01), time);
    this.ring.material.uniforms.uProgress.value = this.tracker.progress;
    this.ring.material.uniforms.uClose.value = Math.min(1, (score ?? 0) / this.tracker.opts.threshold);
    this.ring.material.uniforms.uWarn.value = sizeOk ? 0 : 1;
    this.entity.setValue(Puzzle, 'score', score ?? 0);
    this.entity.setValue(Puzzle, 'progress', this.tracker.progress);
    this.entity.setValue(Puzzle, 'sizeOk', sizeOk);
    this.entity.setValue(Puzzle, 'state', state);
    const note = this.sizeNote();
    if (def.size && note !== this.lastNote) {
      this.lastNote = note;
      this.refreshCard();
    }
    if (state === 'inked') this.onInked(def);
  }
}

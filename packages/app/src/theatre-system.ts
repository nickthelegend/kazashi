/**
 * Theatre: the cast strip (glass slides above the lantern), dropping a cast
 * member onto the wall, the two-hand curtain gesture that starts and stops a
 * 20 s take, saving takes to IndexedDB, and replaying them through the same
 * shadow and creature rigs.
 */
import { bodyPlan } from '@kazashi/core/creatures';
import { castPage } from '@kazashi/core/cast';
import { imageToWall } from '@kazashi/core/lightframe';
import { summarizeTake } from '@kazashi/core/narration';
import { fromLightFrame, toLightFrame } from '@kazashi/core/lightframe';
import { raySurface, toSurface } from '@kazashi/core/room';
import { type CreatureKey, sampleTrack, type Take, TakeRecorder } from '@kazashi/core/take';
import {
  createSystem,
  DoubleSide,
  type Entity,
  Grabbed,
  Mesh,
  MeshBasicMaterial,
  OneHandGrabbable,
  PlaneGeometry,
  Vector3,
} from '@iwsdk/core';
import { app } from './app.js';
import { sound } from './audio.js';
import { CastCard, Modes, Theatre } from './components.js';
import { BODY_SCALE, type CreatureSystem, type LiveCreature } from './creature-system.js';
import type { LanternSystem } from './lantern-system.js';
import { canvasTexture, COLORS, drawBody, FONT_DISPLAY, FONT_MONO, paper } from './paint.js';
import type { PuzzleSystem } from './puzzle-system.js';
import { listTakes, saveTake } from './storage.js';
import { NarrationUnavailable, requestNarration } from './narration-client.js';
import { redraw } from './paint.js';

const CAPTION_W = 1600;
const CAPTION_H = 260;

const MAX_ON_STAGE = 3;
/** Glass slides: 12 × 16 cm, so names keep ≥ 0.018 m cap height per metre at arm's length. */
const CARD_W = 0.12;
const CARD_H = 0.16;

interface Slot {
  entity: Entity;
  mesh: Mesh;
  id: string;
  home: Vector3;
}

export class TheatreSystem extends createSystem({
  theatre: { required: [Theatre] },
  cards: { required: [CastCard] },
  held: { required: [CastCard, Grabbed] },
}) {
  creatures!: CreatureSystem;
  puzzles!: PuzzleSystem;
  lantern!: LanternSystem;
  private entity!: Entity;
  private slots: Slot[] = [];
  private stage: LiveCreature[] = [];
  private readonly recorder = new TakeRecorder();
  private curtain: 'idle' | 'apart' = 'idle';
  private apartAt = 0;
  private cooldown = 0;
  private replay: { take: Take; t: number; creatures: LiveCreature[]; key: CreatureKey; line: number } | null = null;
  private caption: Mesh | null = null;
  private replayHands: (Float32Array | null)[] = [new Float32Array(75), new Float32Array(75)];
  private seal: Mesh | null = null;
  private time = 0;
  private castPage = 0;
  private shownPage = -1;
  private castCount = -1;
  private cardsActive = false;
  private readonly v = new Vector3();
  private readonly w = new Vector3();
  private readonly lightHands = [new Float32Array(75), new Float32Array(75)];

  init(): void {
    this.entity = this.world.createEntity();
    this.entity.addComponent(Theatre, {});
    this.cleanupFuncs.push(
      this.queries.held.subscribe('qualify', () => sound.rustle()),
      this.queries.held.subscribe('disqualify', (e) => this.onDrop(e)),
      app.events.on('button', (a) => {
        if (a === 'play') void this.playLatest();
        if (a === 'record') this.toggleRecording();
        if (this.active && (a === 'next' || a === 'prev')) {
          if (this.slots.some((s) => s.entity.hasComponent(Grabbed))) return;
          this.castPage += a === 'next' ? 1 : -1;
          this.syncCards();
          app.events.emit('toast', `Cast book ${this.entity.getValue(Theatre, 'castPage') as number + 1}/${this.entity.getValue(Theatre, 'castPages')}`);
        }
      }),
    );
    void this.refreshTakes();
    const onEnd = () => {
      this.stopReplay();
      for (const s of this.slots) s.entity.dispose();
      this.slots = [];
      this.castCount = -1;
    };
    this.xrManager.addEventListener('sessionend', onEnd);
    this.cleanupFuncs.push(() => this.xrManager.removeEventListener('sessionend', onEnd));
  }

  private async refreshTakes(): Promise<void> {
    try {
      const takes = await listTakes();
      this.entity.setValue(Theatre, 'takes', takes.length);
      this.entity.setValue(Theatre, 'lastTakeId', takes[0]?.id ?? '');
    } catch (e) {
      console.warn(`[kazashi] takes unavailable: ${(e as Error).message}`);
    }
  }

  private get active(): boolean {
    return this.puzzles.mode === Modes.theatre;
  }

  /** Build a six-slide page; the lantern's Next tab browses the whole book. */
  private syncCards(): void {
    const active = this.active;
    if (active === this.cardsActive && this.castCount === app.progress.cast.length && this.shownPage === this.castPage) return;
    const { ids, page, pages } = castPage(app.progress.cast, this.castPage);
    this.castPage = page;
    this.shownPage = page;
    this.castCount = app.progress.cast.length;
    this.cardsActive = active;
    this.entity.setValue(Theatre, 'castPage', page);
    this.entity.setValue(Theatre, 'castPages', pages);
    for (const s of this.slots) s.entity.dispose();
    this.slots = [];
    if (!active || !ids.length) return;
    ids.forEach((id, i) => {
      const tex = canvasTexture(300, 400, (ctx) => {
        ctx.fillStyle = 'rgba(255, 208, 138, 0.55)';
        ctx.fillRect(0, 0, 300, 400);
        ctx.strokeStyle = COLORS.vermilion;
        ctx.lineWidth = 14;
        ctx.strokeRect(7, 7, 286, 386);
        // The slide shows the animal it projects.
        drawBody(ctx, bodyPlan(id), { x: 26, y: 30, w: 248, h: 220 }, COLORS.sumi, 'rgba(255, 208, 138, 1)');
        ctx.fillStyle = COLORS.sumi;
        ctx.textAlign = 'center';
        ctx.font = `800 44px ${FONT_DISPLAY}`;
        ctx.fillText(app.defs.get(id)?.name ?? id, 150, 304, 264);
        ctx.font = `700 30px ${FONT_MONO}`;
        ctx.fillStyle = COLORS.vermilion;
        ctx.fillText('★'.repeat(app.progress.stars[id] ?? 0) || '·', 150, 346, 264);
        ctx.fillStyle = COLORS.sumi;
        ctx.fillText(`${page + 1}/${pages}`, 150, 380, 264);
      });
      const mesh = new Mesh(
        new PlaneGeometry(CARD_W, CARD_H),
        new MeshBasicMaterial({ map: tex, transparent: true, side: DoubleSide, depthWrite: false }),
      );
      mesh.name = `CastCard_${id}`;
      this.scene.add(mesh);
      const e = this.world.createTransformEntity(mesh);
      e.addComponent(CastCard, { creatureId: id, slot: i });
      e.addComponent(OneHandGrabbable, { rotate: true, translate: true });
      this.slots.push({ entity: e, mesh, id, home: new Vector3() });
    });
    this.layoutCards(true);
  }

  /** An arc of slides above and in front of the lantern, facing the viewer. */
  private layoutCards(snap: boolean): void {
    const lantern = this.lantern.entity?.object3D;
    if (!lantern) return;
    const head = this.player.head.getWorldPosition(this.v);
    const n = this.slots.length;
    this.slots.forEach((s, i) => {
      const off = (i - (n - 1) / 2) * (CARD_W + 0.02);
      s.home.set(off, 0.3 - Math.abs(off) * 0.12, 0.12 + Math.abs(off) * 0.35).applyMatrix4(lantern.matrixWorld);
      if (snap || !s.entity.hasComponent(Grabbed)) {
        if (snap) s.mesh.position.copy(s.home);
        else s.mesh.position.lerp(s.home, 0.15);
        s.mesh.lookAt(head);
      }
    });
  }

  private onDrop(e: Entity): void {
    const slot = this.slots.find((s) => s.entity === e);
    const wall = app.wall;
    if (!slot || !wall || !app.lightReady) return;
    // The slide projects through the lantern: where its shadow falls, the creature lands.
    const pos = slot.mesh.position;
    const dir = this.w.copy(pos).sub(this.v.set(...app.light));
    const dist = dir.length();
    const t = raySurface(wall, app.light, [dir.x, dir.y, dir.z], -0.05);
    if (t === null || dist < 0.05) {
      app.events.emit('toast', 'Hold the slide between the lantern and the wall');
      return;
    }
    const hit = this.v.set(...app.light).addScaledVector(dir.normalize(), t);
    // The slide's picture is ~7.5 cm across: its projection sets the creature's size.
    const size = Math.max(0.25, Math.min(0.75, (0.075 * t) / dist));
    const c = this.creatures.landAt(slot.id, [hit.x, hit.y, hit.z], size);
    if (!c) return;
    this.stage.push(c);
    while (this.stage.length > MAX_ON_STAGE) {
      const old = this.stage.shift()!;
      old.phase = 'fade';
      old.t = 0;
    }
    this.entity.setValue(Theatre, 'onStage', this.stage.length);
    sound.pluck(this.stage.length + 4, 0.45);
  }

  private curtainGesture(delta: number): void {
    this.cooldown -= delta;
    const L = app.hands.hands.left;
    const R = app.hands.hands.right;
    if (!L.tracked || !R.tracked || this.cooldown > 0) return;
    const facing = L.palmNormal.dot(R.palmNormal) < -0.4 && Math.abs(L.palmNormal.y) < 0.7 && Math.abs(R.palmNormal.y) < 0.7;
    const dist = L.palm.distanceTo(R.palm);
    if (dist > 0.42 && facing) {
      this.curtain = 'apart';
      this.apartAt = this.time;
    } else if (this.curtain === 'apart' && dist < 0.14) {
      this.curtain = 'idle';
      if (this.time - this.apartAt < 2.5) {
        this.cooldown = 1.2;
        this.toggleRecording();
      }
    }
  }

  toggleRecording(): void {
    if (this.recorder.recording) void this.finishRecording();
    else if (this.active && !this.replay) {
      this.recorder.begin(`take-${Date.now().toString(36)}`, `Take ${this.entity.getValue(Theatre, 'takes') as number + 1}`, this.time, Date.now());
      this.entity.setValue(Theatre, 'recording', true);
      sound.flourish();
      this.showSeal(true);
    }
  }

  private async finishRecording(): Promise<void> {
    const take = this.recorder.end();
    this.entity.setValue(Theatre, 'recording', false);
    this.showSeal(false);
    if (!take || take.frames.length < 3) {
      app.events.emit('toast', 'That take was too short to keep');
      return;
    }
    sound.pluck(0, 0.5);
    try {
      const count = await saveTake(take);
      this.entity.setValue(Theatre, 'takes', count);
      this.entity.setValue(Theatre, 'lastTakeId', take.id);
      app.events.emit('toast', `Saved ${take.title} (${take.duration.toFixed(1)} s)`);
      void this.narrate(take);
    } catch (e) {
      console.error(`[kazashi] could not save the take: ${(e as Error).message}`);
      app.events.emit('toast', 'Could not save the take on this device');
    }
  }

  private showSeal(on: boolean): void {
    if (!this.seal) {
      const tex = canvasTexture(128, 128, (ctx) => {
        ctx.fillStyle = COLORS.vermilion;
        ctx.beginPath();
        ctx.roundRect(8, 8, 112, 112, 18);
        ctx.fill();
        ctx.fillStyle = COLORS.paper;
        ctx.font = '700 34px "Anonymous Pro", monospace';
        ctx.textAlign = 'center';
        ctx.fillText('REC', 64, 76);
      });
      this.seal = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      this.seal.name = 'RecordSeal';
      this.seal.renderOrder = 5;
      this.scene.add(this.seal);
    }
    this.seal.visible = on;
    const w = app.wall;
    if (on && w) {
      const s = Math.max(0.12, app.wallDistance * 0.07);
      this.seal.scale.setScalar(s);
      this.seal.position.set(...w.origin);
      const c = toSurface(w, [app.light[0], app.light[1] + app.wallDistance * 0.45, app.light[2]]);
      this.seal.position
        .addScaledVector(this.v.set(...w.u), Math.min(w.halfU - s, c.a + app.wallDistance * 0.35))
        .addScaledVector(this.w.set(...w.v), Math.min(w.halfV - s, c.b))
        .addScaledVector(this.v.set(...w.normal), 0.012);
      this.seal.lookAt(this.w.copy(this.seal.position).add(this.v));
    }
  }

  private recordTick(): void {
    const hands: (Float32Array | null)[] = [null, null];
    for (let h = 0; h < 2; h++) {
      const j = app.shadowHands[h];
      if (j && app.lightReady) hands[h] = toLightFrame(app.frame, j, this.lightHands[h]);
    }
    const w = app.wall;
    const samples = w
      ? this.stage
          .filter((c) => c.surface.id === w.id && this.creatures.live.includes(c))
          .map((c) => ({ key: c.key, creatureId: c.def.id, size: c.size / BODY_SCALE, u: c.a, v: c.b, surface: 0, facing: c.facing }))
      : [];
    const done = this.recorder.tick(this.time, hands, samples);
    this.entity.setValue(Theatre, 'elapsed', this.recorder.elapsed);
    if (done) void this.finishRecording();
  }

  /** Ask Muse (through the proxy) to narrate the take; keep it with the take. */
  private async narrate(take: Take): Promise<void> {
    this.entity.setValue(Theatre, 'narration', 'writing');
    this.entity.setValue(Theatre, 'narrationError', '');
    const names = new Map([...app.defs.values()].map((d) => [d.id, d.name]));
    try {
      take.narration = await requestNarration(summarizeTake(take, names));
      await saveTake(take);
      this.entity.setValue(Theatre, 'narration', 'ready');
      app.events.emit('toast', 'Muse wrote your narration: open your palm, tap Replay');
    } catch (e) {
      const reason = e instanceof NarrationUnavailable ? e.message : `could not keep it (${(e as Error).message})`;
      this.entity.setValue(Theatre, 'narration', 'unavailable');
      this.entity.setValue(Theatre, 'narrationError', reason);
      console.warn(`[kazashi] AI narration unavailable: ${reason}`);
      app.events.emit('toast', `AI narration unavailable: ${reason}`);
    }
  }

  /** A paper caption strip high on the wall, above the stage (kamishibai narrator). */
  private showCaption(text: string | null, model = ''): void {
    if (!this.caption) {
      const tex = canvasTexture(CAPTION_W, CAPTION_H, (ctx) => paper(ctx, CAPTION_W, CAPTION_H));
      this.caption = new Mesh(new PlaneGeometry(1, CAPTION_H / CAPTION_W), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: DoubleSide }));
      this.caption.name = 'NarrationCaption';
      this.caption.renderOrder = 6;
      this.scene.add(this.caption);
    }
    const mesh = this.caption;
    const w = app.wall;
    mesh.visible = !!text && !!w;
    if (!text || !w) return;
    redraw((mesh.material as MeshBasicMaterial).map as never, (ctx) => {
      paper(ctx, CAPTION_W, CAPTION_H);
      ctx.fillStyle = COLORS.vermilion;
      ctx.fillRect(0, 0, 22, CAPTION_H);
      ctx.font = `700 30px ${FONT_MONO}`;
      ctx.fillText(`NARRATOR · ${model.toUpperCase()} (META)`, 60, 52);
      ctx.fillStyle = COLORS.sumi;
      ctx.font = `800 74px ${FONT_DISPLAY}`;
      const words = text.split(' ');
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > CAPTION_W - 120 && line) {
          lines.push(line);
          line = word;
        } else line = test;
      }
      lines.push(line);
      lines.slice(0, 2).forEach((l, i) => ctx.fillText(i === 1 && lines.length > 2 ? `${l} ${lines.slice(2).join(' ')}` : l, 60, 142 + i * 84, CAPTION_W - 100));
    });
    // High on the wall, above the stage, sized by its distance from the eyes so the
    // line keeps a cap height of at least 18 mm per metre (74 px Bricolage = 49 px caps;
    // 0.75 m per metre gives 23 mm/m).
    const c = toSurface(w, imageToWall(app.frame, app.wallDistance, 0, 0));
    const place = (width: number) => {
      const h = width * (CAPTION_H / CAPTION_W);
      const a = Math.max(-w.halfU + width / 2, Math.min(w.halfU - width / 2, c.a));
      const b = w.halfV - h / 2 - 0.1;
      mesh.position.set(...w.origin);
      mesh.position
        .addScaledVector(this.v.set(...w.u), a)
        .addScaledVector(this.w.set(...w.v), b)
        .addScaledVector(this.v.set(...w.normal), 0.016);
      mesh.scale.setScalar(width);
    };
    place(1.4);
    const view = this.player.head.getWorldPosition(this.v).distanceTo(mesh.position);
    place(Math.max(1.2, Math.min(2.8, view * 0.75)));
    mesh.lookAt(this.w.copy(mesh.position).add(this.v.set(...w.normal)));
  }

  async playLatest(): Promise<void> {
    if (this.replay || this.recorder.recording) return;
    let take: Take | undefined;
    try {
      take = (await listTakes())[0];
    } catch (e) {
      app.events.emit('toast', 'Takes are unavailable on this device');
      console.warn(`[kazashi] ${(e as Error).message}`);
      return;
    }
    if (!take || !app.wall) {
      app.events.emit('toast', 'No takes yet: open and close the curtain to record');
      return;
    }
    for (const c of this.stage) this.creatures.remove(c);
    this.stage = [];
    const creatures = take.tracks.map((tr) => {
      const k = tr.keys[0];
      return this.creatures.spawn(tr.creatureId, app.wall!, k.u, k.v, tr.size, 'replay');
    });
    this.replay = { take, t: 0, creatures, key: { t: 0, u: 0, v: 0, surface: 0, facing: 1 }, line: -1 };
    this.entity.setValue(Theatre, 'replaying', true);
    sound.flourish();
  }

  private stepReplay(delta: number): void {
    const r = this.replay!;
    r.t += delta;
    const f = Math.min(r.take.frames.length - 1, Math.floor(r.t * r.take.rate));
    const frame = r.take.frames[f] ?? [];
    for (let h = 0; h < 2; h++) {
      const src = frame[h];
      if (!src) {
        this.replayHands[h] = null;
        continue;
      }
      const out = (this.replayHands[h] ??= new Float32Array(75));
      for (let i = 0; i < 25; i++) {
        const p = fromLightFrame(app.frame, [src[i * 3], src[i * 3 + 1], src[i * 3 + 2]]);
        out[i * 3] = p[0];
        out[i * 3 + 1] = p[1];
        out[i * 3 + 2] = p[2];
      }
    }
    app.replayHands = this.replayHands;
    r.take.tracks.forEach((tr, i) => {
      const c = r.creatures[i];
      if (!c || !app.wall) return;
      sampleTrack(tr, r.t, r.key);
      this.creatures.setReplayPose(c, app.wall, r.key.u, r.key.v, r.key.facing);
    });
    const lines = r.take.narration?.lines ?? [];
    let line = -1;
    for (let i = 0; i < lines.length; i++) if (r.t >= lines[i].at && r.t < lines[i].at + lines[i].dur) line = i;
    if (line !== r.line) {
      r.line = line;
      this.entity.setValue(Theatre, 'captionLine', line);
      this.showCaption(line >= 0 ? lines[line].text : null, r.take.narration?.model);
    }
    if (r.t >= Math.max(r.take.duration, lines.length ? lines[lines.length - 1].at + lines[lines.length - 1].dur : 0)) this.stopReplay();
  }

  private stopReplay(): void {
    if (!this.replay) return;
    for (const c of this.replay.creatures) this.creatures.remove(c);
    this.replay = null;
    this.showCaption(null);
    this.entity.setValue(Theatre, 'captionLine', -1);
    app.replayHands = null;
    this.replayHands = [new Float32Array(75), new Float32Array(75)];
    this.entity.setValue(Theatre, 'replaying', false);
  }

  update(delta: number, time: number): void {
    this.time = time;
    if (!this.xrManager.isPresenting) return;
    this.syncCards();
    if (this.slots.length) this.layoutCards(false);
    this.stage = this.stage.filter((c) => this.creatures.live.includes(c));
    this.entity.setValue(Theatre, 'onStage', this.stage.length);
    if (this.active) this.curtainGesture(delta);
    if (this.recorder.recording) this.recordTick();
    if (this.replay) this.stepReplay(delta);
  }
}

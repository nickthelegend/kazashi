/**
 * Palm-up wrist menu (left hand). Turn the left palm up and a paper menu
 * opens above it; poke a tab with the right index finger (or point and
 * pinch). Chapters, tolerance, one-hand mode, high contrast, glasses layout,
 * the theatre controls, re-placing the lantern and exit.
 */
import {
  createSystem,
  DoubleSide,
  type Entity,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  PokeInteractable,
  RayInteractable,
  Vector3,
} from '@iwsdk/core';
import { app, setSettings } from './app.js';
import { sound } from './audio.js';
import { PaperButton, WristMenu } from './components.js';
import type { LanternSystem } from './lantern-system.js';
import { canvasTexture, COLORS, drawGlyph, FONT_DISPLAY, type Glyph, paper, redraw } from './paint.js';

interface Tab {
  action: string;
  label?: string;
  glyph?: Glyph;
  toggle?: () => boolean;
}

const TABS: Tab[][] = [
  [{ action: 'act1', label: 'I' }, { action: 'act2', label: 'II' }, { action: 'act3', label: 'III' }, { action: 'free', label: 'Free' }],
  [{ action: 'daily', label: 'Day' }, { action: 'theatre', glyph: 'book' }, { action: 'play', glyph: 'play' }, { action: 'record', glyph: 'record' }],
  [
    { action: 'tolerance-', glyph: 'minus' },
    { action: 'tolerance+', glyph: 'plus' },
    { action: 'onehand', glyph: 'hand1', toggle: () => app.settings.oneHand },
    { action: 'contrast', glyph: 'contrast', toggle: () => app.settings.highContrast },
  ],
  [
    { action: 'glasses', glyph: 'eye', toggle: () => app.settings.glasses },
    { action: 'recentre', glyph: 'retry' },
    { action: 'hint', glyph: 'hint' },
    { action: 'exit', glyph: 'exit' },
  ],
];
const TAB = 0.042;
const GAP = 0.008;

export class MenuSystem extends createSystem({ menu: { required: [WristMenu] } }) {
  lantern!: LanternSystem;
  private entity!: Entity;
  private readonly root = new Group();
  private tabs: { entity: Entity; tab: Tab; mesh: Mesh }[] = [];
  private open = false;
  private closeTimer = 0;
  private readonly head = new Vector3();
  private readonly v = new Vector3();

  init(): void {
    this.root.name = 'WristMenu';
    this.root.visible = false;
    const cols = TABS[0].length;
    const rows = TABS.length;
    const back = new Mesh(
      new PlaneGeometry(cols * (TAB + GAP) + GAP * 2, rows * (TAB + GAP) + GAP * 2 + 0.02),
      new MeshBasicMaterial({ color: COLORS.sumi, transparent: true, opacity: 0.82, side: DoubleSide }),
    );
    back.position.z = -0.002;
    this.root.add(back);
    this.scene.add(this.root);
    this.entity = this.world.createEntity();
    this.entity.addComponent(WristMenu, { ...app.settings });
    const rootEntity = this.world.createTransformEntity(this.root);
    TABS.forEach((row, r) =>
      row.forEach((tab, c) => {
        const mat = new MeshBasicMaterial({ map: canvasTexture(128, 128, (ctx) => this.paintTab(ctx, tab)), side: DoubleSide });
        const mesh = new Mesh(new PlaneGeometry(TAB, TAB), mat);
        mesh.name = `Menu_${tab.action}`;
        mesh.position.set((c - (cols - 1) / 2) * (TAB + GAP), ((rows - 1) / 2 - r) * (TAB + GAP) - 0.008, 0);
        this.root.add(mesh);
        const e = this.world.createTransformEntity(mesh, { parent: rootEntity });
        e.addComponent(PaperButton, { action: tab.action });
        this.tabs.push({ entity: e, tab, mesh });
      }),
    );
    this.cleanupFuncs.push(
      app.events.on('button', (a) => this.onButton(a)),
      app.events.on('settings', () => this.repaint()),
    );
  }

  private paintTab(ctx: CanvasRenderingContext2D, tab: Tab): void {
    const on = tab.toggle?.() ?? false;
    paper(ctx, 128, 128, on ? COLORS.lamp : COLORS.paper);
    ctx.strokeStyle = COLORS.vermilion;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 122, 122);
    if (tab.glyph) drawGlyph(ctx, tab.glyph, 64, 64, 40, COLORS.sumi);
    else {
      ctx.fillStyle = COLORS.sumi;
      ctx.font = `800 ${tab.label!.length > 3 ? 34 : 46}px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tab.label!, 64, 68);
    }
  }

  private repaint(): void {
    for (const t of this.tabs) {
      if (!t.tab.toggle) continue;
      const map = (t.mesh.material as MeshBasicMaterial).map;
      if (map) redraw(map as never, (ctx) => this.paintTab(ctx, t.tab));
    }
    this.entity.setValue(WristMenu, 'tolerance', app.settings.tolerance);
    this.entity.setValue(WristMenu, 'oneHand', app.settings.oneHand);
    this.entity.setValue(WristMenu, 'highContrast', app.settings.highContrast);
    this.entity.setValue(WristMenu, 'glasses', app.settings.glasses);
  }

  private onButton(a: string): void {
    switch (a) {
      case 'onehand':
        setSettings({ oneHand: !app.settings.oneHand });
        break;
      case 'contrast':
        setSettings({ highContrast: !app.settings.highContrast });
        break;
      case 'glasses':
        setSettings({ glasses: !app.settings.glasses });
        break;
      case 'recentre':
        this.lantern.placeLantern();
        break;
      case 'exit':
        void this.world.exitXR();
        break;
    }
  }

  private setOpen(open: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.root.visible = open;
    this.entity.setValue(WristMenu, 'open', open);
    for (const t of this.tabs) {
      if (open) {
        t.entity.addComponent(PokeInteractable);
        t.entity.addComponent(RayInteractable);
      } else {
        if (t.entity.hasComponent(PokeInteractable)) t.entity.removeComponent(PokeInteractable);
        if (t.entity.hasComponent(RayInteractable)) t.entity.removeComponent(RayInteractable);
      }
    }
    if (open) sound.rustle();
  }

  update(delta: number): void {
    if (!this.xrManager.isPresenting) {
      this.setOpen(false);
      return;
    }
    const L = app.hands.hands.left;
    const up = L.tracked && L.palmNormal.y > 0.65;
    if (up) {
      this.closeTimer = 0;
      this.setOpen(true);
    } else if (this.open) {
      this.closeTimer += delta;
      if (this.closeTimer > 0.35) this.setOpen(false);
    }
    if (!this.open || !L.tracked) return;
    // Float above the palm, tilted toward the eyes.
    this.player.head.getWorldPosition(this.head);
    this.root.position.copy(L.palm).addScaledVector(L.palmNormal, 0.09);
    this.root.lookAt(this.head);
  }
}

/**
 * Kazashi (翳し): hold your hands up to the lantern; their shadow on your real
 * wall becomes a creature, and the creatures perform your shadow play.
 */
import { buildTargets } from '@kazashi/core/bestiary';
import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { app, setSettings } from './app.js';
import { sound } from './audio.js';
import { CreatureSystem } from './creature-system.js';
import { installDebugHook } from './debug.js';
import { HandSystem } from './hand-system.js';
import { LanternSystem } from './lantern-system.js';
import { MenuSystem } from './menu-system.js';
import { installPerf, PerfEndSystem, PerfStartSystem } from './perf.js';
import { loadFonts } from './paint.js';
import { PuzzleSystem } from './puzzle-system.js';
import { RoomSystem } from './room-system.js';
import { TheatreSystem } from './theatre-system.js';
import { ToastSystem } from './toast-system.js';

async function main(): Promise<void> {
  const status = document.getElementById('status')!;
  const enter = document.getElementById('enter') as HTMLButtonElement;
  if (app.progress.settings) Object.assign(app.settings, app.progress.settings);
  app.targets = buildTargets();
  await loadFonts();

  const world = await World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions);
  world
    .registerSystem(PerfStartSystem, { priority: -1000 })
    .registerSystem(RoomSystem, { priority: 1 })
    .registerSystem(LanternSystem, { priority: 2 })
    .registerSystem(HandSystem, { priority: 3 })
    .registerSystem(PuzzleSystem, { priority: 4 })
    .registerSystem(CreatureSystem, { priority: 5 })
    .registerSystem(TheatreSystem, { priority: 6 })
    .registerSystem(MenuSystem, { priority: 7 })
    .registerSystem(ToastSystem, { priority: 8 })
    .registerSystem(PerfEndSystem, { priority: 1000 });
  installPerf(world);

  const room = world.getSystem(RoomSystem)!;
  const lantern = world.getSystem(LanternSystem)!;
  const puzzles = world.getSystem(PuzzleSystem)!;
  const creatures = world.getSystem(CreatureSystem)!;
  const theatre = world.getSystem(TheatreSystem)!;
  lantern.room = room;
  puzzles.creatures = creatures;
  theatre.creatures = creatures;
  theatre.puzzles = puzzles;
  theatre.lantern = lantern;
  world.getSystem(MenuSystem)!.lantern = lantern;
  installDebugHook();

  world.renderer.shadowMap.enabled = true;

  const xr = navigator.xr;
  const supported = xr ? await xr.isSessionSupported('immersive-ar').catch(() => false) : false;
  if (!supported) {
    status.textContent = 'Mixed reality is not available in this browser. Open this page in the Meta Quest browser.';
    enter.disabled = true;
  } else {
    status.textContent = 'Sit at a desk facing a wall. Your hands are the only controller.';
    enter.disabled = false;
  }
  enter.addEventListener('click', () => {
    sound.start();
    void world.launchXR();
  });
  // Meta VR Glasses grant gaze tracking; Quest 3 does not. Use the glasses layout there.
  world.renderer.xr.addEventListener('sessionstart', () => {
    const features = (world.renderer.xr.getSession() as (XRSession & { enabledFeatures?: string[] }) | null)?.enabledFeatures ?? [];
    if (features.includes('gaze-tracking') && !app.settings.glasses) setSettings({ glasses: true });
  });
  world.visibilityState.subscribe((v) => {
    document.body.classList.toggle('in-xr', v !== VisibilityState.NonImmersive);
    if (v !== VisibilityState.NonImmersive) sound.start();
  });
}

main().catch((e: unknown) => {
  console.error(e);
  const status = document.getElementById('status');
  if (status) status.textContent = `Kazashi could not start: ${(e as Error).message}`;
});

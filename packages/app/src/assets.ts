/**
 * Asset manifest. Everything in Kazashi is procedural; the lantern is
 * registered so the editor can inspect it.
 */
import { defineAssets } from '@iwsdk/core';
import { createLantern } from './scene-assets/lantern.scene-asset.js';

export default defineAssets({
  lantern: createLantern(),
});

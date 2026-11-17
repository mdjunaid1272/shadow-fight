import { Game } from './core/Game';
import { installFullscreenOnTouch } from './core/Fullscreen';

const host = document.getElementById('app');
if (!host) throw new Error('#app container missing');
installFullscreenOnTouch();
if (new URLSearchParams(location.search).has('gltftest')) {
  // dev: ?gltftest runs the GLB pipeline self-test instead of the game
  void import('./dev/gltfSelfTest').then((m) => m.runGltfSelfTest());
} else new Game(host);

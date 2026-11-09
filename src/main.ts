import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
// Let the loading screen paint before building four worlds.
setTimeout(() => { try {
  const game = new Game(canvas);
  document.getElementById('loading')?.remove();
  game.run();
} catch (e) {
  document.getElementById('ui')!.innerHTML = `<div class="help">Downriver needs WebGL. Try a recent Chrome, Edge, Firefox or Safari.<br/><span class="dim">${String(e)}</span></div>`;
  throw e;
} }, 30);

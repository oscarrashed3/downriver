import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
try {
  const game = new Game(canvas);
  game.run();
} catch (e) {
  document.getElementById('ui')!.innerHTML = `<div class="help">Downriver needs WebGL. Try a recent Chrome, Edge, Firefox or Safari.<br/><span class="dim">${String(e)}</span></div>`;
  throw e;
}

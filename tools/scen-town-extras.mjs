// World 3, the smaller things (Phase G): TOWNOUT=/dir node tools/play.mjs town-extras
// The bakery loaf and the swaps round the village; the postman on his big bird (the keeper's letter answers the
// World 2 reply); the two hidden sketch spots; the map with Old Amble where it is; the compass from the meadow;
// Esc for the settings; and save / Continue with Amble walking and Nilo on its back.
import { townSetup } from './townE.mjs';
const DONE = ['town:arrived', 'town:jump-seen', 'town:quest', 'town:met-tamsin', 'town:stone-roped', 'town:foot-done', 'town:met-miller', 'town:sail-fitted', 'town:gap-0', 'town:gap-1', 'town:gap-2', 'town:water-done', 'town:met-bramwyn', ...[0, 1, 2, 3, 4, 5].map(i => 'town:vine-' + i), 'town:eyes-done'];
export default async (ctx) => {
  const T = await townSetup(ctx, DONE);
  const { ev, page } = ctx;
  const V = `__game.player.pos.constructor`;
  // as a real journey would have it: the kite frame kept from World 2, and a reply sent with the World 2 letter
  await ev(`(() => { const g = __game; g.give('item:kite'); g.give('item:scarf'); g.give('letter:2'); g.sent['letter:2'] = 'I will fly anyway.'; })()`);
  await ev(`__game.townMove.dropOnShell()`);
  await T.sim(2);
  const W = () => ev(`(() => { const g = __game, w = g.contents[${T.W}].refs.walker; return JSON.stringify({ mode: w.mode, s: +w.s.toFixed(1), onAmble: g.townMove.onAmble, bag: g.bag.join(','), cur: g.cur }); })()`);
  console.log('start', await W(), await T.state());

  // ---- the swaps: the bakery window, then round the village from the backpack
  await T.put(`__game.townMove.world(__game.townStory.town.houses.find(h => h.name === 'the bakery').door.clone(), new ${V}())`);
  await T.sim(0.3);
  await T.act('townBakery');
  console.log('loaf', await W());
  for (const npc of ['moss2', 'moss1', 'moss5', 'bramwyn', 'moss3']) {
    await T.put(`(() => { const n = __game.townStory.npc('${npc}'); return n.root.position.clone().addScaledVector(n.homeForward, 1.4); })()`);
    await T.sim(0.1);
    await ev(`__game.openTab('bag')`);
    await page.waitForTimeout(300);
    const r = await ev(`(() => { const b = document.querySelector('button.swap'); const t = b ? b.textContent : null; b?.click(); return t; })()`);
    if (npc === 'moss1') { await page.waitForTimeout(500); await page.screenshot({ path: `${T.dir}/g1-bag-swap.png`, timeout: 600000 }); }
    await ev(`__game.closeOverlay()`);
    console.log('swap', npc, r, await W());
  }

  // ---- the postman: after half a minute of riding along on Amble's back
  await ev(`__game.townMove.dropOnShell()`);
  await T.sim(1);
  await T.until(`__game.mode === 'cut'`, 90);
  console.log('post', await W(), await T.state());
  await ev(`__game.fast = 1`);
  await T.sim(4.6); await T.snap('g2-post-bird-antlers');
  await T.sim(2.0); await T.snap('g2b-post-bird-landed');
  await T.sim(3.4); await T.snap('g3-post-down');
  await T.sim(2.2); await T.snap('g4-post-letter');
  await T.sim(6.2); await T.snap('g5-letter-panel');
  await ev(`__game.fast = 10`);
  await T.until(`__game.mode === 'play' && __game.flags.has('letter:3')`, 60);
  console.log('letter', await ev(`JSON.stringify({ has: __game.flags.has('letter:3'), sent: __game.sent })`), await W());

  // ---- the hidden sketch spots: the tail end of the shell, and high in the antlers
  for (const [id, nm] of [['vp-town-tail', 'g6-sketch-tail'], ['vp-town-antlers', 'g7-sketch-antlers']]) {
    await T.put(`${T.pos(id)}.clone()`);
    await T.sim(0.3);
    await T.act(id);
    await ev(`__game.fast = 1`);
    await T.sim(2.7); await T.snap(nm + '-view');
    await T.sim(6.5); await T.snap(nm);
    await ev(`__game.fast = 10`);
    await T.until(`__game.mode === 'play'`, 30);
    console.log('sketch', id, await ev(`JSON.stringify(__game.sketches.map(s => s.id))`), await W());
  }

  // ---- the map: Old Amble where it is now, the task pin, Nilo
  await ev(`__game.townMove.dropOnShell()`);
  await T.sim(1);
  await ev(`__game.openTab('map')`);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${T.dir}/g8-map.png`, timeout: 600000 });
  await ev(`__game.closeOverlay()`);

  // ---- the compass from the meadow: Amble's mark and the task pin
  await T.put(`(() => { const g = __game, P = g.planets[${T.W}], A = g.townMove.amble.root; const d = A.position.clone().sub(P.center).normalize(); const side = new ${V}(1, 0, 0).transformDirection(A.matrixWorld); const q = d.clone().multiplyScalar(P.R).addScaledVector(side, 46).sub(new ${V}()).normalize(); return P.surfacePoint(q, 0.1); })()`, false);
  await T.sim(1.5);
  await ev(`(() => { const g = __game, A = g.townMove.amble.root, pl = g.player; const to = A.position.clone().sub(pl.pos).projectOnPlane(pl.up).normalize(); pl.facing.copy(to.applyAxisAngle(pl.up, 0.5)); pl.sync(); g.rig.faceDir(pl.up, pl.facing); g.rig.snap(); })()`);
  await T.sim(0.5);
  await T.loud();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${T.dir}/g9-compass.png`, timeout: 600000 });
  console.log('compass', await ev(`JSON.stringify(__game.hud.compass.state)`), await ev(`JSON.stringify(!!document.querySelector('.cmark.friend.on, .carrow.friend.on'))`));

  // ---- Esc: the settings
  await page.keyboard.press('Escape');
  await T.sim(0.2);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${T.dir}/g10-settings.png`, timeout: 600000 });
  console.log('esc', await ev(`JSON.stringify({ mode: __game.mode, overlay: __game.overlay })`));
  await ev(`__game.closeOverlay()`);

  // ---- save and Continue: on Amble's back while it walks
  await ev(`__game.townMove.dropOnShell()`);
  await T.sim(4);
  await ev(`__game.save()`);
  const before = await W();
  const saved = await ev(`JSON.stringify(JSON.parse(localStorage.getItem('nilo-save-v5')).town)`);
  console.log('saved', before, saved);
  await page.reload();
  await page.waitForSelector('button[data-a="continue"]', { timeout: 600000 });
  await page.click('button[data-a="continue"]');
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) await page.waitForTimeout(200);
  await T.sim(0.1);
  console.log('continued', await W(), await T.state(), await ev(`JSON.stringify({ sketches: __game.sketches.length, letter3: __game.flags.has('letter:3'), kite: __game.bag.includes('item:kite') })`));
  await T.sim(3);
  console.log('after', await W());
  await T.snap('g11-continued');
};

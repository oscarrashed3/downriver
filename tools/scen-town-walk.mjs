// World 3, the walk (Phase F): TOWNOUT=/dir node tools/play.mjs town-walk
// Amble walks its loop carrying the village; Nilo stands and walks about on it; the folk have new lines; the ropes
// reach the ground; Pip at the lookout sends Amble off to the coast.
import { townSetup } from './townE.mjs';
const DONE = ['town:arrived', 'town:jump-seen', 'town:quest', 'town:met-tamsin', 'town:stone-roped', 'town:foot-done', 'town:met-miller', 'town:sail-fitted', 'town:gap-0', 'town:gap-1', 'town:gap-2', 'town:water-done', 'town:met-bramwyn', ...[0, 1, 2, 3, 4, 5].map(i => 'town:vine-' + i), 'town:eyes-done'];
export default async (ctx) => {
  const T = await townSetup(ctx, DONE);
  const { ev } = ctx;
  await ev(`__game.townMove.dropOnShell()`);
  await T.sim(2);
  const W = () => ev(`(() => { const g = __game, w = g.contents[${T.W}].refs.walker, t = g.townMove; const q = g.player.pos.clone().applyMatrix4(t.town.group.matrixWorld.clone().invert()); return JSON.stringify({ mode: w.mode, s: +w.s.toFixed(1), f: +w.f.toFixed(1), l: +w.l.toFixed(1), onAmble: t.onAmble, nilo: q.toArray().map(v => +v.toFixed(2)), fox: +g.fox.f.root.position.distanceTo(g.player.pos).toFixed(2), rope: t.town.ropeGround.value.slice(0, 6).map(v => +v.toFixed(2)) }); })()`);
  console.log('start', await W(), await T.state());
  // standing still on the walk while Amble walks: carried, not sliding
  const a = await W(); await T.sim(12); const b = await W();
  console.log('carried', a, '->', b);
  // a view from the meadow off its right: Amble walking with the village on its back
  const view = async (name, expr, fov = 58) => {
    await ev(`(() => { const g = __game, A = g.townMove.amble; const AV = (x, y, z) => A.root.localToWorld(new A.root.position.constructor(x, y, z)); const v = (${expr}); g.cutCam = { pos: v[0], look: v[1], up: v[1].clone().sub(g.planets[${T.W}].center).normalize() }; g.fastWas = g.fast; g.fast = 1; g.camera.fov = ${fov}; g.camera.updateProjectionMatrix(); const st = document.createElement('style'); st.id = 'view-css'; st.textContent = '.goal,.compass{display:none!important}'; document.head.append(st); })()`);
    await T.sim(0.05); await ev(`__game.townStory.beam.material.uniforms.uA.value = 0`); await T.snap(name);
    await ev(`(() => { const g = __game; g.cutCam = null; g.rig.override = null; g.fast = g.fastWas; g.camera.fov = 58; g.camera.updateProjectionMatrix(); document.getElementById('view-css')?.remove(); })()`);
  };
  await view('7-walk-meadow', `[AV(-62, 14, 46), AV(0, 13, 4)]`, 46);
  await T.sim(40);
  // (the postman's bird may come by now, after half a minute of riding along: let the scene play out)
  await T.until(`__game.mode === 'play'`, 60);
  console.log('later', await W(), await ev(`__game.flags.has('letter:3')`));
  await view('8-walk-front', `[AV(50, 12, -48), AV(0, 14, 6)]`, 46);
  // Nilo walking along the walk as Amble walks (the usual camera)
  await ev(`__game.townMove.dropOnShell()`);
  await T.sim(1);
  await ev(`__game.fastWas = __game.fast; __game.fast = 1`);
  await T.sim(1.6, ['KeyW']);
  await T.snap('9-nilo-on-moving-town');
  await ev(`__game.fast = __game.fastWas`);
  console.log('walked', await W());
  // the folk have new lines now Amble walks
  for (const id of ['moss3', 'miller']) await T.talk(id);
  console.log('lines', await ev(`JSON.stringify(__game.journal?.length)`));
  // Pip is up on the lookout now: ask to go to the coast
  console.log('pip', await ev(`(() => { const g = __game, n = g.townStory.npc('pip'); return JSON.stringify({ lookout: +n.root.position.distanceTo(g.townMove.town.neck.getWorldPosition(n.root.position.clone())).toFixed(1) }); })()`));
  await T.talk('pip');
  await T.sim(1);
  console.log('coast', await W(), await T.state());
  await T.until(`__game.contents[${T.W}].refs.walker.mode !== 'coast'`, 200);
  console.log('arrived', await W(), await T.state());
};

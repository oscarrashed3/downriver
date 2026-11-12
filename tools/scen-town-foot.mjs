// World 3, step 1 (the stone in the foot), from the arrival on: TOWNOUT=/dir node tools/play.mjs town-foot
import { townSetup } from './townE.mjs';
export default async (ctx) => {
  const T = await townSetup(ctx, []);
  const { ev } = ctx;
  // the arrival plays by itself: the fall (two angles) and the wow shot
  const toBeat = async (i, t) => { for (let n = 0; n < 600 && !(await ev(`__game.seq.i > ${i} || (__game.seq.i === ${i} && __game.seq.t >= ${t})`)); n++) await T.sim(0.1); };
  await toBeat(5, 0.4); await T.snap('0-fall-umbrella');
  await toBeat(5, 3.9); await T.snap('0-fall-village');
  await toBeat(7, 5.6); await T.snap('0-wow');
  console.log('caption at the wow', await ev(`JSON.stringify({ cls: document.querySelector('.caption').className, i: __game.seq.i, t: __game.seq.t })`));
  // the draw calls of one frame there (counted over all the passes of the frame)
  console.log('draw calls at the wow shot', await ev(`(() => { const r = __game.renderer; r.info.autoReset = false; r.info.reset(); __game.frame(); const c = r.info.render.calls; r.info.autoReset = true; return c; })()`));
  await T.sim(3.6);
  await ctx.page.waitForTimeout(500);
  await T.talk('pip');
  await T.talk('ropewright');
  // down the front rope by the sore foot
  const L = `(() => { const t = __game.townMove; const i = t.town.legLines.findIndex(l => l.kind === 'rope' && l.leg[0] === 'F'); return t.lines[i]; })()`;
  await T.put(`__game.townMove.world(${L}.top, new P.center.constructor())`);
  await T.sim(0.5);
  await ev(`(() => { const g = __game; g.townMove.startDown(${L}); })()`);
  await T.sim(3.2, ['KeyS']);
  await ev(`(() => { const g = __game, pl = g.player, t = g.townMove, l = ${L}; const out = t.world(l.top.clone().add(l.out), new pl.pos.constructor()).sub(t.world(l.top, new pl.pos.constructor())).normalize();
    g.rig.override = { pos: pl.pos.clone().addScaledVector(out, 11).addScaledVector(pl.up, -1.2).add(new pl.pos.constructor().crossVectors(pl.up, out).multiplyScalar(5)), look: pl.pos.clone().addScaledVector(pl.up, 0.2), up: pl.up.clone() }; })()`);
  await T.snap('1-climb-down');
  await ev(`__game.rig.override = null`);
  for (let i = 0; i < 80 && (await ev('!!__game.townMove.climb')); i++) await T.sim(0.5, ['KeyS']);
  await T.sim(4, ['KeyS']);
  console.log('at the foot', await T.state(), await ev(`JSON.stringify({ climb: !!__game.townMove.climb, onAmble: __game.townMove.onAmble })`));
  // the stone (walk up to it)
  await T.put(`(() => { const s = ${T.pos('townStone')}.clone(), d = s.clone().sub(P.center).normalize(); const a = g.townMove.amble.root; const f = new s.constructor(0.36, 0, 0.93).transformDirection(a.matrixWorld); return P.surfacePoint(s.addScaledVector(f, 1.6).sub(P.center).normalize()); })()`, false);
  await T.sim(0.6);
  await T.act('townStone');
  await T.sim(4.2); await T.snap('1b-fox-digs');
  await T.until(`__game.mode === 'play'`, 20);
  console.log('roped', await T.state());
  // back up top, at Tamsin's pulley
  await T.put(`(() => { const p = ${T.pos('townPull')}.clone(); return p.addScaledVector(p.clone().sub(P.center).normalize(), 0.3); })()`);
  await T.sim(1.0);
  await T.act('townPull');
  await T.sim(1.6); await T.snap('2-pull-stone');
  await T.sim(2.5); await T.snap('2b-stone-pops');
  await T.until(`__game.mode === 'play'`, 20);
  console.log('foot done', await T.state());
  if (!(await ev(`__game.flags.has('town:foot-done')`))) throw new Error('the foot was not done');
};

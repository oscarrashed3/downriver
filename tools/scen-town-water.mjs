// World 3, step 2 (the water): TOWNOUT=/dir node tools/play.mjs town-water
import { townSetup } from './townE.mjs';
export default async (ctx) => {
  const T = await townSetup(ctx, ['town:arrived', 'town:jump-seen', 'town:quest', 'town:met-tamsin', 'town:stone-roped', 'town:foot-done']);
  const { ev } = ctx;
  console.log('start', await T.state());
  await T.talk('miller');
  // the lost sail, in the garden
  await T.put(`${T.pos('townSail')}.clone().add(new P.center.constructor(0.8, 0.8, 0.8))`);
  await T.sim(1.0);
  await T.act('townSail');
  await T.sim(0.5);
  console.log('sail', await T.state());
  await T.put(`g.townMove.world(g.townStory.tasks.fitSpot.clone().add(new P.center.constructor(0, 0.4, 0)), new P.center.constructor())`);
  await T.sim(1.0);
  await T.snap('3a-carrying-sail');
  await T.act('townFitSail');
  await T.sim(3.35); await T.snap('3-fit-sail');
  await T.until(`__game.mode === 'play'`, 20);
  // three channel pieces from the carpenter's yard into the gaps
  for (let n = 0; n < 3; n++) {
    await T.put(`g.townMove.world(g.townStory.tasks.yardSpot.clone().add(new P.center.constructor(0.9, 0.5, 0.9)), new P.center.constructor())`);
    await T.sim(0.8);
    await T.act('townPiece');
    await T.sim(0.4);
    const gap = await ev(`(() => { const g = __game; for (let n = 0; n < 3; n++) if (!g.flags.has('town:gap-' + n)) return n; return -1; })()`);
    await T.put(`(() => { const p = ${T.pos('townGap' + gap)}.clone(); return p.addScaledVector(p.clone().sub(P.center).normalize(), 0.6); })()`);
    await T.sim(0.8);
    if (n === 0) await T.snap('3b-carrying-piece');
    await T.act('townGap' + gap);
    await T.sim(1.25); if (n === 0) await T.snap('3c-set-piece');
    await T.until(`__game.mode === 'play'`, 10);
    console.log('piece', n, await T.state());
  }
  // the sluice
  await T.put(`(() => { const p = ${T.pos('townSluice')}.clone(); return p.addScaledVector(p.clone().sub(P.center).normalize(), 0.6).add(new P.center.constructor(0.8, 0, 0.8)); })()`);
  await T.sim(0.8);
  await T.act('townSluice');
  await T.sim(1.6 + 7.6); await T.snap('4-water-channel');
  await T.sim(1.4 + 2.5); await T.snap('4b-amble-drinks');
  await T.until(`__game.mode === 'play'`, 20);
  console.log('water done', await T.state());
  if (!(await ev(`__game.flags.has('town:water-done')`))) throw new Error('the water was not done');
};

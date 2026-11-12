// World 3, step 3 (the vines over the eyes) and the big moment: TOWNOUT=/dir node tools/play.mjs town-eyes
import { townSetup } from './townE.mjs';
export default async (ctx) => {
  const T = await townSetup(ctx, ['town:arrived', 'town:jump-seen', 'town:quest', 'town:met-tamsin', 'town:stone-roped', 'town:foot-done', 'town:met-miller', 'town:sail-fitted', 'town:gap-0', 'town:gap-1', 'town:gap-2', 'town:water-done']);
  const { ev, page } = ctx;
  console.log('start', await T.state());
  await T.talk('bramwyn');
  // out along the walk: from the lookout's front, hold W along it for a while (the decks must carry him)
  const WP = (i) => `g.townStory.tasks.rw(g.townStory.tasks.walk[${i}])`;
  await T.put(`${WP(0)}.clone().addScaledVector(${WP(0)}.clone().sub(P.center).normalize(), 0.3)`);
  await ev(`(() => { const g = __game, ts = g.townStory.tasks, pl = g.player; const a = ts.rw(ts.walk[0]), b = ts.rw(ts.walk[1]); pl.facing.copy(b.sub(a)).projectOnPlane(pl.up).normalize(); g.rig.faceDir(pl.up, pl.facing); g.rig.snap(); })()`);
  for (let i = 0; i < 8; i++) {
    await ev(`(() => { const g = __game, ts = g.townStory.tasks, pl = g.player; const s = ts.walkS(pl.pos); const nx = ts.walkAt(s.s + 2); pl.facing.copy(nx.p.clone().sub(pl.pos)).projectOnPlane(pl.up).normalize(); g.rig.faceDir(pl.up, pl.facing); })()`);
    await T.sim(1.0, ['KeyW']);
    console.log('walk', await ev(`(() => { const g = __game, ts = g.townStory.tasks, s = ts.walkS(g.player.pos); return JSON.stringify({ s: +s.s.toFixed(1), off: +s.d.toFixed(2), of: +s.total.toFixed(1), high: ts.high, grounded: g.player.grounded, bram: +ts.bramS.toFixed(1) }); })()`));
  }
  // onto the head platform; Bramwyn catches up
  await T.put(`${WP('g.townStory.tasks.walk.length - 2')}.clone().addScaledVector(${WP('g.townStory.tasks.walk.length - 2')}.clone().sub(P.center).normalize(), 0.4)`);
  await T.sim(14);
  console.log('on the head', await T.state(), await ev(`JSON.stringify({ high: __game.townStory.tasks.high, bram: __game.townStory.tasks.bramS })`));
  for (let n = 0; n < 6; n++) {
    // stand on the platform on the side of the next clump still there, by it
    const next = await ev(`(() => { for (let k = 0; k < 6; k++) if (!__game.flags.has('town:vine-' + k)) return k; return -1; })()`);
    await T.put(`(() => { const ts = g.townStory.tasks, c = ${T.pos('townVine' + next)}.clone(); const e = ts.rw(ts.walk[ts.walk.length - 1]), b = ts.rw(ts.walk[ts.walk.length - 2]); const m = e.clone().lerp(b, 0.4); const side = c.clone().sub(m).projectOnPlane(m.clone().sub(P.center).normalize()); side.setLength(Math.min(0.6, side.length())); return m.add(side).addScaledVector(m.clone().sub(P.center).normalize(), 0.3); })()`);
    await T.sim(0.6);
    // hold E on it, the real way (the prompt here must be one of the clumps: whichever is nearest)
    const pr = await ev(`(() => { const p = __game.interactPrompt(); return p ? p.key : null; })()`);
    console.log('prompt', n, pr);
    if (!pr || !pr.startsWith('townVine')) throw new Error('dead end: the prompt by clump ' + next + ' is ' + pr);
    const i = +pr.slice(8);
    // hold E until this clump comes away (a held E goes on to the next clump, so let go as soon as it is done)
    const held = async (sec) => { for (let n = 0; n < sec * 10 && !(await ev(`__game.flags.has('town:vine-${i}')`)); n++) await T.sim(0.1, ['KeyE']); };
    if (i === 0) {
      await T.sim(0.2, ['KeyE']);
      // from out in front of the face on this side: the vine curtain over the eye, Nilo at it up on the brow
      await ev(`(() => { const g = __game, pl = g.player, A = g.townMove.amble; const c = ${T.pos('townVine0')}.clone(); const h = A.rig.bone('head'); const V3 = pl.pos.constructor;
        const sd = new V3(1, 0, 0).transformDirection(h.matrixWorld), f = new V3(0, 0, 1).transformDirection(h.matrixWorld);
        const side = Math.sign(c.clone().sub(h.getWorldPosition(new V3())).dot(sd)) || 1;
        const e = (side > 0 ? A.eyeL : A.eyeR).getWorldPosition(new V3());
        g.rig.override = { pos: e.clone().addScaledVector(sd.clone().multiplyScalar(side * 0.6).add(f).normalize(), 6.5).addScaledVector(pl.up, 0.8), look: e.clone().lerp(pl.pos.clone().addScaledVector(pl.up, 1.0), 0.4), up: pl.up.clone() }; })()`);
      await T.snap('5-trim-vines');
      await ev(`__game.rig.override = null`);
    }
    await held(3);
    if (!(await ev(`__game.flags.has('town:vine-${i}')`))) throw new Error('clump ' + i + ' was not trimmed');
    await T.sim(1.0);
    console.log('trimmed', i, await T.state());
  }
  // the big moment (it starts a moment after the last clump falls)
  await page.waitForTimeout(1600);
  await T.sim(3.4 + 3.4); await T.snap('6-amble-looks-at-nilo');
  await T.sim(0.6 + 3.2 + 2.6); await T.snap('6b-first-step');
  await T.until(`__game.mode === 'play'`, 20);
  console.log('eyes done', await T.state());
  if (!(await ev(`__game.flags.has('town:eyes-done')`))) throw new Error('the eyes were not done');
};

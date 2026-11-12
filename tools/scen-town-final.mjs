// World 3, a final shot: Nilo on the walkway round the village, the game camera behind him (picture 3).
//   TOWNOUT=/dir [WTH=4.6] node tools/play.mjs town-final
import { townSetup } from './townE.mjs';
export default async (ctx) => {
  const T = await townSetup(ctx, ['town:arrived', 'town:jump-seen', 'town:quest']);
  const { ev } = ctx;
  const th = Number(process.env.WTH ?? 4.6);
  await ev(`(() => { const g = __game, t = g.townMove, P = g.planets[${T.W}], C = P.center.constructor; const ring = t.town.ring, i = Math.max(3, ring.ths.findIndex(x => x > ${th}));
    const at = t.world(ring.P(i, 0.45).add(new C(0, 0.05, 0)), new C()), ahead = t.world(ring.P(i - 2, 0.45), new C());
    const pl = g.player; pl.pos.copy(at); pl.up.copy(at).sub(P.center).normalize(); pl.vel.set(0, 0, 0); pl.grounded = true;
    pl.facing.copy(ahead).sub(at).projectOnPlane(pl.up).normalize(); pl.sync(); t.onAmble = true;
    g.rig.faceDir(pl.up, pl.facing); g.rig.smoothUp.copy(pl.up); g.rig.pitch = 0.28; g.rig.snap(); })()`);
  await T.sim(1.5);
  console.log('state', await T.state());
  await T.quiet();
  await T.snap('walkway');
};

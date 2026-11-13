// World 3, the route network: TOWNOUT=/dir node tools/play.mjs town-route
// Nilo walks the whole route network on Amble's back with the usual controls (W, steering the camera towards each
// next point): right round the ring walk, up the back stairs to the crown, across the square, down the front
// stairs, out along the neck walk to the lookout and back. Every frame it checks he is standing on a walk, a stair,
// a floor or the crown's square (never the moss, the plates or a roof), and that he gets to each point. Then the
// same again round the ring while Amble walks its loop, and a few steps off the inner edge that must be refused.
import { townSetup } from './townE.mjs';
const EARLY = ['town:arrived', 'town:jump-seen', 'town:quest'];
const LATE = ['town:met-tamsin', 'town:stone-roped', 'town:foot-done', 'town:met-miller', 'town:sail-fitted', 'town:gap-0', 'town:gap-1', 'town:gap-2', 'town:water-done', 'town:met-bramwyn', ...[0, 1, 2, 3, 4, 5].map(i => 'town:vine-' + i), 'town:eyes-done'];

export default async (ctx) => {
  const T = await townSetup(ctx, EARLY);
  const { ev } = ctx;
  // the walker, in the page: steer at each point in turn, holding W, and count any frame on the moss
  await ev(`(() => {
    const g = __game, t = g.townMove, N = t.town.paths.nodes;
    window.__walk = (plan, maxSec) => {
      const pl = g.player, inv = new pl.pos.constructor(), out = { bad: 0, badAt: [], frames: 0, stuck: [], reached: 0, minY: 1e9, cam: 0 };
      g.fixedDt = 1 / 30; g.renderEvery = 1e9;
      let k = 0, best = 1e9, still = 0;
      for (let f = 0; f < maxSec * 30 && k < plan.length; f++) {
        // (a scene that comes along on its own, like the postman's bird: let it play through)
        if (g.mode !== 'play') { out.modes = out.modes ?? {}; out.modes[g.mode + (g.overlay ? ':' + g.overlay : '')] = (out.modes[g.mode + (g.overlay ? ':' + g.overlay : '')] ?? 0) + 1; }
        if (g.mode === 'overlay') { g.closeOverlay(); g.frame(); continue; }
        if (g.skyView.open) { g.skyView.exit(); }
        if (g.mode !== 'play') { g.input.pressed.add('Space'); g.input.pressed.add('KeyE'); g.frame(); out.scene = (out.scene ?? 0) + 1; continue; }
        const n = N[plan[k]];
        const w = n.neck ? t.town.neck.localToWorld(n.p.clone()) : t.world(n.p, inv.clone());
        const d = w.clone().sub(pl.pos); d.addScaledVector(pl.up, -d.dot(pl.up));
        const L = d.length();
        if (L < 0.9) { k++; out.reached++; best = 1e9; still = 0; continue; }
        if (L < best - 0.03) { best = L; still = 0; } else if (++still > 240) {
          const q = pl.pos.clone().applyMatrix4(t.town.group.matrixWorld.clone().invert());
          const near = g.planets[g.cur].solids.filter(so => so.obj.position.distanceTo(pl.pos) < 4).map(so => ({ k: so.shape.kind, id: so.id, d: +so.obj.position.distanceTo(pl.pos).toFixed(1), sz: so.shape.kind === 'box' ? [+so.shape.hw.toFixed(1), +so.shape.hd.toFixed(1)] : so.shape.r, h: so.h })).slice(0, 6);
          const ns = null, lq = null;
          out.stuck.push({ node: plan[k], kind: n.kind, left: +L.toFixed(2), at: q.toArray().map(v => +v.toFixed(1)), onDeck: pl.onDeck, gr: pl.grounded, plaza: t.town.onPlaza(q.x, q.z), near, npc: g.contents[g.cur].npcs.filter(m => m.root.position.distanceTo(pl.pos) < 2).map(m => m.id), fox: +g.fox.f.root.position.distanceTo(pl.pos).toFixed(1) }); k++; best = 1e9; still = 0; continue; }
        g.rig.ref.copy(d).normalize(); g.rig.yaw = 0;
        g.input.down.add('KeyW'); g.frame(); out.frames++;
        const q = pl.pos.clone().applyMatrix4(t.town.group.matrixWorld.clone().invert());
        if (t.onAmble && pl.grounded && !pl.onDeck && !t.town.onPlaza(q.x, q.z, -0.15) && t.town.deckTop(q.x, q.z, q.y - 0.4, 0.85, 0) === null) { out.bad++; if (out.badAt.length < 5) out.badAt.push(q.toArray().map(v => +v.toFixed(1))); }
        // the camera: never under Nilo's feet, never inside the shell
        const c = g.camera.position.clone().applyMatrix4(t.town.group.matrixWorld.clone().invert());
        if (t.onAmble && c.y < q.y + 0.3) out.cam++;
        if (out.farAt === undefined && g.camera.position.distanceTo(pl.pos) > 60) out.farAt = { f, k, sky: [g.skyView.dir, +g.skyView.k.toFixed(2)], mode: g.mode, rig: +g.rig.pos.distanceTo(pl.pos).toFixed(1) };
        (out.trail = out.trail ?? []).push([...q.toArray().map(v => +v.toFixed(2)), pl.onDeck ? 1 : 0, pl.grounded ? 1 : 0, +pl.vel.dot(pl.up).toFixed(2)]); if (out.trail.length > 30) out.trail.shift(); 
        if (pl.grounded) out.lastG = { q: q.toArray().map(v => +v.toFixed(1)), deck: pl.onDeck, k };
        if (!out.fell && q.y < 12 && !t.climb) { out.fell = { node: plan[k], kind: n.kind, f, from: out.lastG, trail: out.trail.slice(-12), nw: [t.town.neckWalk.a, t.town.neckWalk.b].map(v => t.town.neck.localToWorld(v.clone()).applyMatrix4(t.town.group.matrixWorld.clone().invert()).toArray().map(x => +x.toFixed(2))), ringF: [0, 0.4, 0.97].map(f => t.town.ring.P(t.town.ring.near(Math.PI / 2), f).toArray().map(x => +x.toFixed(2))) }; }
      }
      g.input.down.delete('KeyW'); g.renderEvery = 1; g.fixedDt = 1e-5;
      out.left = plan.length - k; delete out.trail;
      return JSON.stringify(out);
    };
    window.__plan = (which) => {
      const ring = t.town.ring, n = ring.n, S = t.town.stairRuns;
      const pos = () => g.player.pos.clone().applyMatrix4(t.town.group.matrixWorld.clone().invert());
      const nearRing = () => { const q = pos(); let bi = 0, bd = 1e9; for (let i = 0; i < n; i++) { const d = N[i].p.distanceTo(q); if (d < bd) { bd = d; bi = i; } } return bi; };
      const byKind = (kind, p) => { let bi = -1, bd = 1e9; N.forEach((x, i) => { if (x.kind !== kind) return; const d = x.p.distanceTo(p); if (d < bd) { bd = d; bi = i; } }); return bi; };
      const s0 = nearRing();
      if (which === 'ring') { const out = []; for (let i = 1; i <= n; i += 1) out.push((s0 + i) % n); return out; }
      if (which === 'up-across-down') {
        const back = S[1], front = S[0];
        const out = [];
        for (let i = s0; i !== back.ring; i = (i + 1) % n) out.push(i);
        out.push(back.ring, byKind('foot', back.foot), byKind('turn', back.turn), byKind('top', back.top));
        out.push(...t.routePath(byKind('top', back.top), byKind('top', front.top)).slice(1));
        out.push(byKind('turn', front.turn), byKind('foot', front.foot), front.ring);
        return out;
      }
      if (which === 'neck') {
        const jf = ring.near(Math.PI / 2), out = [];
        for (let i = s0; i !== jf; i = (i + (((jf - s0 + n) % n) < n / 2 ? 1 : -1) + n) % n) out.push(i);
        const a = N.findIndex(x => x.kind === 'neck');
        out.push(jf, a, a + 1, a + 2, a + 1, a, jf);
        return out;
      }
      return [];
    };
  })()`);
  const walk = async (label, which, sec) => {
    const plan = await ev(`JSON.stringify(__plan('${which}'))`);
    const r = JSON.parse(await ev(`__walk(${plan}, ${sec})`));
    console.log('walked', label, JSON.stringify(r), await ev(`(() => { const g = __game, t = g.townMove, q = g.player.pos.clone().applyMatrix4(t.town.group.matrixWorld.clone().invert()); return JSON.stringify({ camDist: +g.camera.position.distanceTo(g.player.pos).toFixed(1), rigDist: +g.rig.pos.distanceTo(g.player.pos).toFixed(1), onAmble: t.onAmble, onDeck: g.player.onDeck, at: q.toArray().map(v => +v.toFixed(1)) }); })()`));
    return r;
  };
  const problems = [];
  const check = (label, r) => { if (r.bad) problems.push(`${label}: ${r.bad} frames on the moss ${JSON.stringify(r.badAt)}`); if (r.stuck.length || r.left) problems.push(`${label}: stuck ${JSON.stringify(r.stuck)} left ${r.left}`); if (r.fell) problems.push(`${label}: fell off ${JSON.stringify(r.fell)}`); if (r.cam) problems.push(`${label}: camera under him ${r.cam} frames`); };
  // (the ride in to the world can still hold the camera when the setup cuts it short)
  await ev(`(() => { const g = __game; if (g.mode === 'play' && !g.cutCam && !g.talkCam) { g.rig.override = null; g.rig.ease = null; g.rig.snap(); } })()`);
  await ev(`__game.townMove.dropOnShell()`);
  await T.sim(1.5);
  console.log('start', await ev(`JSON.stringify({ d: +__game.camera.position.distanceTo(__game.player.pos).toFixed(1), sky: [__game.skyView.dir, __game.skyView.k], mode: __game.mode })`));
  // Amble standing still
  if (process.env.ROUTE_LATE) {
    await ev(`(() => { const g = __game; for (const f of ${JSON.stringify([...LATE])}) g.flags.add(f); })()`);
    await T.sim(6); await ev(`__game.townMove.dropOnShell()`); await T.sim(1);
    const r = await walk('neck walk, Amble walking', 'neck', 120); console.log(JSON.stringify(r.fell ?? null)); return;
  }
  check('ring loop', await walk('ring loop', 'ring', 200));
  await T.snap('route-1-ring');
  // the ring walk from the play camera, on an open stretch, looking along it
  for (const [nm, th] of [['route-1a-ring', 0.75], ['route-1a-ring2', 2.45]]) {
    await ev(`(() => { const g = __game, t = g.townMove, pl = g.player, ring = t.town.ring, P = g.planets[${T.W}], j = ring.near(${th});
      const at = t.world(ring.P(j, 0.45).setY(ring.yd[j] + 0.05), pl.pos.clone()); pl.pos.copy(at); pl.up.copy(at).sub(P.center).normalize(); pl.vel.set(0, 0, 0); pl.sync();
      const d = t.world(ring.P(j + 2, 0.45), pl.pos.clone()).sub(pl.pos).projectOnPlane(pl.up).normalize(); pl.facing.copy(d); g.rig.faceDir(pl.up, d); g.rig.snap(); })()`);
    await T.sim(0.6, ['KeyW']);
    await T.sim(1.6);
    await T.snap(nm);
  }
  if (process.env.ROUTE_QUICK) return;
  // the play camera on the stairs: half way up the back stairs
  await ev(`(() => { const g = __game, t = g.townMove, S = t.town.stairRuns[1], N = t.town.paths.nodes; const f = N.findIndex(x => x.kind === 'foot' && x.p.distanceTo(S.foot) < 0.1); window.__stairPlan = [S.ring, f, f + 1]; })()`);
  { const r = JSON.parse(await ev(`__walk(__stairPlan.slice(0, 2), 40)`)); check('to the back stairs', r); }
  await ev(`(() => { const g = __game, t = g.townMove, S = t.town.stairRuns[1], pl = g.player; const d = t.world(S.turn, pl.pos.clone()).sub(pl.pos).projectOnPlane(pl.up).normalize(); g.rig.ref.copy(d); g.rig.yaw = 0; })()`);
  await T.sim(1.2, ['KeyW']);
  await T.sim(1.5);
  await T.snap('route-1b-stairs');
  // (back down onto the ring walk a little way round from the stairs' foot)
  await ev(`(() => { const g = __game, t = g.townMove, pl = g.player, ring = t.town.ring, j = t.town.stairRuns[1].ring; const at = t.world(ring.P(j - 3, 0.5).setY(ring.yd[(j - 3 + ring.n) % ring.n] + 0.05), pl.pos.clone()); pl.pos.copy(at); pl.vel.set(0, 0, 0); pl.sync(); g.rig.snap(); })()`);
  await T.sim(1);
  check('stairs and crown', await walk('stairs and crown', 'up-across-down', 200));
  // a few steps straight in off the ring's inner edge (through the railing, and just beside the front stairs' foot): refused
  const off = await ev(`(() => { const g = __game, t = g.townMove, pl = g.player, ring = t.town.ring; t.dropOnShell(); g.fixedDt = 1 / 30; g.renderEvery = 1e9;
    const res = [];
    for (const f of [0, 1]) {
      const j = t.town.stairRuns[0].ring, i = f ? j : ring.near(5.9); const at = t.world(f ? ring.P(j + 1, 0.4).lerp(ring.P(j, 0.4), 0.3) : ring.P(i, 0.4), pl.pos.clone()); pl.pos.copy(at); pl.vel.set(0, 0, 0); pl.sync();
      for (let k = 0; k < 20; k++) g.frame();
      const inw = t.world(ring.P(i, -2), pl.pos.clone()).sub(pl.pos); g.rig.ref.copy(inw.projectOnPlane(pl.up).normalize()); g.rig.yaw = 0;
      for (let k = 0; k < 90; k++) { g.input.down.add('KeyW'); g.frame(); }
      g.input.down.delete('KeyW');
      const q = pl.pos.clone().applyMatrix4(t.town.group.matrixWorld.clone().invert());
      res.push({ onDeck: pl.onDeck || t.town.deckTop(q.x, q.z, q.y - 0.4, 0.85, 0) !== null, onPlaza: t.town.onPlaza(q.x, q.z, -0.15), y: +q.y.toFixed(2) });
    }
    g.renderEvery = 1; g.fixedDt = 1e-5; return JSON.stringify(res); })()`);
  console.log('off the inner edge', off);
  if (JSON.parse(off).some(o => !o.onDeck && !o.onPlaza)) problems.push('stepped off the inner edge onto the moss ' + off);
  // inside Bramble Cottage: in through its door off the ring walk, the camera in close
  await ev(`(() => { const g = __game, t = g.townMove, h = t.town.houses.find(x => x.name === 'Bramble Cottage'), pl = g.player, P = g.planets[${T.W}];
    const inn = h.at.clone().lerp(h.door, 0.35); const y = t.town.walkTop(inn.x, inn.z, h.door.y); inn.y = (y ?? h.door.y) + 0.05;
    const at = t.world(inn, pl.pos.clone()); pl.pos.copy(at); pl.up.copy(at).sub(P.center).normalize(); pl.vel.set(0, 0, 0); pl.sync();
    const inw = t.world(h.at, pl.pos.clone()).sub(pl.pos).projectOnPlane(pl.up).normalize(); pl.facing.copy(inw); g.rig.faceDir(pl.up, inw); g.rig.snap(); })()`);
  await T.sim(0.5);
  await T.sim(0.4, ['KeyW']);
  await T.sim(2.5);
  console.log('inside', await ev(`JSON.stringify({ in: __game.townMove.houseIn()?.name ?? null, dist: +__game.camera.position.distanceTo(__game.player.pos).toFixed(2) })`));
  await T.snap('route-1c-inside');
  // the beam and the goal line lead up the stairs to the Miller (on the crown) from the ring walk
  await ev(`(() => { const g = __game; for (const f of ['town:met-tamsin', 'town:stone-roped', 'town:foot-done']) g.flags.add(f); g.townMove.dropOnShell(); })()`);
  await T.sim(1);
  const beam = await ev(`(() => { const g = __game, ts = g.townStory, t = g.townMove; const b = ts.beam.position.clone().sub(g.planets[${T.W}].center).normalize().multiplyScalar(g.player.pos.distanceTo(g.planets[${T.W}].center)).add(g.planets[${T.W}].center); return JSON.stringify({ hint: t.routeHint, goal: ts.goal(), toBeam: +b.distanceTo(g.player.pos).toFixed(1), toMiller: +ts.npc('miller').root.position.distanceTo(g.player.pos).toFixed(1) }); })()`);
  console.log('beam', beam);
  if (JSON.parse(beam).hint !== 'up') problems.push('beam does not lead up the stairs ' + beam);
  await T.snap('route-2-beam');
  // now Amble walks its loop: round the ring again, carried
  await ev(`(() => { const g = __game; for (const f of ${JSON.stringify(LATE)}) g.flags.add(f); })()`);
  await T.sim(6);
  console.log('walker', await ev(`__game.contents[${T.W}].refs.walker.mode`));
  await ev(`__game.townMove.dropOnShell()`);
  await T.sim(1);
  check('ring loop, Amble walking', await walk('ring loop, Amble walking', 'ring', 200));
  check('stairs, Amble walking', await walk('stairs, Amble walking', 'up-across-down', 200));
  check('neck walk, Amble walking', await walk('neck walk, Amble walking', 'neck', 120));
  await T.snap('route-3-walking');
  console.log(problems.length ? 'ROUTE PROBLEMS\n' + problems.join('\n') : 'ROUTE OK: never off the walks');
};

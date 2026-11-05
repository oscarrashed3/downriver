// Step 4 done-check: play world 1 from a fresh start to the farewell by walking only.
// An in-page autopilot follows the golden beam (the game's own guide target) and presses only the keys a player would:
// W, Shift, Space, E (tap or hold), Q, digits for cards, Esc. Nobody is ever moved by the test.
export default async ({ page, shot, ev, key }) => {
  const st = () => ev(`(() => { const g = __game; return { mode: g.mode, step: g.lastGoal, t: Math.round(performance.now() / 1000), flags: [...g.flags] }; })()`);
  await page.click('button[data-a="new"]');
  await ev(`(() => { const g = __game; g.trailOn = true; g.seq.speed = 12; g.renderEvery = 40;
  const inp = g.input, A = window.__auto = { log: [], stuck: 0, last: null, lastT: 0, strafe: 0, mode: '' };
  const down = (k, on) => { if (on) { if (!inp.down.has(k)) inp.pressed.add(k); inp.down.add(k); } else inp.down.delete(k); };
  const tap = k => { inp.pressed.add(k); };
  const release = () => ['KeyW', 'ShiftLeft', 'KeyE', 'Space', 'KeyA', 'KeyD'].forEach(k => inp.down.delete(k));
  let spaceT = 0;
  setInterval(() => {
    if (A.paused) return;
    const now = g.time;
    if (g.mode !== A.mode) { A.log.push(Math.round(now) + 's ' + g.mode); A.mode = g.mode; release(); }
    if (g.mode === 'cut') { if (now - spaceT > 0.6) { tap('Space'); spaceT = now; } return; }
    if (g.mode === 'letter') { tap('KeyE'); return; }
    if (g.mode === 'overlay') { tap('Escape'); return; }
    if (g.mode === 'talk') {
      down('Space', true);
      if (g.hud.dlg.querySelector('.card')) tap('Digit1');
      return;
    }
    if (g.mode !== 'play') { release(); return; }
    if (g.flags.has('chapter1-complete')) { release(); return; }
    down('Space', false);
    if (g.meet) { release(); return; }
    const n = g.nearest;
    if (n && n.key === 'letter') { tap('KeyE'); return; }
    const target = g.ch1.guideTarget();
    // the thing in front of us is what the goal wants: use it
    const itPos = !n ? null : n.key.startsWith('npc:') ? g.contents[0].npcs.find(x => 'npc:' + x.id === n.key).root.position : g.contents[0].interactables.find(x => x.id === n.key)?.pos;
    const wantKey = n && target && itPos && itPos.distanceTo(target) < 2.5;
    const pl = g.player;
    const dist = target ? target.distanceTo(pl.pos) : 0;
    if (n && wantKey && dist < 5.5 && !(n.key === 'hollofire' && !g.flags.has('gathered'))) {
      release();
      if (n.hold) down('KeyE', true); else tap('KeyE');
      return;
    }
    down('KeyE', false);
    if (!target) { release(); return; }  // waiting (for Nima, or a scene)
    if (g.flags.has('flag:tor-fences') && g.flags.has('power:skyreading') && !g.skyread.active && !g.flags.has('fences-done')) tap('KeyQ');
    const dir = target.clone().sub(pl.pos).projectOnPlane(pl.up);
    if (dir.length() < 1.6) { release(); return; }
    dir.normalize();
    // stuck? walk off at an angle for a couple of seconds, like a player going round something
    if (now < A.strafe) dir.applyAxisAngle(pl.up, (A.stuck % 2 ? 1 : -1) * 1.2);
    g.rig.faceDir(pl.up, dir);
    down('KeyW', true);
    down('ShiftLeft', !g.flags.has('goat-following') && dist > 6);
    if (!A.last || now - A.lastT > 1.5) {
      if (A.last && A.last.distanceTo(pl.pos) < 1 && now > A.strafe) {
        A.stuck++; A.strafe = now + 2.2 + (A.stuck % 4); tap('Space');
        const ll = g.planet.latLonOf ? '' : '';
        A.log.push(Math.round(now) + 's stuck ' + A.stuck + ' dist ' + dist.toFixed(1) + ' goal ' + (g.lastGoal || '') + ll);
      }
      A.last = pl.pos.clone(); A.lastT = now;
    }
  }, 50);
  })()`);
  const shots = new Set();
  const snap = async label => { await ev('__game.renderEvery = 1'); await page.waitForTimeout(400); await shot(label); await ev('__game.renderEvery = 40'); };
  const once = async (id, label, wait = 0) => { if (shots.has(id)) return; shots.add(id); if (wait) await page.waitForTimeout(wait); await snap(label); };
  const t0 = Date.now();
  let lastStep = '';
  while (Date.now() - t0 < 40 * 60 * 1000) {
    await page.waitForTimeout(700);
    const s = await st();
    const f = new Set(s.flags);
    if (Date.now() - (globalThis.__hb ?? 0) > 15000) { globalThis.__hb = Date.now(); console.log('  hb', await ev(`(() => { const g = __game, t = g.ch1.guideTarget(); return [Math.round(g.time), g.mode, t ? Math.round(t.distanceTo(g.player.pos)) : -1, g.nearest && g.nearest.key, Math.round(g.player.vel.length())].join(' '); })()`)); }
    const lg = await ev('__auto.log.splice(0)'); for (const l of lg) console.log('  ' + l);
    if (s.step !== lastStep) { console.log(`${Math.round((Date.now() - t0) / 1000)}s (game ${Math.round(await ev('__game.time'))}s, ${Math.round(await ev('__game.fps'))} fps) goal: ${s.step}`); lastStep = s.step; }
    if (f.has('area:village') && !shots.has('village')) await once('village', 'village-name', 300);
    if (s.mode === 'play' && (await ev('!!__game.meet')) && !shots.has('meet' + (await ev('__game.meet && __game.meet.npc.id')))) await once('meet' + (await ev('__game.meet && __game.meet.npc.id')), 'first-meeting', 500);
    if (f.has('quest:kite') && !f.has('item:spar') && (await ev('__game.player.pos.distanceTo(__game.ch1.R.spar.position) < 14'))) await once('spar', 'willow-glows');
    if (f.has('flag:tor-follow-active') && (await ev('__game.player.pos.distanceTo(__game.ch1.at([60,30])) < 10'))) await once('cairns', 'walking-with-tor');
    if (f.has('flag:tor-fences') && (await ev('__game.skyread.active'))) await once('posts', 'fence-posts', 1500);
    if ((await ev('__game.ch1.nimaRun')) === 'run') await once('nima', 'nima-runs', 600);
    if (f.has('invited:bram') && f.has('invited:nima') && s.mode === 'play' && !shots.has('map1')) { shots.add('map1'); await ev('__auto.paused = true'); await page.waitForTimeout(300); await key('KeyM'); await page.waitForTimeout(2500); await snap('map-invited'); await key('Escape'); await ev('__auto.paused = false'); }
    if (f.has('chapter1-complete')) break;
  }
  const s = await st();
  console.log('done', s.mode, s.flags.includes('chapter1-complete') ? 'FAREWELL REACHED' : 'NOT FINISHED', Math.round((Date.now() - t0) / 1000) + 's');
  await ev('__auto.paused = true');
  await page.waitForTimeout(3000);
  await ev(`__game.mode = 'play'`);
  await ev('__game.renderEvery = 1'); await key('KeyM'); await page.waitForTimeout(3000); await shot('route-on-map');
};

// Step 4 close-ups: the village from the path, the first meeting, the glowing willow, the cairns with Tor, the wind posts.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.seq.speed = 30; })()`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  const go = (flags, at, look, pitch = 0.15) => ev(`(() => { const g = __game, p = g.planets[0]; ${JSON.stringify(flags)}.forEach(f => g.give(f));
    g.player.placeAt(p, p.dirRiver(${at[0]}, ${at[1]})); g.rig.faceDir(g.player.up, p.surfacePoint(p.dirRiver(${look[0]}, ${look[1]})).sub(g.player.pos)); g.rig.pitch = ${pitch}; g.rig.snap(); g.day.setLocal(g.player.up, 0.42); })()`);
  // the same view as the "before" shot: the village from the path
  await go(['talked:ysolde', 'quest:hollo', 'met:ysolde', 'met:tor', 'area:village', 'area:spring'], [53, -15.8], [58.6, -14.2]);
  await page.waitForTimeout(5000); await shot('village-from-path');
  // walk up to Tor: the camera turns to him for a moment
  await ev(`__game.flags.delete('met:tor')`);
  await go([], [55.5, -15.6], [58.6, -14.2]);
  for (let i = 0; i < 40 && !(await ev('!!__game.meet && __game.meet.t > 0.6')); i++) await page.waitForTimeout(100);
  await shot('first-meeting');
  for (let i = 0; i < 80 && (await ev('!!__game.meet')); i++) await page.waitForTimeout(100);
  await go([], [57.6, -15.2], [58.6, -14.2], 0.2);
  await page.waitForTimeout(2500); await shot('name-tag-and-kite');
  // the willow branch glows once Tor asks for it
  await go(['talked:tor', 'quest:kite'], [17.5, 13.5], [12.8, 9.6], 0.25);
  await ev(`(() => { const g = __game, p = g.planets[0], sp = g.ch1.R.spar.position, tr = g.ch1.R.tree.position;
    const d = sp.clone().sub(tr).projectOnPlane(sp.clone().sub(p.center).normalize()).normalize();
    g.player.placeAt(p, p.dirRiver(20, 12));
    g.rig.faceDir(g.player.up, sp.clone().sub(g.player.pos)); g.rig.pitch = 0.35; g.rig.snap(); })()`);
  await page.waitForTimeout(3500); await shot('willow-glows');
  // cairns on the way up to Kite Ridge, Tor walking along
  await go(['item:spar', 'flag:tor-follow', 'flag:tor-follow-active'], [62.5, 23.5], [54, 39], 0.3);
  await page.waitForTimeout(4000); await shot('cairns-to-ridge');
  // the wind posts on the windward ridges
  await ev(`(() => { const g = __game; g.flags.delete('flag:tor-follow-active'); ['kite-flown', 'power:skyreading', 'talked:bram', 'quest:goat', 'goat-home', 'flag:tor-fences'].forEach(f => g.give(f)); g.ch1.sendHome(g.ch1.npc('tor'));
    const s = g.snow.sites.find(x => x.id === 'fence-saddle'), c = g.ch1.R.cairns[s.id].position, p = g.planets[0];
    const up = c.clone().sub(p.center).normalize(); const d = c.clone().sub(p.center).normalize().applyAxisAngle(new THREE.Vector3(1,0,0), 0).clone();
    g.skyread.active = true; })()`).catch(() => {});
  await ev(`(() => { const g = __game, p = g.planets[0], s = g.ch1.R.cairns['fence-saddle'].position;
    const dir = s.clone().sub(p.center).normalize(); const t = new (g.player.pos.constructor)(0, 1, 0).cross(dir).normalize();
    const at = dir.clone().applyAxisAngle(t, 22 / p.R); g.player.placeAt(p, at); g.rig.faceDir(g.player.up, s.clone().sub(g.player.pos)); g.rig.pitch = 0.1; g.rig.snap(); g.skyread.active = true; })()`);
  await page.waitForTimeout(4000); await shot('wind-posts');
};

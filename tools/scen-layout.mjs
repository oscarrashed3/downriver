// Where everyone stands: distance from each person to the nearest path, and a look at the village from the path.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  const info = await ev(`(() => { const g = __game, p = g.planets[0];
    const pts = []; for (const path of p.paths) for (let i = 0; i + 1 < path.pts.length; i++) for (let t = 0; t <= 1; t += 0.05) pts.push(p.surfacePoint(path.pts[i].clone().lerp(path.pts[i + 1], t).normalize()));
    const out = {};
    for (const n of g.contents[0].npcs) out[n.id] = Math.round(Math.min(...pts.map(q => q.distanceTo(n.root.position))));
    out.playerStart = Math.round(g.player.pos.distanceTo(g.contents[0].npcs.find(n => n.id === 'ysolde').root.position));
    out.holloToPlayer = Math.round(g.player.pos.distanceTo(g.ch1.hollo.root.position));
    out.sites = g.snow.sites.map(s => s.id + ':' + Math.round(Math.min(...pts.map(q => q.distanceTo(g.ch1.R.cairns[s.id].position)))));
    return out; })()`);
  console.log(JSON.stringify(info));
  await shot('wake');
  await ev(`(() => { const g = __game, p = g.planets[0]; g.give('read-letter'); ['talked:ysolde', 'quest:hollo'].forEach(f => g.give(f));
    g.player.placeAt(p, p.dirRiver(53, -15.8)); g.rig.faceDir(g.player.up, p.surfacePoint(p.dirRiver(62.6, -12.6)).sub(g.player.pos)); g.rig.pitch = 0.15; g.rig.snap(); g.mode = 'play'; })()`);
  await page.waitForTimeout(5000); await shot('village-from-path');
};

// The real rides between worlds (not a teleport): World 1's edge down the falling stream into the Sky Isles, then the
// Sky Isles' edge down into the Garden. A shot during each fall, one just before landing, one after, and a raft trip
// over the Sky Isles' first step.
export default async ({ page, shot, ev }) => {
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  const report = (label) => ev(`(() => { const g = __game, p = g.planet; const d = g.player.pos.clone().sub(p.center); const r = d.length(); d.normalize(); const rn = p.riverNearest(d);
    return { label: '${label}', world: p.cfg.id, mode: g.mode, aboveGround: +(r - p.surfaceRadius(d)).toFixed(2), aboveWater: +(r - p.waterLevelRadius(rn.t)).toFixed(2), riverDist: +rn.dist.toFixed(2) }; })()`).then(x => console.log(JSON.stringify(x)));
  for (const [from, to] of [[0, 1], [1, 2]]) {
    await ev(`(() => { const g = __game; g.enterWorld(${from}, false); g.mode = 'play'; g.startRide(${from}, ${to}); g.ride.s = 0.55; g.timeScale = 0.001; })()`);
    await page.waitForTimeout(3000); await shot(`ride${from}${to}-fall`);
    await ev(`(() => { const g = __game; g.ride.s = 0.84; })()`);
    await page.waitForTimeout(3000); await shot(`ride${from}${to}-landing`);
    // where the ribbon meets the next world: the curve's last point against the spring's water
    console.log(JSON.stringify(await ev(`(() => { const g = __game, b = g.planets[${to}], a = g.planets[${from}], c = g.ride.curve.getPoint(1), s = g.ride.curve.getPoint(0); const d = c.clone().sub(b.center), e = s.clone().sub(a.center);
      return { startAboveEndWater: +(e.length() - a.waterLevelRadius(1)).toFixed(2), endAboveSpringWater: +(d.length() - b.waterLevelRadius(0)).toFixed(2), endAboveGround: +(d.length() - b.surfaceRadius(d.normalize())).toFixed(2) }; })()`)));
    await ev(`(() => { const g = __game; g.timeScale = 1; g.ride.s = 0.99; })()`);
    for (let i = 0; i < 60 && (await ev('__game.mode')) !== 'play'; i++) await page.waitForTimeout(200);
    await page.waitForTimeout(2500); await report(`arrived ${to}`); await shot(`ride${from}${to}-arrived`);
  }
  // a raft trip in the Sky Isles, over the first step
  await ev(`(() => { const g = __game; g.enterWorld(1, false); g.mode = 'play'; g.player.placeAt(g.planets[1], g.arrivalDir(1)); g.boardRaft(0.12); g.timeScale = 1; })()`);
  await page.waitForTimeout(2500); await report('raft before step'); await shot('raft-sky-before');
  await ev(`(() => { const g = __game; g.player.raftT = 0.168; g.timeScale = 0.001; })()`);
  await page.waitForTimeout(2500); await report('raft on step'); await shot('raft-sky-step');
  await ev(`(() => { const g = __game; g.timeScale = 1; })()`);
};

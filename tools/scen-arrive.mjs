// Where Nilo lands on each world after the first (stream ride, Worlds tab, sky travel): on dry bank beside the dock.
export default async ({ page, shot, ev }) => {
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  for (const w of [1, 2, 3]) {
    await ev(`(() => { const g = __game, p = g.planets[${w}]; g.enterWorld(${w}, false); g.player.placeAt(p, g.arrivalDir(${w})); g.meet = null; g.cutCam = null; g.rig.override = null; g.mode = "play"; g.player.facing.copy(p.surfacePoint(p.dirRiver(20, 0)).sub(g.player.pos).projectOnPlane(g.player.up).normalize()); g.rig.faceDir(g.player.up, g.player.facing); g.rig.snap(); })()`);
    await page.waitForTimeout(3500);
    const info = await ev(`(() => { const g = __game, p = g.planets[${w}]; const d = g.player.pos.clone().sub(p.center).normalize(); return { dist: +p.riverNearest(d).dist.toFixed(2), aboveWater: +(p.height(d) - p.cfg.riverBed - p.cfg.waterDepth).toFixed(2) }; })()`);
    console.log('world', w, JSON.stringify(info));
    await shot('world' + w);
  }
};

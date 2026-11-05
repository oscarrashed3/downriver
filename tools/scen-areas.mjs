// Step 5: a fresh start shows a blank map; walk into three areas and the map shows exactly those three, named.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.seq.speed = 30; })()`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  // the very first moment: nothing named yet
  await ev(`__game.flags.forEach(f => f.startsWith('area:') && __game.flags.delete(f))`);
  await ev(`__game.updateAreas = () => {}`); // hold the first banner back for this one picture
  await key('KeyM'); await page.waitForTimeout(2500); await shot('map-fresh');
  await key('KeyM'); await page.waitForTimeout(500);
  await ev(`delete __game.updateAreas`);
  const visit = async (ll, look, label, wait = 4500) => {
    await ev(`(() => { const g = __game, p = g.planets[0]; g.player.placeAt(p, p.dirRiver(${ll[0]}, ${ll[1]})); g.rig.faceDir(g.player.up, p.surfacePoint(p.dirRiver(${look[0]}, ${look[1]})).sub(g.player.pos)); g.rig.pitch = 0.18; g.rig.snap(); g.day.setLocal(g.player.up, 0.4); })()`);
    await page.waitForTimeout(wait); if (label) await shot(label);
  };
  await visit([19, -3], [13, 0], 'area-spring');
  await page.waitForTimeout(4000);
  await visit([55, -16.5], [60.5, -17], 'area-village');
  await page.waitForTimeout(4000);
  await visit([52, 42], [50, 50], 'area-ridge');
  await page.waitForTimeout(4000);
  console.log('named', JSON.stringify(await ev(`[...__game.flags].filter(f => f.startsWith('area:'))`)));
  await key('KeyM'); await page.waitForTimeout(2500); await shot('map-three-areas');
};

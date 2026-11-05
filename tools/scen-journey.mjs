// Raft down the Spring Peaks, ride the falling stream, arrive in the Ember Pines.
export default async ({ page, shot, ev, key }) => {
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 20 && (await ev('__game.mode')) !== 'play'; i++) { await key('Space', 120); await page.waitForTimeout(400); }
  await page.waitForTimeout(800);
  await ev(`(() => { const g = __game; g.player.hasDrop = true; g.flags.add('has-drop'); g.give('power:skyreading'); g.give('map:valley'); g.give('map:chimes'); const p = g.planets[0]; g.player.placeAt(p, p.dirRiver(40.2, 11.5)); g.rig.snap(); g.skyread.active = true; })()`);
  await page.waitForTimeout(2500); await shot('skyreading');
  await key('KeyM'); await page.waitForTimeout(1500); await shot('map'); await key('KeyM', 400); await page.waitForTimeout(1500);
  await ev(`__game.skyread.active = false`);
  await ev(`(() => { const g = __game; const p = g.planets[0]; g.player.placeAt(p, p.dirRiver(150, 1)); g.rig.snap(); g.boardRaft(); })()`);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(3000); await shot('raft'); await page.keyboard.up('KeyW');
  await ev(`(() => { const g = __game; g.player.raftT = 0.985; })()`);
  await page.waitForTimeout(3000);
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(1500); await shot('ride' + i); console.log('story', await ev("document.querySelector('.story').className + ' ' + __game.mode + ' ' + __game.ride?.s")); const m = await ev('__game.mode'); if (m !== 'ride') break; }
  await page.waitForTimeout(2500); await shot('arrived');
  console.log(await ev(`JSON.stringify({ mode: __game.mode, cur: __game.cur })`));
};

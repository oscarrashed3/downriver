export default async ({ page, shot, ev, key }) => {
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 20 && (await ev('__game.mode')) !== 'play'; i++) { await key('Space', 120); await page.waitForTimeout(400); }
  await ev(`(() => { const g = __game; g.player.hasDrop = true; g.flags.add('has-drop'); const L = g.planets.length - 1; g.enterWorld(L, false); const p = g.planets[L]; g.player.placeAt(p, p.dirRiver(162, 24)); g.rig.faceDir(g.player.up, p.surfacePoint(p.dirRiver(166, 40)).sub(g.player.pos)); g.rig.snap(); })()`);
  await page.waitForTimeout(2500); await shot('lighthouse');
  console.log(await ev(`document.querySelector('.prompt').innerText`));
  await key('KeyE'); await page.waitForTimeout(600);
  for (let i = 0; i < 6 && (await ev('__game.mode')) === 'story'; i++) { await key('Space', 120); await page.waitForTimeout(500); }
  for (let i = 0; i < 8 && (await ev('__game.mode')) === 'ride'; i++) { await page.waitForTimeout(1500); await shot('cloudride' + i); }
  await page.waitForTimeout(1000); await shot('home');
  console.log(await ev(`JSON.stringify({ mode: __game.mode, cur: __game.cur, loop: __game.flags.has('loop-complete') })`));
};

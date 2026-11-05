export default async ({ page, shot, ev, key }) => {
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 20 && (await ev('__game.mode')) !== 'play'; i++) { await key('Space', 120); await page.waitForTimeout(400); }
  await page.waitForTimeout(800);
  await ev(`(() => { const g = __game; g.player.hasDrop = true; g.flags.add('has-drop'); const p = g.planets[0]; g.player.placeAt(p, p.dirRiver(40.2, 11.5)); g.rig.snap(); })()`);
  await page.waitForTimeout(1200);
  await key('KeyE'); await page.waitForTimeout(600);
  await page.keyboard.down('Space');
  for (let i = 0; i < 30; i++) {
    console.log(await ev(`(() => { const g = __game; const s = g.conv?.step(); return JSON.stringify({ mode: g.mode, k: s?.kind, t: s?.text?.slice(0,30), sc: g.shownChars|0, hold: g.input.key('Space') }); })()`));
    await page.waitForTimeout(1000);
  }
};

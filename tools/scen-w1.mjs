// World 1 (Spring Peaks), the same two frames on any build, to compare before and after the Sky Isles work.
//   URL=... DPR=2 VW=1600 VH=900 W1OUT=prefix node tools/play.mjs w1
export default async ({ page, ev }) => {
  const out = process.env.W1OUT ?? 'shots/w1';
  await page.waitForSelector('button[data-a="new"]', { timeout: 600000 });
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.filming = true; g.fixedDt = 0.05; g.saveOff = true; })()`);
  const at = async (lat, lon, name) => {
    await ev(`(() => { const g = __game, p = g.planets[0]; g.player.placeAt(p, p.dirRiver(${lat}, ${lon})); g.rig.smoothUp.copy(g.player.up); g.rig.snap(); g.time = 100;
      for (let i = 0; i < 40; i++) { g.renderEvery = i === 39 ? 1 : 100000; g.day.setLocal(g.player.up, 0.6); g.frame(); } g.renderEvery = 1; })()`);
    await page.screenshot({ path: `${out}-${name}.png`, timeout: 600000 });
    console.log('shot', `${out}-${name}.png`);
  };
  await at(15.5, 1, 'spring');
  await at(40.2, 11.5, 'village');
};

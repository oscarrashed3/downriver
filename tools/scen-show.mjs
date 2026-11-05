// Showcase screenshots: the home light, the campfire night, the farewell at the bridge.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  const tp = (lat, lon) => ev(`(() => { const g = __game; const p = g.planets[0]; g.player.placeAt(p, p.dirRiver(${lat}, ${lon})); g.rig.snap(); })()`);
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 80 && (await mode()) !== 'play'; i++) await page.waitForTimeout(300);
  await key('KeyE'); await page.waitForTimeout(800); await key('KeyE');
  await ev(`__game.seq.speed = 1.5`);
  for (let i = 0; i < 80; i++) { await page.waitForTimeout(250); if (await ev(`__game.fogK > 0.97`)) break; }
  await page.waitForTimeout(1500); await shot('homelight');
  await ev(`__game.seq.speed = 8`);
  for (let i = 0; i < 100 && (await mode()) !== 'play'; i++) await page.waitForTimeout(300);
  await ev(`(() => { const g = __game; ['talked:ysolde','power:skyreading','saw-wind','quest:snowpack','flag:tor-fences'].forEach(f => g.give(f)); ['fence-north-ridge','fence-saddle','fence-east-shoulder'].forEach(id => g.ch1.buildSite(id)); })()`);
  await tp(60.2, -16.6); await page.waitForTimeout(1000); console.log(await ev(`document.querySelector('.prompt').innerText`)); await key('KeyE');
  await ev(`__game.seq.speed = 1.5`);
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(300); if (await ev(`__game.seq.i >= 3`)) break; }
  await page.waitForTimeout(1500); await shot('campfire');
  await ev(`__game.seq.speed = 10`);
  for (let i = 0; i < 300 && (await mode()) !== 'play'; i++) await page.waitForTimeout(300);
  await ev(`(() => { const g = __game; ['journal:stone-returns','boat-ready'].forEach(f => g.give(f)); g.day.setLocal(g.player.up, 0.38); })()`);
  await tp(72.5, 2.5); await page.waitForTimeout(1000); console.log(await ev(`document.querySelector('.prompt').innerText`)); await key('KeyE');
  await ev(`__game.seq.speed = 1.5`);
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(300); if (await ev(`__game.seq.i >= 4`)) break; }
  await page.waitForTimeout(1200); await shot('farewell');
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(300); if (await ev(`__game.seq.i >= 9`)) break; }
  await page.waitForTimeout(1500); await shot('keepsake');
};

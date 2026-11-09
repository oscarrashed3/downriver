// The Settings page on a small laptop screen (run with VW=1366 VH=650): it must fit, or scroll, without clipping.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  const wait = async (s) => { const t0 = await ev('__game.time'); for (let i = 0; i < 240 && (await ev('__game.time')) - t0 < s; i++) await page.waitForTimeout(150); };
  const fits = () => ev(`(() => { const r = document.querySelector('.setpaper').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), innerHeight]; })()`);
  await ev(`__game.renderEvery = 1`);
  await page.click('.title button[data-a="settings"]', { force: true, timeout: 120000 }); await page.waitForTimeout(1200);
  console.log(JSON.stringify(['title', await fits()]));
  await shot('title-settings');
  await page.keyboard.press('Escape'); await page.waitForTimeout(800);
  await page.click('button[data-a="new"]', { force: true, timeout: 120000 });
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.seq.speed = 30; })()`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await wait(1);
  await page.keyboard.down('Escape'); await wait(0.1); await page.keyboard.up('Escape'); await wait(0.3);
  console.log(JSON.stringify(['game', await mode(), await fits()]));
  await shot('settings');
};

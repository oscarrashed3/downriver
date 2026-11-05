// Quick look inside Ysolde's house (lighting check).
export default async ({ page, shot, ev }) => {
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 160 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(250); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.meet = null; g.enterRoom('ysolde', '#f1e6d2', 'test'); })()`);
  for (let i = 0; i < 100 && (await ev('__game.room?.phase')) !== 'stay'; i++) await page.waitForTimeout(100);
  await page.waitForTimeout(600); await shot('ysolde');
};

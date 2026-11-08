// The kite game on Kite Ridge: Tor's lines, the game on autopilot, the outro and the first glide.
export default async ({ page, shot, ev }) => {
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); g.give('quest:hollo'); g.give('quest:kite'); g.renderEvery = 2; g.timeScale = 2.5; })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  await ev(`(() => { const g = __game; g.day.setLocal(g.player.up, 0.45); g.ch1.kiteGame.autopilot = ${process.env.AUTO !== '0'}; g.cut(g.ch1.kiteFlight()); })()`);
  for (let i = 0; i < 60 && !(await ev('__game.ch1.kiteGame.active')); i++) { await page.waitForTimeout(300); await ev(`__game.input.pressed.add('Space')`); }
  await shot('game-start');
  for (let k = 0; k < 14 && (await ev('__game.ch1.kiteGame.active')); k++) {
    await page.waitForTimeout(1500);
    console.log('kite', await ev(`JSON.stringify({ caught: __game.ch1.kiteGame.caught, gust: !!__game.ch1.kiteGame.gust })`));
    if (k % 2 === 1) await shot('game-' + k);
  }
  for (let i = 0; i < 60 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(400); await ev(`__game.input.pressed.add('Space')`); if (i === 2) await shot('outro'); }
  console.log('end', await ev(`JSON.stringify({ mode: __game.mode, flown: __game.flags.has('kite-flown'), glide: __game.player.canGlide })`));
  await shot('after');
};

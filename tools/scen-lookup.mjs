// The opening's "Look up." shot after the letter, filmed one shot per second of game time, plus a few title frames.
// The game is stepped by hand with a fixed dt, so the timing is exact however slowly this machine draws.
// TITLE=0 skips the title frames; START=n starts the per-second shots n seconds in.
export default async ({ page, shot, ev }) => {
  const step = async (sec, render = true) => {
    const n = Math.max(1, Math.round(sec / 0.05));
    await ev(`(() => { const g = __game; g.renderEvery = ${render ? n : 100000}; for (let i = 0; i < ${n}; i++) g.frame(); g.renderEvery = 1; })()`);
  };
  await ev(`(() => { const g = __game; g.fast = 1; g.seq.speed = 1; g.filming = true; g.fixedDt = 0.05; })()`);
  if (process.env.TITLE !== '0') {
    for (const t of [0, 20, 40]) { await step(t ? 20 : 0.05); await shot('title-t' + t); }
  }
  await page.click('button[data-a="new"]');
  await ev(`(() => { const g = __game; g.fast = 1; g.seq.speed = 1; })()`);
  for (let i = 0; i < 80 && (await ev('__game.mode')) !== 'letter'; i++) { await step(1, false); await page.waitForTimeout(200); }
  await step(1);
  await shot('letter');
  await ev(`__game.input.pressed.add('KeyE')`);
  await step(0.05, false);
  const start = Number(process.env.START ?? 0);
  if (start) await step(start, false);
  for (let s = start; s < 40; s++) {
    await step(1);
    const m = await ev('__game.mode');
    await shot(`s${String(s + 1).padStart(2, '0')}-${m}`);
    if (m === 'play') break;
  }
  // and the sky view (Tab), which uses the same far-view cloud sea and haze
  await ev(`__game.openSky()`);
  await step(3);
  await shot('skyview');
};

// After "Look up." the worlds stay, faint, in World 1's sky: skip to the letter, mark it read, and look up from above Nilo.
export default async ({ page, shot, ev }) => {
  const step = async (sec, render = false) => { const n = Math.max(1, Math.round(sec / 0.05)); await ev(`(() => { const g = __game; g.renderEvery = ${render ? n : 100000}; for (let i = 0; i < ${n}; i++) g.frame(); g.renderEvery = 1; })()`); };
  await ev(`(() => { const g = __game; g.fast = 1; g.seq.speed = 1; g.filming = true; g.fixedDt = 0.05; })()`);
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 80 && (await ev('__game.mode')) !== 'letter'; i++) { await step(1); await page.waitForTimeout(200); }
  await ev(`(() => { const g = __game; g.planLookUp(); g.hud.showLetter(null); g.give('read-letter'); g.mode = 'play'; })()`);
  for (const el of [30, 45]) {
    await ev(`(() => { const g = __game, i = g.islands, p = g.player.pos.clone().addScaledVector(g.player.up, 30); g.cutCam = { pos: p, look: p.clone().addScaledVector(i.skyDir(${el}, 0), 50), up: g.player.up.clone() }; })()`);
    await step(0.3, true);
    await shot('after-sky-' + el);
  }
};

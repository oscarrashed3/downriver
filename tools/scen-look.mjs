// Look check: a few fixed views for comparing the art against the references.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  await shot('title');
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.seq.speed = 30; })()`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  const views = (process.env.VIEWS ?? 'spring,village,bridge,ridge').split(',');
  const at = {
    spring: [16, -3, 10, 0.55], village: [52, -14, 64, 0.5], bridge: [69, -6, 74, 0.45], ridge: [50, 47, 60, 0.6], meadow: [42, 60, 52, 0.5], dusk: [52, -14, 64, 0.06],
  };
  for (const v of views) {
    const [la, lo, lookLat, elev] = at[v];
    await ev(`(() => { const g = __game; const p = g.planets[0]; g.player.placeAt(p, p.dirRiver(${la}, ${lo})); g.day.setLocal(g.player.up, ${elev}); g.rig.faceDir(g.player.up, p.surfacePoint(p.dirRiver(${lookLat}, ${lo})).sub(g.player.pos)); g.rig.snap(); g.hud.setGoal && g.hud.setGoal(null); })()`);
    await page.waitForTimeout(2500); await shot(v);
  }
};

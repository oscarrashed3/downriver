// Continue from a save: start a game, save, reload the page, press Continue, check the camera is behind Nilo.
export default async ({ page, shot, ev }) => {
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 160 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(250); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.save(); })()`);
  await page.reload(); await page.waitForTimeout(9000);
  await page.click('button[data-a="continue"]');
  await page.waitForTimeout(2500); await shot('during-meet'); for (let i = 0; i < 100 && (await ev('!!__game.meet')); i++) await page.waitForTimeout(200);
  console.log('continue', await ev(`(() => { const g = __game; return JSON.stringify({ mode: g.mode, override: !!g.rig.override, cut: !!g.cutCam, meet: !!g.meet, intro: g.intro, sky: g.skyView.open, opos: g.rig.override && g.rig.override.pos.toArray().map(x=>x|0).join(','), ppos: g.player.pos.toArray().map(x=>x|0).join(','), camToNilo: +g.camera.position.distanceTo(g.player.pos).toFixed(1) }); })()`));
  await shot('after-continue');
};

// The old tree: seen from where Nilo wakes, and from up close by the willow branch.
export default async ({ page, shot, ev }) => {
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 160 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(250); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  const view = async (from, to, pitch, name) => {
    await ev(`(() => { const g = __game, p = g.planets[0]; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id);
      g.player.placeAt(p, p.dirRiver(${from[0]}, ${from[1]})); g.rig.faceDir(g.player.up, p.surfacePoint(p.dirRiver(${to[0]}, ${to[1]})).sub(g.player.pos)); g.rig.pitch = ${pitch}; g.rig.snap(); g.mode = 'play'; })()`);
    await page.waitForTimeout(2500); await shot(name);
  };
  await view([21.5, -5.2], [15.6, 15.5], 0.1, 'from-wake');
  await view([24, 24], [15.6, 15.5], 0.15, 'close');
  await view([34, 2], [15.6, 15.5], 0.2, 'from-path');
  // a wide look from just above the wake spot, to see the whole tree against the sky
  await ev(`(() => { const g = __game, p = g.planets[0]; const a = p.surfacePoint(p.dirRiver(26, -6)); const up = a.clone().sub(p.center).normalize(); const t = p.surfacePoint(p.dirRiver(15.6, 15.5)); g.cutCam = { pos: a.clone().addScaledVector(up, 4), look: t.clone().addScaledVector(up, 7), up }; })()`);
  await page.waitForTimeout(2500); await shot('wide');
};

// Lantern Town's harbour from above: the lighthouse on its rim, the canals running in, the boats; and Nilo wading in it.
export default async ({ page, shot, ev }) => {
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  const L = 5;
  // from above the quay, looking down at the harbour mouth and the lighthouse
  await ev(`(() => { const g = __game, p = g.planets[${L}]; g.enterWorld(${L}, false); g.meet = null; g.cutCam = null; g.mode = 'play';
    g.player.placeAt(p, p.dirRiver(166, 30));
    const look = p.surfacePoint(p.dirRiver(163, 40)), a = p.dirRiver(150, 10);
    g.rig.override = { pos: p.center.clone().addScaledVector(a, p.R + 16), look, up: a.clone() }; })()`);
  await page.waitForTimeout(4000); await shot('harbour-above');
  // Nilo standing in the harbour water, and walking out of it onto the quay
  await ev(`(() => { const g = __game; g.rig.override = null; g.rig.snap(); })()`);
  await page.waitForTimeout(2500); await shot('harbour-wading');
  console.log(JSON.stringify(await ev(`(() => { const g = __game, p = g.planet, d = g.player.up; return { ground: +p.height(d).toFixed(2), water: +(p.bedAt(1) + p.cfg.waterDepth).toFixed(2) }; })()`)));
};

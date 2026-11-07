// World 1 life: a portrait of each kind of creature, seen from a few metres away with Nilo far off (so nothing hides)
export default async ({ page, shot, ev }) => {
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  for (const [k, dist, h] of [['hen', 2.2, 0.8], ['cat', 1.8, 0.7], ['fly', 3, 1.2], ['duck', 2.6, 1.0], ['hive', 3, 1.4], ['marmot', 2.4, 0.8], ['hare', 2.2, 0.7], ['wheel', 6, 2.5]]) {
    await ev(`(() => { const g = __game, p = g.planets[0], o = g.contents[0].refs.life['${k}']; const up = o.position.clone().sub(p.center).normalize();
      const s = new o.position.constructor(0, 1, 0).cross(up).normalize(); g.player.placeAt(p, up.clone().applyAxisAngle(s, 40 / p.R)); g.contents[0].refs.lifeNear.set(1e9, 0, 0);
      g.__lifeK = '${k}'; g.cutCam = { pos: o.position.clone().addScaledVector(s, ${dist}).addScaledVector(up, ${h}), look: o.position.clone().addScaledVector(up, 0.25), up }; g.mode = 'play'; })()`);
    if (k === 'hen' || k === 'fly' || k === 'duck' || k === 'hare') await ev(`(() => { const g = __game, o = g.contents[0].refs.life[g.__lifeK]; const f = () => { if (!g.cutCam || g.__lifeK !== '${k}') return; const p = g.planets[0], up = o.position.clone().sub(p.center).normalize(); const s = new o.position.constructor(0, 1, 0).cross(up).normalize(); g.cutCam = { pos: o.position.clone().addScaledVector(s, ${dist}).addScaledVector(up, ${h}), look: o.position.clone().addScaledVector(up, 0.25), up }; requestAnimationFrame(f); }; f(); })()`);
    await page.waitForTimeout(2500); await shot('life-' + k);
  }
};

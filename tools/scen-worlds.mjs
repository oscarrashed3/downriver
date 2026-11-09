// The title (all six worlds round the words), then a high look over each world after the first, from above its dock.
export default async ({ page, shot, ev }) => {
  await shot('title');
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  for (const w of [1, 2, 3, 4, 5]) {
    for (const [lat, lift, back] of [[30, 34, 26], [110, 40, 30]]) {
      await ev(`(() => { const g = __game, p = g.planets[${w}]; g.enterWorld(${w}, false); const a = p.dirRiver(${lat} - 14, 0); g.player.placeAt(p, g.arrivalDir(${w})); g.meet = null; g.cutCam = null; g.mode = "play";
        const look = p.surfacePoint(p.dirRiver(${lat}, 0)); const up = a.clone();
        const pos = p.center.clone().addScaledVector(a, p.R + ${lift}).addScaledVector(p.dirRiver(${lat} - 30, 0).sub(a).normalize(), ${back});
        g.rig.override = { pos, look, up }; })()`);
      await page.waitForTimeout(3500);
      await shot(`w${w + 1}-${await ev(`__game.planets[${w}].cfg.id`)}-high-${lat}`);
    }
  }
  await ev(`__game.rig.override = null`);
};

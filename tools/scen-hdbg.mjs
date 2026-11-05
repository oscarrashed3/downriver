export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 40`);
  for (let i = 0; i < 160 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.seq.speed = 40; })()`);
  for (let i = 0; i < 160 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  const orbit = `(() => { const g = __game; const c = g.ch1; g.mode = 'cut'; g.cutCam = c.orbit(c.R.hollo.root.position.clone(), 9, 3, 1.2); g.day.setLocal(g.player.up, 0.45); })()`;
  await ev(orbit);
  console.log(await ev(`JSON.stringify(__game.ch1.hollo.body.children.slice(0,4).map(o => [o.type, o.material?.type, o.material?.alphaTest, o.scale.x]))`));
  await ev(`__game.ch1.hollo.body.children[0].visible = false`); await page.waitForTimeout(1500); await shot('nocore');
  await ev(`__game.grass && (__game.grass.group ? __game.grass.group.visible = false : 0)`); await page.waitForTimeout(1500); await shot('nograss');
};

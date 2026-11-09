// Systems check: backpack + swap, letters, the survey map, a viewpoint sketch, the fox.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 40`);
  for (let i = 0; i < 160 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.seq.speed = 40; })()`);
  for (let i = 0; i < 160 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  // walk around a bit so the map surveys something, by teleporting along the path
  await ev(`(() => { const g = __game, p = g.planets[0]; for (const [la, lo] of [[20,-4],[30,-6],[40,-8],[50,-12],[60,-16],[66,-6],[72,0],[50,40],[48,44]]) { g.player.placeAt(p, p.dirRiver(la, lo)); const ll = { lat: la, lon: lo }; g.map.reveal(p, la, lo, 22); } })()`);
  await ev(`(() => { const g = __game; ['item:spar','item:flower','item:bottle','power:skyreading','power:kite','letter:1','peaks-healed','item:frost'].forEach(f => g.give(f)); g.bag.push('item:flower'); })()`);
  // stand by Bram and open the backpack
  await ev(`(() => { const g = __game, b = g.contents[0].npcs.find(n => n.id === 'bram'); g.player.pos.copy(b.root.position).addScaledVector(b.up, 0.1).addScaledVector(b.homeForward.clone().normalize(), 2); g.player.sync(); })()`);
  await page.waitForTimeout(800);
  await key('KeyB'); await page.waitForTimeout(1200); await shot('bag');
  await page.click('button.swap').catch(() => console.log('no swap button'));
  await page.waitForTimeout(800); await shot('bag-swapped');
  await page.click('button[data-tab="letters"]'); await page.waitForTimeout(600); await shot('letters');
  await page.click('button[data-reply]').catch(() => console.log('no reply')); await page.waitForTimeout(600);
  await key('KeyB'); await page.waitForTimeout(500);
  await key('KeyM'); await page.waitForTimeout(3000); await shot('map');
  await key('KeyM'); await page.waitForTimeout(500);
  // viewpoint on the ridge
  await ev(`(() => { const g = __game; g.seq.speed = 1; g.day.setLocal(g.player.up, 0.5); g.contents[0].interactables.find(i => i.id === 'vp-ridge').act(); })()`);
  await page.waitForTimeout(4000); await shot('sketch-early');
  await page.waitForTimeout(5000); await shot('sketch-late');
  for (let i = 0; i < 40 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(500); await key('Space', 20); }
  console.log('sketches', await ev('__game.sketches.length'));
  await key('KeyB'); await page.waitForTimeout(800);
  await page.click('button[data-tab="sketches"]'); await page.waitForTimeout(800); await shot('sketchbook');
  await key('KeyB'); await page.waitForTimeout(400);
  // the fox in the forest (Ember Pines)
  await ev(`(() => { const g = __game; g.enterWorld(1, false); const p = g.planets[1]; g.player.placeAt(p, p.dirRiver(76.5, 7)); g.player.facing.copy(g.fox.f.root.position.clone().sub(g.player.pos).projectOnPlane(g.player.up).normalize()); g.player.sync(); g.rig.snap(); g.day.setLocal(g.player.up, 0.5); })()`);
  await page.waitForTimeout(2500); await shot('fox');
  console.log('prompt', await ev(`document.querySelector('.prompt').innerText`));
};

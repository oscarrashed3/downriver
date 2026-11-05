// Goal lines and new-goal toasts at a few moments of world 1, from a fresh start.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.seq.speed = 30; })()`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  // Stand near the old woman: the prompt and goal still describe her, not name her.
  await ev(`(() => { const g = __game, p = g.planets[0]; g.player.placeAt(p, p.dirRiver(20.6, -4.2)); g.day.setLocal(g.player.up, 0.45);
    g.rig.faceDir(g.player.up, g.contents[0].npcs.find(n => n.id === 'ysolde').root.position.clone().sub(g.player.pos)); g.rig.snap(); })()`);
  await page.waitForTimeout(3000); await shot('meet-old-woman');
  // After Ysolde: a new goal toast, and the beam over Tor in the village.
  await ev(`(() => { const g = __game, p = g.planets[0]; ['talked:ysolde', 'quest:hollo', 'journal:snow-jar', 'map:valley'].forEach(f => g.give(f));
    g.player.placeAt(p, p.dirRiver(30, -10)); g.rig.faceDir(g.player.up, p.surfacePoint(p.dirRiver(62.6, -12.6)).sub(g.player.pos)); g.rig.pitch = 0.2; g.rig.snap(); })()`);
  await page.waitForTimeout(6000); await shot('find-tor');
  // After the kite: Tor points to Bram.
  await ev(`(() => { const g = __game, p = g.planets[0]; ['talked:tor', 'quest:kite', 'item:spar', 'flag:tor-follow', 'kite-flown', 'power:skyreading', 'power:kite'].forEach(f => g.give(f));
    g.player.placeAt(p, p.dirRiver(61.5, -19.5)); g.rig.faceDir(g.player.up, p.surfacePoint(p.dirRiver(66, -25.2)).sub(g.player.pos)); g.rig.pitch = 0.5; g.rig.dist = 6; g.rig.snap(); })()`);
  await page.waitForTimeout(6000); await shot('ask-bram');
  // The long night: invite someone not met yet.
  await ev(`(() => { const g = __game, p = g.planets[0]; ['talked:bram', 'quest:goat', 'goat-home', 'flag:tor-fences', 'fences-done', 'quest:night', 'invited:ysolde', 'invited:bram'].forEach(f => g.give(f));
    g.player.placeAt(p, p.dirRiver(66, 19)); g.rig.faceDir(g.player.up, p.surfacePoint(p.dirRiver(46.5, 66)).sub(g.player.pos)); g.rig.pitch = 0.25; g.rig.snap(); })()`);
  await page.waitForTimeout(6000); await shot('invite-cloud-girl');
};

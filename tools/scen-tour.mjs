// Teleport tour: spring, Ysolde, village from above, each world.
export default async ({ page, shot, ev, key }) => {
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 20 && (await ev('__game.mode')) !== 'play'; i++) { await key('Space', 120); await page.waitForTimeout(400); }
  await page.waitForTimeout(1500);
  const tp = async (w, lat, lon, label, yawDeg = 0) => {
    await ev(`(() => { const g = __game; g.enterWorld(${w}, false); const p = g.planets[${w}]; g.player.placeAt(p, p.dirRiver(${lat}, ${lon})); g.rig.faceDir(g.player.up, p.surfacePoint(p.dirRiver(${lat} - 10, 0)).sub(g.player.pos)); g.rig.yaw = ${yawDeg} * Math.PI / 180; g.rig.snap(); })()`);
    await page.waitForTimeout(2500); await shot(label);
  };
  await tp(0, 20, -4, 'spring');
  await tp(0, 41, 9, 'ysolde', 30);
  await tp(0, 64, -16, 'village', 160);
  await tp(1, 60, 14, 'sky-spire');
  await tp(1, 100, 8, 'sky-isles', 40);
  await tp(2, 66, -6, 'garden-can');
  await tp(3, 96, 2, 'sea');
  await tp(3, 168, 4, 'sea-edge', 180);
  await tp(4, 82, -8, 'desert', 30);
  await tp(4, 70, -20, 'desert-salt', 200);
  await tp(5, 120, 8, 'lantern-town');
  await tp(5, 156, 20, 'lantern-harbour');
};

// Nilo close-ups in the world: standing (front), walking, running, sitting, talking.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 30`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.seq.speed = 30; })()`);
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  const place = (yaw, dist, pitch, pose) => ev(`(() => { const g = __game; const p = g.planets[0]; g.player.placeAt(p, p.dirRiver(46, -12)); g.day.setLocal(g.player.up, 0.5);
    g.rig.faceDir(g.player.up, p.surfacePoint(p.dirRiver(58, -12)).sub(g.player.pos)); g.player.facing.copy(p.surfacePoint(p.dirRiver(58, -12)).sub(g.player.pos)).projectOnPlane(g.player.up).normalize();
    g.rig.yaw = ${yaw}; g.rig.dist = ${dist}; g.rig.pitch = ${pitch}; g.player.pose = ${pose}; g.rig.snap(); g.hud.setGoal && g.hud.setGoal(null); })()`);
  await place(Math.PI, 3.2, 0.12, '{}'); await page.waitForTimeout(2500); await shot('front');
  await place(Math.PI * 0.75, 3.2, 0.12, '{}'); await page.waitForTimeout(2000); await shot('three-quarter');
  await place(Math.PI * 0.5, 4, 0.15, '{}'); await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await shot('walk'); await page.keyboard.up('KeyW');
  await place(Math.PI * 0.5, 4.5, 0.15, '{}'); await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await page.waitForTimeout(1200); await shot('run'); await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
  await place(Math.PI * 0.8, 3, 0.25, '{ sit: 1 }'); await page.waitForTimeout(2500); await shot('sit');
  await place(Math.PI * 0.85, 2.6, 0.1, '{ talking: true }'); await page.waitForTimeout(2000); await shot('talk');
  await ev(`__game.player.pose = {}; __game.rig.dist = 8.5`);
};

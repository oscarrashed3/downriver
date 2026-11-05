// Hollo close-ups: asleep, eyes open, standing.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  await page.click('button[data-a="new"]');
  await ev(`__game.seq.speed = 40`);
  for (let i = 0; i < 160 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.seq.speed = 40; })()`);
  for (let i = 0; i < 160 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(250); await key('Space', 20); }
  const orbit = (r, h, a) => `(() => { const g = __game; const c = g.ch1; g.mode = 'cut'; g.cutCam = c.orbit(c.R.hollo.root.position.clone(), ${r}, ${h}, ${a}); g.day.setLocal(g.player.up, 0.45); })()`;
  await ev(orbit(13, 5, 2.4)); await page.waitForTimeout(2500); await shot('asleep');
  const front = (d, h) => `(() => { const g = __game, h = g.ch1.hollo; const THREE = g.camera.constructor.__proto__; const face = h.head.getWorldPosition(g.camera.position.clone()); const up = face.clone().sub(g.planets[0].center).normalize(); const fwd = g.camera.position.clone().set(0,0,1).applyQuaternion(h.root.quaternion).projectOnPlane(up).normalize(); g.cutCam = { pos: face.clone().addScaledVector(fwd, ${d}).addScaledVector(up, ${h}), look: face, up }; })()`;
  await ev(front(7, 1)); await page.waitForTimeout(2000); await shot('asleep-front');
  await ev(`(() => { const h = __game.ch1.hollo; h.eyeOpen = 1; h.rise = 1; })()`);
  await ev(front(9, 1.5)); await page.waitForTimeout(2500); await shot('standing-front');
  await ev(orbit(14, 4, 1.6)); await page.waitForTimeout(2000); await shot('standing');
};

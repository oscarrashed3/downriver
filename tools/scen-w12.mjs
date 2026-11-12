// Fixed before/after frames of World 1 and World 2 (to prove later work leaves them unchanged).
//   W12OUT=/dir W12TAG=before VW=1280 VH=720 node tools/play.mjs w12
import { mkdirSync } from 'fs';
export default async ({ page, ev }) => {
  const dir = process.env.W12OUT ?? 'shots/w12', tag = process.env.W12TAG ?? 'now';
  mkdirSync(dir, { recursive: true });
  await page.waitForSelector('button[data-a="new"]', { timeout: 600000 });
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  const shotAt = async (w, name, js) => {
    await ev(`(() => { const g = __game, p = g.planets[${w}]; g.enterWorld(${w}, false); g.player.placeAt(p, g.arrivalDir(${w})); g.meet = null; g.cutCam = null; g.mode = "play"; g.hud.setFade(0, "#fff8ee", true); ${js} })()`);
    for (let i = 0; i < 12; i++) { await page.waitForTimeout(300); await ev(`(() => { const g = __game; g.day.setLocal(g.player.up, 0.5); document.querySelectorAll('.notify, .toast').forEach(e => e.remove()); })()`); }
    await page.screenshot({ path: `${dir}/${name}-${tag}.png`, timeout: 600000 }); console.log('shot', `${dir}/${name}-${tag}.png`);
  };
  const cam = (lat, lon, h, back, lat2) => `const a = p.dirRiver(${lat}, ${lon}), look = p.surfacePoint(p.dirRiver(${lat2}, ${lon})); const pos = p.center.clone().addScaledVector(a, p.R + ${h}).addScaledVector(p.dirRiver(${lat - 14}, ${lon}).sub(a).normalize(), ${back}); g.rig.override = { pos, look, up: a.clone() };`;
  await shotAt(0, 'world1-valley', cam(16, 0, 34, 26, 30));
  await shotAt(0, 'world1-village', cam(38, 11, 14, 18, 42));
  await shotAt(1, 'world2-arrive', `const a = g.arrivalDir(1), up = a.clone(); const pos = p.center.clone().addScaledVector(a, p.R + 30).add(new p.center.constructor(14, 6, 18)); g.rig.override = { pos, look: p.surfacePoint(a), up };`);
  await shotAt(1, 'world2-high', `const a = g.arrivalDir(1); const pos = p.center.clone().addScaledVector(a, p.R + 70).add(new p.center.constructor(-30, 10, 30)); g.rig.override = { pos, look: p.center.clone(), up: a.clone() };`);
};

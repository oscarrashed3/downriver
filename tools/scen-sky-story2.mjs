// Sky Isles phase 3 (second half): people in Sailtown, the postman. Skips the arrival scene.
import { mkdirSync } from 'fs';
export default async ({ page, ev }) => {
  const dir = process.env.SKYSHOTS ?? '/home/user/sky-shots/phase3';
  mkdirSync(dir, { recursive: true });
  const snap = async (name) => { await ev(`document.querySelectorAll('.notify, .toast').forEach(e => e.remove())`); await page.screenshot({ path: `${dir}/${name}.png`, timeout: 600000 }); console.log('shot', `${dir}/${name}.png`); };
  await page.waitForSelector('button[data-a="new"]', { timeout: 600000 });
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  await ev(`(() => { const g = __game, p = g.planets[1]; g.saveOff = true; g.flags.add('sky:arrived'); for (const n of g.contents[1].npcs) g.flags.add('met:' + n.id); g.enterWorld(1, false); g.player.placeAt(p, g.arrivalDir(1)); g.meet = null; g.cutCam = null; g.rig.override = null; g.mode = "play"; g.hud.setFade(0, "#fff8ee", true); })()`);
  await ev(`(() => { const g = __game; g.fast = 1; g.seq.speed = 1; g.filming = true; g.fixedDt = 0.05; window.__noon = () => g.day.setLocal(g.player.up, 0.5); })()`);
  const run = async (ms) => { const n = Math.max(1, Math.round(ms / 50)); await ev(`(() => { const g = __game; for (let i = 0; i < ${n}; i++) { g.renderEvery = i === ${n} - 1 ? 1 : 100000; __noon(); g.frame(); } g.renderEvery = 1; })()`); };
  const beat = () => ev('__game.seq.running ? __game.seq.i : -1');
  const toBeat = async (b, extra = 0) => { for (let i = 0; i < 400 && (await beat()) < b && (await beat()) !== -1; i++) await run(100); if (extra) await run(extra); };
  const step = process.env.STEP ?? 'people';
  if (step === 'people') {
    // stand by Lark; the camera takes in Lark, Gran Wren, Zephy and the crowd
    await ev(`(() => { const g = __game, c = g.ch2, p = g.planets[1]; const L = c.home.lark.pos, W = c.home.granwren.pos, Z = c.home.zephy.pos; const up = L.clone().sub(p.center).normalize();
      const mid = L.clone().add(W).add(Z).multiplyScalar(1 / 3); const d = c.dir([55.2, 6.2]); g.player.placeAt(p, d);
      const back = mid.clone().sub(Z).projectOnPlane(up).normalize(); g.rig.override = { pos: mid.clone().addScaledVector(back, 9).addScaledVector(up, 3.4), look: mid.clone().addScaledVector(up, 1.2), up }; })()`);
    await run(1500);
    await snap('6-sailtown-people');
    await ev('__game.rig.override = null');
  }
  if (step === 'postman') {
    await ev(`(() => { const g = __game, c = g.ch2; g.flags.add('sky:quest-kite'); g.player.placeAt(g.planets[1], c.dir([55.2, 6.2])); g.rig.snap(); })()`);
    await run(600);
    console.log('mode', await ev('__game.mode'));
    await toBeat(1, 2000);
    await snap('7-postman-balloon');
    await toBeat(3, 2500);
    await snap('8-letter');
    for (let i = 0; i < 100 && (await beat()) !== -1; i++) await run(500);
    console.log('letter', await ev(`JSON.stringify({ l2: __game.flags.has('letter:2'), goal: __game.worldTask(), meter: __game.ch2.meter() })`));
  }
};

// Records a playthrough of World 1, task by task, into a video: node tools/video.mjs [outdir]
// Uses the game's own scenes and talks; Nilo walks the last stretch to each task, the long walks between are skipped.
import pw from '/opt/node-tools/node_modules/playwright/index.js';
import fs from 'fs';
const out = process.argv[2] ?? 'shots/video';
fs.mkdirSync(out, { recursive: true });
const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 854, height: 480 } });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.addInitScript(() => { localStorage.removeItem('downriver-save-v2'); localStorage.removeItem('nilo-save-v3'); });
await page.goto((process.env.URL ?? 'http://localhost:5174/downriver/'));
await page.waitForTimeout(6000);
const ev = (js) => page.evaluate(js);
// Film: the game is stepped by hand, 0.15 s of game time per video frame (three 0.05 s steps, drawn once),
// so the video plays smoothly at 20 fps and three times real speed however slowly this machine draws.
const STEP = 0.05, PER = 3;
fs.mkdirSync(out + '/f', { recursive: true });
let n = 0;
async function wait(ms) {
  const frames = Math.max(1, Math.round(ms / 1000 / (STEP * PER)));
  for (let k = 0; k < frames; k++) {
    await ev(`(() => { const g = __game; g.renderEvery = ${PER}; for (let i = 0; i < ${PER}; i++) g.frame(); })()`);
    await page.screenshot({ path: `${out}/f/${String(++n).padStart(6, '0')}.jpg`, type: 'jpeg', quality: 82 });
  }
}
const mark = async (label) => console.log(label, await ev('__game.mode'));
const press = (k) => ev(`__game.input.pressed.add('${k}')`);

/** Click through talk lines and scenes until Nilo is free again: hold Space to read, pick the first answer, E for letters. */
async function advance(max = 80, gap = 1200) {
  for (let i = 0; i < max; i++) {
    const m = await ev('__game.mode');
    if (m === 'play' || m === 'raft') { await page.keyboard.up('Space'); await ev('__game.fast = 1'); return; }
    if (m === 'talk') { await ev('__game.fast = 2'); await page.keyboard.down('Space'); await press('Digit1'); await ev(`document.querySelector('.card')?.click()`); }
    else { await page.keyboard.up('Space'); await press(m === 'letter' ? 'KeyE' : 'Space'); }
    await wait(gap);
  }
  await page.keyboard.up('Space'); await ev('__game.fast = 1');
}
/** Put Nilo a few metres from a point and walk him to it, steering the camera so W heads there. */
async function walkTo(js, start = 9, ms = 3500) {
  await ev(`(() => { const g = __game, p = g.planets[0], t = (${js}); const d = t.clone().sub(p.center).normalize();
    const a = new t.constructor(0, 1, 0).cross(d).normalize(); g.player.placeAt(p, d.clone().applyAxisAngle(a, ${start} / p.R));
    g.rig.faceDir(g.player.up, t.clone().sub(g.player.pos)); g.rig.snap(); window.__walkT = t; })()`);
  await page.keyboard.down('KeyW');
  for (let k = 0; k < ms / 250; k++) {
    const d = await ev(`(() => { const g = __game; g.rig.faceDir(g.player.up, __walkT.clone().sub(g.player.pos)); return g.player.pos.distanceTo(__walkT); })()`);
    if (d < 2.4) break;
    await wait(250);
  }
  await page.keyboard.up('KeyW');
}
const npc = (id) => `__game.contents[0].npcs.find(n => n.id === '${id}').root.position.clone()`;
async function talk(id) {
  await walkTo(npc(id));
  await ev(`(() => { const g = __game; g.openTalk(g.contents[0].npcs.find(n => n.id === '${id}')); })()`);
  await wait(800); await advance();
}

// 1. the storm, waking, the letter
await page.click('button[data-a="new"]');
await ev(`(() => { const g = __game; g.filming = true; g.fixedDt = ${STEP}; })()`);
await mark('storm');
for (let i = 0; i < 400; i++) { if ((await ev('__game.mode')) === 'letter') break; await wait(250); }
await wait(4500); await advance(); await mark('letter read');
// the "look down" scene after the letter
await advance(40, 1200);

// 2. Ysolde by the spring
await talk('ysolde'); await ev(`__game.give('quest:hollo')`); await mark('ysolde');
// 3. the wind: Tor and the kite on the ridge
await talk('tor');
await ev(`(() => { const g = __game; if (!g.flags.has('kite-flown')) g.cut(g.ch1.kiteFlight()); })()`); await wait(800); await advance(60, 1300);
await ev(`(() => { const g = __game; for (const f of ['kite-flown', 'talked:tor', 'talked:odo']) g.give(f); })()`); await mark('kite');
// 4. the singing stones beside Hollo
await walkTo(`__game.ch1.lanterns.stones[0].position.clone()`, 7, 3000);
for (let i = 0; i < 4; i++) { await ev(`__game.ch1.lanterns.touchStone(${i})`); await wait(1300); }
await wait(5000);
for (const i of [0, 2, 1, 3]) { await ev(`__game.ch1.lanterns.touchStone(${i})`); await wait(1100); }
await wait(3500); await advance(); await ev(`__game.give('stones-done')`); await mark('stones');
// 5. Odo introduces Fold; carry the ember to Hollo
await talk('odo');
await ev(`(() => { const g = __game; g.give('quest:ember'); g.give('power:lantern'); g.ch1.lanterns.foldScene(); })()`); await wait(800); await advance(40, 1300);
await walkTo(`__game.contents[0].refs.fire.position.clone()`, 7, 2500);
await ev(`__game.ch1.lanterns.lightEmber()`); await wait(1500);
await walkTo(`__game.contents[0].refs.holloFire.position.clone()`, 14, 5000);
await ev(`__game.ch1.lanterns.deliver()`); await wait(4000); await advance(); await mark('ember');
// 6. the long night: everyone gathers at Hollo's fire
await ev(`(() => { const g = __game; for (const n of ['ysolde', 'bram', 'nima', 'tor', 'odo']) g.give('invited:' + n); g.give('quest:night'); g.give('gathered'); })()`);
await walkTo(`__game.contents[0].refs.holloFire.position.clone()`, 5, 1500);
await ev(`(() => { const g = __game; g.give('quest:night'); g.ch1.night.phase = 'wake'; g.cut(g.ch1.night.wakeBeats()); })()`); await wait(800); await advance(120, 1500);
await ev(`__game.give('peaks-healed')`); await mark('night');
// 7. Odo readies the boat, and the goodbye at the bridge
await talk('odo'); await ev(`__game.give('boat-ready')`);
await walkTo(`__game.contents[0].refs.bridge.position.clone()`, 8, 2500);
await ev(`(() => { const g = __game; g.cut(g.ch1.farewell()); })()`); await wait(800); await advance(120, 1500);
await mark('farewell');
// 8. down the river to the edge (sped up)
await ev(`__game.fast = 3`);
await page.keyboard.down('KeyW');
for (let i = 0; i < 80 && (await ev('__game.player.raftT')) < 0.985; i++) await wait(500);
await page.keyboard.up('KeyW');
await ev(`__game.fast = 1`);
await wait(2500); await press('KeyR');
for (let i = 0; i < 60 && (await ev('__game.mode')) === 'ride'; i++) await wait(500);
await wait(3000); await mark('arrived');
await ctx.close(); await browser.close();
console.log('frames', n);

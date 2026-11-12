// World 3 (the Walking Town), phase D: the sky jump, the wow shot, Pip, and the Mossfolk.
//   TOWNOUT=/dir node tools/play.mjs townD
import { mkdirSync } from 'fs';
export default async ({ page, ev }) => {
  const dir = process.env.TOWNOUT ?? 'shots/townD';
  mkdirSync(dir, { recursive: true });
  await page.waitForSelector('button[data-a="new"]', { timeout: 600000 });
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  const W = await ev(`__game.planets.findIndex(p => p.cfg.id === 'garden')`);
  const clean = () => ev(`(() => { document.querySelectorAll('.notify, .toast').forEach(e => e.remove()); })()`);
  // run the game's frames undrawn at a fixed step; then hold time still while a frame is drawn
  const sim = (sec) => ev(`(() => { const g = __game; g.fixedDt = 1 / 30; g.renderEvery = 1e9; for (let i = 0; i < ${Math.round(sec * 30)}; i++) g.frame(); g.renderEvery = 1; g.fixedDt = 1e-5; })()`);
  const calls = async () => { await ev(`(() => { const i = __game.renderer.info; i.autoReset = false; i.reset(); window.__f0 = __game.frameN; })()`); await page.waitForFunction(() => __game.frameN > window.__f0 + 1, null, { timeout: 120000 }); const r = await ev(`(() => { const i = __game.renderer.info; const r = JSON.stringify({ calls: Math.round(i.render.calls / (__game.frameN - window.__f0)) }); i.autoReset = true; return r; })()`); return r; };
  const snap = async (name) => { await clean(); await page.waitForTimeout(1500); const f = `${dir}/${name}.png`; await page.screenshot({ path: f, timeout: 600000 }); console.log('shot', f, await calls(), await ev(`JSON.stringify({ mode: __game.mode, sub: document.querySelector('.subtitle, .line')?.textContent?.slice(0, 40) ?? null })`)); };
  // the way in: World 2's goodbye ends on the whale's back (its last fade), then World 3's arrival follows
  await ev(`(() => { const g = __game; g.flags.add('fox-joined'); g.flags.add('chapter2-complete'); g.seq.speed = 1; g.cut([{ dur: 0.1, enter: () => g.leaveSky() }, { dur: 1.6, tick: k => g.hud.setFade(g.nextCut ? 1 : 1 - k, '#fff8ee') }]); })()`);
  // beats: level 0-3.5, look 3.5-7, scoop 7-9.5, jump 9.5-11.5, open 11.5-13.5, fall 13.5-19, land 19-23.5, wow 23.5-29.5, Pip 29.5-32.7
  const at = [['1-jump', 10.7], ['2-fall-umbrella', 14.6], ['3-landing', 22.6], ['4-wow', 29.3], ['5-pip-meets-nilo', 32.4]];
  let t = -1.7;
  for (const [name, s] of at) { await sim(s - t); t = s; await snap(name); }
  console.log('after', await ev(`JSON.stringify({ mode: __game.mode, flags: [...__game.flags].filter(f => f.startsWith('town')) })`));
  // the Mossfolk lineup on the crown: Pip, Bramwyn, the Miller, Tamsin, two villagers and the fox
  await sim(2);
  await ev(`(() => { const g = __game; g.endTalk?.(); g.talk = null; g.mode = 'play'; g.cutCam = null; })()`);
  await sim(0.5);
  await ev(`(() => { if (!document.getElementById('shot-css')) { const st = document.createElement('style'); st.id = 'shot-css'; st.textContent = '.prompt{display:none!important}'; document.head.append(st); } })()`);
  // (out on the meadow in front of Old Amble, where nothing stands in the way)
  await ev(`(() => { const g = __game, s = g.townStory, t = g.townMove, P = g.planets[${W}], V3 = P.center.constructor, G = t.town.group, R = t.amble.root;
    R.updateMatrixWorld(true); G.updateMatrixWorld(true);
    const ground = (x, z) => P.surfacePoint(R.localToWorld(new V3(x, 0, z)).sub(P.center).normalize());
    const X = -15, Z = 24;
    const look = ground(X, Z), up = look.clone().sub(P.center).normalize(); look.addScaledVector(up, 0.85);
    const cam = ground(X, Z + 7.2).addScaledVector(up, 1.6);
    const ids = ['moss2', 'bramwyn', 'pip', 'ropewright', 'miller', 'moss5'];
    ids.forEach((id, i) => { const h = s.byId[id]; const w = ground(X + (i - 2.5) * 1.1, Z); h.pos.copy(G.worldToLocal(w.clone())); const c = G.worldToLocal(cam.clone()); h.face.copy(c.sub(h.pos).setY(0).normalize()); h.npc.lookAt = null; });
    t.onAmble = false;
    g.fox.place(P, ground(X + 3.9, Z + 0.7).sub(P.center).normalize());
    g.player.placeAt(P, ground(X - 9, Z + 2).sub(P.center).normalize());
    g.rig.override = { pos: cam, look, up }; g.camera.fov = 50; g.camera.updateProjectionMatrix();
    document.querySelector('#shot-css').textContent += ' .goal, .compass, .caption, .prompt { visibility: hidden !important }';
    let meshes = 0; s.byId.pip.npc.root.traverse(o => { if (o.isMesh) meshes++; }); console.log('pip meshes', meshes); window.__pipMeshes = meshes; })()`);
  console.log('pip meshes', await ev('window.__pipMeshes'));
  await sim(0.3);
  await snap('6-mossfolk-lineup');
  // Amble's eye, close
  await ev(`(() => { const g = __game, a = g.townMove.amble, R = a.root, P = g.planets[${W}], V3 = P.center.constructor; R.updateMatrixWorld(true); const up = R.localToWorld(new V3(0, 1, 0)).sub(R.getWorldPosition(new V3())).normalize();
    const h = R.getObjectByName('head'); h.updateMatrixWorld(true); g.rig.override = { pos: h.localToWorld(new V3(-8.5, -0.3, 10)), look: h.localToWorld(new V3(-0.5, 0.3, 2.6)), up }; g.camera.fov = 40; g.camera.updateProjectionMatrix(); })()`);
  await sim(0.2);
  await snap('7-amble-eye');
};

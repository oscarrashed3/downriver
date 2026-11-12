// Shared helpers for the World 3 step playtests (scen-town-foot, scen-town-water, scen-town-eyes).
// Each starts a new game, goes to World 3, sets the story to where its step starts, and then plays the step
// through the game's own prompts, talks and scenes (checking at every turn that there is something to do).
import { mkdirSync } from 'fs';

export async function townSetup({ page, ev }, flags) {
  const dir = process.env.TOWNOUT ?? 'shots/townE';
  mkdirSync(dir, { recursive: true });
  await page.waitForSelector('button[data-a="new"]', { timeout: 600000 });
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 200 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(150); await ev(`(() => { const g = __game; g.input.pressed.add(g.mode === 'letter' ? 'KeyE' : 'Space'); })()`); }
  await ev(`(() => { const g = __game; g.give('read-letter'); g.meet = null; for (const n of g.contents[0].npcs) g.flags.add('met:' + n.id); g.seq.speed = 1; })()`);
  for (let i = 0; i < 100 && (await ev('__game.mode')) !== 'play'; i++) { await page.waitForTimeout(200); await ev(`__game.input.pressed.add('Space')`); }
  const W = await ev(`__game.planets.findIndex(p => p.cfg.id === 'garden')`);
  await ev(`(() => { const g = __game; g.seq.speed = 1; g.flags.add('fox-joined'); g.foxWorld = ${W}; for (const f of ${JSON.stringify(flags)}) g.flags.add(f); })()`);
  await ev(`(() => { const g = __game, p = g.planets[${W}]; g.enterWorld(${W}, false); g.player.placeAt(p, g.arrivalDir(${W})); g.fox.place(p, g.player.up.clone()); g.meet = null; g.cutCam = null; g.seq.running = false; g.mode = "play"; g.hud.setFade(0, "#fff8ee", true); })()`);
  const T = {
    W, dir,
    // the game's frames, undrawn, at a fixed step; then time held still while a frame is drawn for a shot
    sim: async (sec, keys = []) => {
      const err = await ev(`(() => { const g = __game; g.fixedDt = 1 / 30; g.renderEvery = 1e9; const ks = ${JSON.stringify(keys)}; let err = null;
        try { for (let i = 0; i < ${Math.round(sec * 30)}; i++) { for (const k of ks) g.input.down.add(k); g.frame(); } } catch (e) { err = String(e && e.stack || e).slice(0, 900); }
        for (const k of ks) g.input.down.delete(k); g.renderEvery = 1; g.fixedDt = 1e-5; return err; })()`);
      if (err) { console.log('FRAME ERROR', err); throw new Error('frame error'); }
    },
    quiet: () => ev(`(() => { document.querySelectorAll('.notify, .toast').forEach(e => e.remove()); __game.hud.banner.classList.remove('on'); if (!document.getElementById('shot-css')) { const st = document.createElement('style'); st.id = 'shot-css'; st.textContent = '.prompt{display:none!important}'; document.head.append(st); } })()`),
    loud: () => ev(`document.getElementById('shot-css')?.remove()`),
    snap: async (name) => {
      // (a caption that has just been put away is still fading out at this page's frame rate: let it be gone)
      await T.quiet(); await ev(`document.querySelectorAll('.caption:not(.on)').forEach(e => { e.style.transition = 'none'; e.style.opacity = '0'; })`);
      await page.waitForTimeout(1500); const f = `${dir}/${name}.png`; await page.screenshot({ path: f, timeout: 600000 });
      await ev(`document.querySelectorAll('.caption').forEach(e => { e.style.transition = ''; e.style.opacity = ''; })`);
      console.log('shot', f, await T.state());
    },
    state: () => ev(`JSON.stringify({ mode: __game.mode, goal: __game.worldTask(), meter: __game.townStory?.meter(), flags: [...__game.flags].filter(f => f.startsWith('town:')).join(' ') })`),
    // talk to someone all the way through (Space for each line, the first card when there is a choice)
    talk: async (id) => {
      if ((await ev('__game.mode')) !== 'talk') await ev(`(() => { const g = __game; g.openTalk(g.townStory.npc('${id}')); })()`);
      for (let i = 0; i < 80 && (await ev('__game.mode')) === 'talk'; i++) await ev(`(() => { const g = __game; g.fixedDt = 1 / 30; g.renderEvery = 1e9; for (let j = 0; j < 12; j++) { g.input.pressed.add('Space'); g.input.pressed.add('Digit1'); g.input.down.add('Space'); g.frame(); } g.input.down.delete('Space'); g.renderEvery = 1; g.fixedDt = 1e-5; })()`);
      console.log('talked', id, await T.state());
    },
    // stand him at a world point (an expression in __game terms), on whatever ground is under it
    put: (expr, onAmble = true) => ev(`(() => { const g = __game, t = g.townMove, P = g.planets[${W}], pl = g.player; const at = (${expr}); pl.pos.copy(at); pl.up.copy(at).sub(P.center).normalize(); pl.vel.set(0, 0, 0); pl.grounded = false; t.onAmble = ${onAmble}; t.climb = null; pl.sync(); g.rig.faceDir(pl.up, pl.facing); g.rig.snap(); })()`),
    // the prompt here must be the one we expect; then do it (a hold is held through)
    act: async (id) => {
      const r = await ev(`(() => { const g = __game, it = g.contents[${W}].interactables.find(i => i.id === '${id}'); const p = g.interactPrompt(); const l = it.label(); return JSON.stringify({ prompt: p && p.key, label: l, d: +it.pos.distanceTo(g.player.pos).toFixed(2), r: it.radius }); })()`);
      console.log('act', id, r);
      const o = JSON.parse(r);
      if (!o.label) throw new Error('dead end: nothing to do at ' + id + ' ' + (await T.state()));
      await ev(`(() => { const g = __game; g.contents[${W}].interactables.find(i => i.id === '${id}').act(); })()`);
    },
    until: async (cond, sec = 60) => { for (let i = 0; i < sec * 2 && !(await ev(cond)); i++) await T.sim(0.5); },
    pos: (id) => `__game.contents[${W}].interactables.find(i => i.id === '${id}').pos`,
  };
  await T.sim(1);
  return T;
}

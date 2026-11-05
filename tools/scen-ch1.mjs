// Chapter One from the title to the Ember Pines and back up by kite, then fast travel from the sky view.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  const waitPlay = async (max = 120, label = '') => { for (let i = 0; i < max && !['play', 'raft'].includes(await mode()); i++) { await page.waitForTimeout(500); if (label && i === 4) await shot(label); } };
  const tp = (lat, lon, w = 0) => ev(`(() => { const g = __game; const p = g.planets[${w}]; g.player.placeAt(p, p.dirRiver(${lat}, ${lon})); g.rig.snap(); })()`);
  const prompt = () => ev(`document.querySelector('.prompt').innerText`);
  const state = (extra = '') => ev(`JSON.stringify({ mode: __game.mode, step: __game.questCtx && (window.__q = __game.questCtx()) && __game.constructor && '', ${extra} })`);
  const step = () => ev(`(() => { const g = __game; const s = g.questCtx(); return [...g.flags].filter(f => !f.startsWith('visited') && !f.startsWith('talked') && !f.startsWith('closed')).length + ' flags, goal: ' + document.querySelector('.goal .gt').innerText; })()`);
  const talk = async (choices, label) => {
    const p = await prompt(); console.log('talk', label, '->', JSON.stringify(p));
    await key('KeyE'); await page.waitForTimeout(500);
    await page.keyboard.down('Space');
    let ci = 0, shotDone = false;
    for (let r = 0; r < 300; r++) {
      const st = await ev(`(() => { const s = __game.conv?.step(); return s ? s.kind : 'none'; })()`);
      if (st === 'none' || st === 'end') break;
      if (!shotDone && st === 'line' && r > 3) { await shot('talk-' + label); shotDone = true; }
      if (st === 'cards') { await key('Digit' + (choices[ci++] ?? 1)); await page.waitForTimeout(250); continue; }
      await page.waitForTimeout(200);
    }
    await page.keyboard.up('Space'); await page.waitForTimeout(400);
    console.log('  mood', label, await ev(`JSON.stringify(__game.moods['${label}'])`));
  };
  const act = async (label) => { const p = await prompt(); console.log('act', label, '->', JSON.stringify(p)); await key('KeyE'); await page.waitForTimeout(700); };

  await page.click('button[data-a="new"]');
  await waitPlay(60); await page.waitForTimeout(400); await shot('awake');
  await key('KeyE'); await page.waitForTimeout(600); await key('KeyE');
  await waitPlay(80); console.log(await step());

  await tp(58.6, -20.8); await page.waitForTimeout(800); await shot('village');
  await talk([1, 1], 'ysolde');
  if (!(await ev(`__game.flags.has('power:skyreading')`))) { console.log('retry ysolde'); await talk([1, 1], 'ysolde'); }
  console.log(await step());
  await tp(46.5, 64.2); await page.waitForTimeout(700); await talk([1], 'nima');
  await tp(62.6, -11.2); await page.waitForTimeout(700); await talk([2, 1], 'tor');
  await tp(12.8, 8.4); await page.waitForTimeout(700); await act('spar');
  await tp(62.6, -11.2); await page.waitForTimeout(700); await talk([1], 'tor');
  console.log('tor follow', await ev(`__game.flags.has('flag:tor-follow-active')`));
  await tp(50.5, 44); await page.waitForTimeout(400);
  for (let i = 0; i < 40 && (await mode()) === 'play'; i++) await page.waitForTimeout(300);
  console.log('kite cut', await mode());
  await page.waitForTimeout(2500); await shot('kite');
  await waitPlay(80);
  await key('KeyQ'); await page.waitForTimeout(1200); await shot('skyreading'); console.log(await step());
  for (const [la, lo] of [[30, -38], [44, 50], [60, 42]]) { await tp(la, lo); await page.waitForTimeout(700); await act('fence'); }
  await key('KeyQ');
  console.log(await step());
  await tp(60.2, -15.4); await page.waitForTimeout(800); await act('fire');
  await page.waitForTimeout(3000); await shot('campfire');
  for (let i = 0; i < 120 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(500); if (i === 10) await shot('winter'); if (i === 20) await shot('spring'); }
  console.log('after winter', await ev(`JSON.stringify({ sp: __game.snow.snowpack, healed: __game.flags.has('peaks-healed') })`), await step());
  await tp(30, -6); await page.waitForTimeout(2500); await shot('healed');
  await tp(58.6, -20.8); await page.waitForTimeout(700); await talk([1], 'ysolde');
  await tp(72.9, 7.6); await page.waitForTimeout(700); await talk([1, 1], 'odo');
  console.log(await step());
  await tp(72.5, 2.5); await page.waitForTimeout(700); await act('farewell');
  for (let i = 0; i < 160 && (await mode()) !== 'raft'; i++) { await page.waitForTimeout(500); if (i === 6) await shot('farewell'); if (i === 26) await shot('keepsake'); }
  await page.waitForTimeout(1500); await shot('raft');
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 120 && (await mode()) === 'raft'; i++) { await page.waitForTimeout(500); if (i === 10) await shot('rapids'); }
  await page.keyboard.up('KeyW');
  console.log('after raft', await mode());
  await page.waitForTimeout(1200); await shot('stream');
  for (let i = 0; i < 60 && (await ev('__game.cur')) !== 1; i++) await page.waitForTimeout(500);
  await page.waitForTimeout(1500); await shot('pines');
  await key('KeyE'); await page.waitForTimeout(500);
  await tp(9.5, 9, 1); await page.waitForTimeout(800); await act('updraft');
  await page.waitForTimeout(2500); await shot('kite-ride');
  for (let i = 0; i < 60 && (await ev('__game.cur')) !== 0; i++) await page.waitForTimeout(500);
  await waitPlay(40); await page.waitForTimeout(1500); await shot('back-up');
  await key('Tab'); await page.waitForTimeout(3500); await shot('sky');
  const xy = await ev(`(() => { const g = __game; const v = g.planets[1].center.clone().project(g.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; })()`);
  await page.mouse.click(xy[0], xy[1]); await page.waitForTimeout(2500);
  console.log('fast travel ->', await ev('__game.cur'), await mode());
  await shot('travelled');
  console.log(await ev(`JSON.stringify({ journal: __game.journal, flags: [...__game.flags].length })`));
};

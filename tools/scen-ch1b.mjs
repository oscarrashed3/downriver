// Second half of Chapter One from a prepared state: winter, Ysolde, Odo, farewell, raft, the Pines, kite back up, sky view.
export default async ({ page, shot, ev, key }) => {
  const mode = () => ev('__game.mode');
  const tp = (lat, lon, w = 0) => ev(`(() => { const g = __game; const p = g.planets[${w}]; g.player.placeAt(p, p.dirRiver(${lat}, ${lon})); g.rig.snap(); })()`);
  const prompt = () => ev(`document.querySelector('.prompt').innerText`);
  const goal = () => ev(`document.querySelector('.goal .gt').innerText`);
  const talk = async (choices, label) => {
    console.log('talk', label, '->', JSON.stringify(await prompt()));
    await key('KeyE'); await page.waitForTimeout(500);
    await page.keyboard.down('Space');
    let ci = 0;
    for (let r = 0; r < 300; r++) {
      const st = await ev(`(() => { const s = __game.conv?.step(); return s ? s.kind : 'none'; })()`);
      if (st === 'none' || st === 'end') break;
      if (st === 'cards') { await key('Digit' + (choices[ci++] ?? 1)); await page.waitForTimeout(250); continue; }
      await page.waitForTimeout(200);
    }
    await page.keyboard.up('Space'); await page.waitForTimeout(400);
  };
  const act = async (label) => { console.log('act', label, '->', JSON.stringify(await prompt())); await key('KeyE'); await page.waitForTimeout(700); };
  await page.click('button[data-a="new"]');
  for (let i = 0; i < 60 && (await mode()) !== 'play'; i++) await page.waitForTimeout(300);
  await ev(`(() => { const g = __game; ['read-letter','talked:ysolde','power:skyreading','saw-wind','quest:snowpack','flag:tor-fences','kite-flown','power:kite','quest:kite','item:spar'].forEach(f => g.give(f));
    g.sigs.ysolde = g.sigFor('ysolde'); ['fence-north-ridge','fence-saddle','fence-east-shoulder'].forEach(id => g.ch1.buildSite(id)); })()`);
  console.log('goal:', await goal());
  await tp(60.2, -16.6); await page.waitForTimeout(800); await act('fire');
  await page.waitForTimeout(2500); await shot('campfire');
  for (let i = 0; i < 160 && (await mode()) !== 'play'; i++) { await page.waitForTimeout(500); if (i === 8) await shot('stories'); if (i === 22) await shot('winter'); if (i === 30) await shot('spring'); }
  console.log('after winter', await ev(`JSON.stringify({ sp: __game.snow.snowpack, healed: __game.flags.has('peaks-healed') })`), await goal());
  await tp(36, -4); await page.waitForTimeout(2500); await shot('healed');
  await tp(58.6, -20.8); await page.waitForTimeout(700); await talk([1], 'ysolde');
  await tp(72.9, 7.6); await page.waitForTimeout(700); await talk([1, 1], 'odo');
  console.log('goal:', await goal());
  await tp(72.5, 2.5); await page.waitForTimeout(700); await act('farewell');
  for (let i = 0; i < 500 && (await mode()) !== 'raft'; i++) { await page.waitForTimeout(500); if (i === 5) await shot('farewell'); if (i === 60) await shot('keepsake'); }
  await page.waitForTimeout(1500); await shot('raft');
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 400 && (await mode()) === 'raft'; i++) { await page.waitForTimeout(500); if (i === 12) await shot('downriver'); }
  await page.keyboard.up('KeyW');
  console.log('after raft', await mode());
  await page.waitForTimeout(1500); await shot('stream');
  for (let i = 0; i < 200 && (await ev('__game.cur')) !== 1; i++) await page.waitForTimeout(500);
  await page.waitForTimeout(2000); await shot('pines');
  await key('KeyE'); await page.waitForTimeout(600);
  await tp(9.8, 9, 1); await page.waitForTimeout(800); await act('updraft');
  await page.waitForTimeout(2000); await shot('kite-ride');
  for (let i = 0; i < 60 && (await ev('__game.cur')) !== 0; i++) await page.waitForTimeout(500);
  for (let i = 0; i < 40 && (await mode()) !== 'play'; i++) await page.waitForTimeout(300);
  await page.waitForTimeout(1500); await shot('back-up');
  console.log('back in', await ev('__game.cur'), await ev(`JSON.stringify([...__game.flags].filter(f=>f.startsWith('visited')))`));
  await key('Tab'); await page.waitForTimeout(4000); await shot('sky');
  const xy = await ev(`(() => { const g = __game; const v = g.planets[1].center.clone().project(g.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight]; })()`);
  await page.mouse.click(xy[0], xy[1]); await page.waitForTimeout(3000);
  console.log('fast travel ->', await ev('__game.cur'), await mode());
  await shot('travelled');
  console.log(await ev(`JSON.stringify({ journal: __game.journal })`));
};

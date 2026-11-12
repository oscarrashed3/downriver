// World 3, the goodbye on the beach (Phase F): TOWNOUT=/dir node tools/play.mjs town-goodbye
import { townSetup } from './townE.mjs';
const DONE = ['town:arrived', 'town:jump-seen', 'town:quest', 'town:met-tamsin', 'town:stone-roped', 'town:foot-done', 'town:met-miller', 'town:sail-fitted', 'town:gap-0', 'town:gap-1', 'town:gap-2', 'town:water-done', 'town:met-bramwyn', ...[0, 1, 2, 3, 4, 5].map(i => 'town:vine-' + i), 'town:eyes-done', 'town:coast', 'letter:3'];
export default async (ctx) => {
  const T = await townSetup(ctx, DONE);
  const { ev } = ctx;
  console.log('start', await ev(`__game.contents[${T.W}].refs.walker.mode`), await ev(`__game.mode`), await T.state());
  const beat = () => ev(`__game.seq.i`);
  const toBeat = async (i, t) => { for (let n = 0; n < 900 && !(await ev(`!__game.seq.running || __game.seq.i > ${i} || (__game.seq.i === ${i} && __game.seq.t >= ${t})`)); n++) await T.sim(0.1); };
  await toBeat(1, 2.8); await T.snap('10a-beach');
  await toBeat(7, 2.6); await T.snap('10-moss-jar');
  await toBeat(9, 5.6); await T.snap('10b-nose');
  await toBeat(11, 11); await T.snap('11-amble-walks-away');
  await T.until(`__game.mode === 'play'`, 60);
  console.log('after', await beat(), await T.state(), await ev(`JSON.stringify([...__game.flags].filter(f => f.startsWith('item:') || f.startsWith('friend:')))`));
  // never on by itself: still here after a while
  await T.sim(8);
  console.log('still here', await ev(`__game.cur`), await T.state());
  const it = `__game.contents[${T.W}].interactables.find(i => i.id === 'townSea')`;
  await T.put(`${it}.pos.clone()`, false);
  await T.sim(1);
  await T.act('townSea');
  await T.until(`__game.cur !== ${T.W} && __game.mode === 'play'`, 30);
  await T.sim(2);
  console.log('world', await ev(`JSON.stringify({ cur: __game.cur, done: __game.flags.has('chapter3-complete') })`));
  await T.snap('12-world4');
};

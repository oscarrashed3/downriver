// Tryout only: one click moves the Walking Town story on by one task (the preview's "Skip task" button).
// It finishes the scene that is playing, or hands over what the current task would have given and puts Nilo
// back on Amble's back for the next one. The real journey never shows the button.
import type { Game } from '../../game';
import type { TownStory } from './townStory';
import type { TownMove } from './townMove';
import type { AmbleWalker } from './ambleWalk';

/** Play the running scene to its end at once (its own exits and done callbacks still run). */
function finishScene(g: Game) {
  for (let i = 0; i < 400 && g.seq.running; i++) g.seq.update(1e4, true);
  if (g.mode === 'cut' && !g.seq.running) g.mode = 'play';
}

export function townSkip(g: Game, ts: TownStory, tm: TownMove, W: AmbleWalker): string {
  const f = g.flags, give = (...ks: string[]) => { for (const k of ks) g.give(k); };
  if (g.seq.running) { finishScene(g); return 'Scene skipped.'; }
  if (g.mode === 'talk' && g.conv) { g.endTalk(); return 'Chat skipped.'; }
  if (g.mode !== 'play') return '';
  if (!f.has('town:arrived')) { give('town:arrived', 'town:jump-seen'); tm.dropOnShell(); return 'Arrival skipped.'; }
  const back = () => { if (!tm.onAmble) tm.dropOnShell(); };
  switch (ts.step()) {
    case 0:
      give('town:quest'); f.add('met:pip');
      back();
      return 'Met Pip. Next: Amble\'s sore foot.';
    case 1:
      give('town:met-tamsin', 'town:stone-roped', 'town:foot-done'); f.add('met:ropewright');
      back();
      return 'Stone pulled from Amble\'s foot. Next: the water.';
    case 2:
      f.delete('town:sail-carry'); f.delete('town:piece-carry');
      give('town:met-miller', 'town:sail-fitted', 'town:gap-0', 'town:gap-1', 'town:gap-2', 'town:water-done'); f.add('met:miller');
      back();
      return 'Water running again. Next: the vines over Amble\'s eyes.';
    case 3:
      give('town:met-bramwyn', ...[0, 1, 2, 3, 4, 5].map(i => 'town:vine-' + i), 'town:eyes-done'); f.add('met:bramwyn');
      tm.dropOnShell();
      return 'Eyes cleared: Amble walks again. Next: Pip at the lookout.';
    default:
      if (!f.has('town:coast')) {
        give('town:coast'); W.atCoast(); tm.amble.root.updateMatrixWorld(true); tm.dropOnShell();
        return 'Amble walked down to the coast: the goodbye starts now.';
      }
      if (f.has('town:goodbye') && !f.has('chapter3-complete')) { g.cut(ts.bye.seaBeats()); finishScene(g); return 'Out into the Sea: on to World 4.'; }
      return '';
  }
}

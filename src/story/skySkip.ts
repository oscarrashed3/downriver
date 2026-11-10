// Tryout only: one click moves the Sky Isles story on by one task (the preview's "Skip task" button).
// It finishes the scene that is playing, or hands over what the current task would have given and puts
// Nilo where the next one starts. The real journey never shows the button.
import * as THREE from 'three';
import type { Game } from '../game';
import type { SkyChapter } from './skyChapter';
import { skyStep, nextPart, SKY_HOMES } from './skyQuests';

/** Play the running scene to its end at once (its own exits and done callbacks still run). */
function finishScene(g: Game) {
  for (let i = 0; i < 400 && g.seq.running; i++) g.seq.update(1e4, true);
  if (g.mode === 'cut' && !g.seq.running) g.mode = 'play';
}

/** Put Nilo down a few steps from one of the windfolk's homes. */
function nearHome(ch: SkyChapter, id: keyof typeof SKY_HOMES) {
  const h = SKY_HOMES[id];
  ch.land(ch.dir([h.at[0] + 2.5, h.at[1]]));
}

export function skySkip(g: Game, ch: SkyChapter): string {
  const f = g.flags;
  if (g.seq.running) { finishScene(g); return 'Scene skipped.'; }
  if (g.mode === 'talk' && g.conv) { g.endTalk(); return 'Chat skipped.'; }
  if (g.mode !== 'play') return '';
  const R = ch.race;
  if (R.mode === 'qualifier') { R.passed.fill(true); R.end(true); finishScene(g); return 'Qualifier skipped: ribbon won.'; }
  if (R.mode === 'race') { R.end(true); finishScene(g); return 'Race skipped: you won.'; }

  const step = skyStep(f);
  switch (step) {
    case null:
      if (!f.has('sky:arrived')) { g.give('sky:arrived'); return 'Arrival skipped.'; }
      return '';
    case 'larkTown':
      for (const k of ['sky:quest-kite', 'map:sky', 'letter:2']) g.give(k);
      for (const n of ch.c.npcs) f.add('met:' + n.id);
      nearHome(ch, 'lark');
      return 'Met Lark. Next: the three kite parts.';
    case 'parts': {
      const p = nextPart(f)!;
      if (p.id === 'frame') { f.add('sky:part-frame'); f.add('form:glider'); g.give('power:glide'); }
      if (p.id === 'cloth') for (const k of ['sky:quest-cloth', 'sky:laundry', 'sky:part-cloth', 'told:cloth']) f.add(k);
      if (p.id === 'string') for (const k of ['sky:quest-string', 'sky:chime-tuned', 'sky:part-string', 'told:string']) f.add(k);
      ch.parts.partNote();
      const left = nextPart(f);
      nearHome(ch, left?.id === 'cloth' ? 'mender' : left?.id === 'string' ? 'chimer' : 'lark');
      return `Got the kite ${p.id === 'frame' ? 'frame' : p.id === 'cloth' ? 'sailcloth' : 'string'}.`;
    }
    case 'build':
      if (!f.has('fox-joined')) { f.add('sky:fox-seen'); g.give('fox-joined'); g.fox.free(); }
      g.cut(ch.parts.assemblyBeats()); finishScene(g);
      nearHome(ch, 'zephy');
      return 'Kite built. Next: the qualifier rings.';
    case 'qualify':
      f.add('sky:zephy-showed'); f.add('sky:ribbon'); g.give('item:racer-ribbon');
      nearHome(ch, 'zephy');
      return 'Qualifier skipped: ribbon won. Next: the race.';
    case 'race':
      g.cut(ch.finish.finishBeats()); finishScene(g);
      return 'Race won. Next: the goodbye at Whale\'s Rest.';
    case 'goodbye': {
      const d: THREE.Vector3 = ch.finish.site().nilo;
      ch.land(d);
      return 'At Whale\'s Rest: the goodbye starts now.';
    }
    default: return '';
  }
}

// The menu: one round paper button in the top-right corner opens everything.
// A strip of tabs sits along the top while it is open; the Map, Backpack, Letters, Sketchbook and Journal
// tabs show their own sheets underneath it, and Goal, Controls and Settings are drawn here.
import { esc } from './hud';

export type MenuTab = 'goal' | 'map' | 'worlds' | 'bag' | 'letters' | 'sketches' | 'journal' | 'controls' | 'settings';

export const MENU_TABS: { id: MenuTab; label: string; key?: string }[] = [
  { id: 'goal', label: 'Goal' },
  { id: 'map', label: 'Map', key: 'M' },
  { id: 'worlds', label: 'Worlds' },
  { id: 'bag', label: 'Backpack', key: 'B' },
  { id: 'letters', label: 'Letters', key: 'L' },
  { id: 'sketches', label: 'Sketchbook', key: 'K' },
  { id: 'journal', label: 'Journal', key: 'J' },
  { id: 'controls', label: 'Controls', key: 'H' },
  { id: 'settings', label: 'Settings' },
];

/** What the Goal tab shows. */
export interface GoalInfo { quest: string; step: string | null; lanterns: number | null; next: { name: string; where: string } | null; side: { title: string; text: string }[] }
export interface SettingsInfo { quality: string; volume: number; muted: boolean }

const ICON = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 25 L20 9 L34 25 Z" fill="#f6eedd" stroke="#2b2540" stroke-width="2" stroke-linejoin="round"/>
  <path d="M20 9 L20 25" stroke="#2b2540" stroke-width="1.6"/><path d="M4 26 Q20 33 36 26 L32 30 Q20 35 8 30 Z" fill="#e8d9b8" stroke="#2b2540" stroke-width="2" stroke-linejoin="round"/></svg>`;

export const CONTROLS_HTML = `
  <p><b>W A S D</b> walk &nbsp; <b>Shift</b> run &nbsp; <b>C</b> roll &nbsp; <b>Space</b> jump (at a run: a front flip; hold to glide, once you have the kite)</p>
  <p><b>Mouse</b> look (click to capture, or hold right button and drag) &nbsp; <b>Arrows</b> turn</p>
  <p><b>E</b> talk, use, sit, board Fold &nbsp; <b>Q</b> Skyreading (once learned) &nbsp; <b>F</b> whistle</p>
  <p><b>Esc</b> or the paper boat, top right: this menu &nbsp; <b>M</b> map &nbsp; <b>B</b> backpack &nbsp; <b>L</b> letters &nbsp; <b>K</b> sketchbook &nbsp; <b>J</b> journal</p>
  <p><b>Tab</b> or <b>scroll out</b> see all the worlds &nbsp; <b>G</b> hide the goal line &nbsp; <b>P</b> picture quality &nbsp; <b>N</b> sound on/off</p>
  <p>In conversation, <b>hold Space</b> while someone speaks. Letting go early is interrupting.<br/>When they fall silent, staying present is sometimes the kindest thing.</p>`;

export class Menu {
  button: HTMLButtonElement;
  strip: HTMLElement;
  page: HTMLElement;
  tab: MenuTab | null = null;
  private confirmReset = false;
  onTab: (t: MenuTab) => void = () => {};
  onClose: () => void = () => {};
  onQuality: () => void = () => {};
  onVolume: (v: number) => void = () => {};
  onMute: () => void = () => {};
  onReset: () => void = () => {};
  onGo: (i: number) => void = () => {};

  constructor(root: HTMLElement) {
    this.button = document.createElement('button');
    this.button.className = 'menubtn hidden';
    this.button.title = 'Menu (Esc)';
    this.button.innerHTML = ICON;
    this.button.addEventListener('click', e => { e.stopPropagation(); if (this.tab) this.onClose(); else this.onTab('goal'); });
    this.strip = document.createElement('div');
    this.strip.className = 'menustrip hidden';
    this.strip.innerHTML = MENU_TABS.map(t => `<button data-t="${t.id}">${t.label}${t.key ? `<span class="k">${t.key}</span>` : ''}</button>`).join('') + '<button class="x" data-t="close" title="Close (Esc)">×</button>';
    this.strip.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest('[data-t]') as HTMLElement | null;
      if (!b) return;
      e.stopPropagation();
      if (b.dataset.t === 'close') this.onClose(); else this.onTab(b.dataset.t as MenuTab);
    });
    this.page = document.createElement('div');
    this.page.className = 'overlay hidden';
    this.page.addEventListener('click', e => {
      if (e.target === this.page) { this.onClose(); return; }
      const a = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
      if (!a) return;
      if (a.dataset.a === 'go') this.onGo(Number(a.dataset.i));
      if (a.dataset.a === 'quality') this.onQuality();
      if (a.dataset.a === 'mute') this.onMute();
      if (a.dataset.a === 'reset') { if (this.confirmReset) this.onReset(); else { this.confirmReset = true; a.textContent = 'Click again to erase your journey and start over'; a.classList.add('warn'); } }
    });
    this.page.addEventListener('input', e => {
      const r = e.target as HTMLInputElement;
      if (r.dataset.a === 'volume') this.onVolume(Number(r.value) / 100);
    });
    root.append(this.page, this.strip, this.button);
  }

  /** Show the corner button only while walking around. */
  setButton(on: boolean) { this.button.classList.toggle('hidden', !on); }

  /** Mark the open tab; null closes the strip. */
  select(t: MenuTab | null) {
    this.tab = t;
    this.strip.classList.toggle('hidden', !t);
    this.button.classList.toggle('open', !!t);
    this.strip.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', (b as HTMLElement).dataset.t === t));
    if (t !== 'settings') this.confirmReset = false;
    if (t !== 'goal' && t !== 'controls' && t !== 'settings') this.page.classList.add('hidden');
  }

  showGoal(g: GoalInfo) {
    const lamps = g.lanterns === null ? '' : `<div class="lamps">${[0, 1, 2].map(i => `<span class="${i < g.lanterns! ? 'lit' : ''}"></span>`).join('')}<em>${g.lanterns} of 3 lanterns lit on Odo's bridge</em></div>`;
    const next = g.next ? `<div class="next"><span class="nk">Who to see next</span><b>${esc(g.next.name)}</b>, ${esc(g.next.where)}</div>` : '';
    const side = g.side.length ? `<div class="sub">Along the way</div><ul>${g.side.map(q => `<li><b>${esc(q.title)}.</b> ${esc(q.text)}</li>`).join('')}</ul>` : '';
    this.open(`<div class="sheet menusheet"><h2>The way home</h2><div class="sub">${esc(g.quest)}</div>
      ${g.step ? `<div class="now">${esc(g.step)}</div>` : '<div class="now">Nothing right now. Follow the water.</div>'}${lamps}${next}${side}</div>`);
  }

  /** Every world: where you are, where you can fly back to, and what is still ahead. */
  showWorlds(list: { name: string; n: string; state: 'here' | 'done' | 'visited' | 'ahead' }[]) {
    const tag = { here: 'You are here', done: '✓ Finished', visited: 'Visited', ahead: 'Not yet' };
    this.open(`<div class="sheet menusheet worlds"><h2>Worlds</h2><p class="lead">Fly back to any world you have been to. Everything there stays as you left it. <i>Tab shows them in the sky, too.</i></p>
      ${list.map((w, i) => `<div class="row wrow ${w.state}"><span><small>${esc(w.n)}</small> ${esc(w.name)}</span><em>${tag[w.state]}</em>${w.state === 'done' || w.state === 'visited' ? `<button data-a="go" data-i="${i}">Go back</button>` : ''}</div>`).join('')}</div>`);
  }

  showControls() { this.open(`<div class="sheet menusheet help2"><h2>Controls</h2>${CONTROLS_HTML}</div>`); }

  showSettings(s: SettingsInfo) {
    this.open(`<div class="sheet menusheet"><h2>Settings</h2>
      <div class="row"><span>Picture quality</span><button data-a="quality">${esc(s.quality)}</button><em>Click to change. Lower is smoother on older laptops.</em></div>
      <div class="row"><span>Sound</span><input type="range" min="0" max="100" value="${Math.round(s.volume * 100)}" data-a="volume"><button data-a="mute">${s.muted ? 'Sound off' : 'Sound on'}</button></div>
      <div class="row"><span>Your journey</span><button data-a="reset">Begin again</button><em>Erases your save.</em></div></div>`);
  }

  /** Update the sound button without redrawing the page (so a slider drag is not interrupted). */
  setMuted(m: boolean) { const b = this.page.querySelector('[data-a="mute"]'); if (b) b.textContent = m ? 'Sound off' : 'Sound on'; }

  private open(html: string) { this.page.innerHTML = html; this.page.classList.remove('hidden'); }
  hidePage() { this.page.classList.add('hidden'); }
}

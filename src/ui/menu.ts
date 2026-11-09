// The menu: a round paper-boat button in the top-right corner opens the journey (Goal, Map, Worlds, Bag...),
// and a gear beside it (or Esc) opens Settings. A strip of tabs sits along the top while it is open; the Map, Backpack, Letters, Sketchbook and Journal
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
export type QualityPick = 'auto' | 'low' | 'medium' | 'high';
export interface SettingsInfo {
  /** The level in use now, and whether the game picks it by itself. */
  quality: 'low' | 'medium' | 'high'; auto: boolean;
  volume: number; muted: boolean;
  /** Camera follow distance in metres (4..14) and mouse-look speed (0.3..2.5, 1 = normal). */
  camDist: number; sens: number;
  /** Shown over the title screen: no "Begin again" here, and no strip of tabs. */
  onTitle?: boolean;
}

const ICON = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 25 L20 9 L34 25 Z" fill="#f6eedd" stroke="#2b2540" stroke-width="2" stroke-linejoin="round"/>
  <path d="M20 9 L20 25" stroke="#2b2540" stroke-width="1.6"/><path d="M4 26 Q20 33 36 26 L32 30 Q20 35 8 30 Z" fill="#e8d9b8" stroke="#2b2540" stroke-width="2" stroke-linejoin="round"/></svg>`;

const GEAR = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M17.6 5h4.8l.9 4.2 2.6 1.1 3.6-2.3 3.4 3.4-2.3 3.6 1.1 2.6 4.2.9v4.8l-4.2.9-1.1 2.6 2.3 3.6-3.4 3.4-3.6-2.3-2.6 1.1-.9 4.2h-4.8l-.9-4.2-2.6-1.1-3.6 2.3-3.4-3.4 2.3-3.6-1.1-2.6L5 22.4v-4.8l4.2-.9 1.1-2.6L8 10.5 11.4 7.1 15 9.4l2.6-1.1z" fill="#f6eedd" stroke="#2b2540" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="20" cy="20" r="5.2" fill="#e8d9b8" stroke="#2b2540" stroke-width="2"/></svg>`;

/** A line-drawn gear for the title screen's Settings button (takes the text colour). */
export const TITLE_GEAR = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M17.6 5h4.8l.9 4.2 2.6 1.1 3.6-2.3 3.4 3.4-2.3 3.6 1.1 2.6 4.2.9v4.8l-4.2.9-1.1 2.6 2.3 3.6-3.4 3.4-3.6-2.3-2.6 1.1-.9 4.2h-4.8l-.9-4.2-2.6-1.1-3.6 2.3-3.4-3.4 2.3-3.6-1.1-2.6L5 22.4v-4.8l4.2-.9 1.1-2.6L8 10.5 11.4 7.1 15 9.4l2.6-1.1z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="20" cy="20" r="5.2" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>`;

/** The few keys worth remembering, for the Settings page. */
const KEYS_SHORT: [string, string][] = [
  ['W A S D', 'walk'], ['Mouse', 'look (click the world to capture it)'], ['X', 'run'], ['Space', 'jump, hold to listen'],
  ['E', 'talk, use, sit'], ['M', 'map'], ['Esc', 'this page'], ['Scroll', 'camera nearer / further'],
];

const pct = (v: number) => Math.round(v * 100);
/** Slider positions for camera distance and mouse speed, as whole numbers 0..100. */
const distTo100 = (d: number) => Math.round((d - 4) / 10 * 100);
/** Mouse speed: the middle of the slider is normal speed; left goes down to 0.3, right up to 2.5. */
const sensTo100 = (s: number) => Math.round(s <= 1 ? (s - 0.3) / 0.7 * 50 : 50 + (s - 1) / 1.5 * 50);
const sensFrom100 = (v: number) => v <= 50 ? 0.3 + v / 50 * 0.7 : 1 + (v - 50) / 50 * 1.5;
const sensWord = (s: number) => s < 0.6 ? 'Slow' : s < 0.85 ? 'Calm' : s <= 1.2 ? 'Normal' : s <= 1.7 ? 'Quick' : 'Very quick';
const distWord = (d: number) => d < 5.5 ? 'Close' : d < 7.5 ? 'Near' : d <= 10 ? 'Normal' : d <= 12 ? 'Far' : 'Very far';

export const CONTROLS_HTML = `
  <p><b>W A S D</b> walk &nbsp; <b>X</b> run &nbsp; <b>C</b> roll &nbsp; <b>Space</b> jump (at a run: a front flip; hold to glide, once you have the kite)</p>
  <p><b>Mouse</b> look (click to capture, or hold right button and drag) &nbsp; <b>Arrows</b> turn</p>
  <p><b>E</b> talk, use, sit, board Fold &nbsp; <b>Q</b> Skyreading (once learned) &nbsp; <b>F</b> whistle</p>
  <p><b>Esc</b> or the gear, top right: settings &nbsp; the paper boat beside it: this menu &nbsp; <b>M</b> map &nbsp; <b>B</b> backpack &nbsp; <b>L</b> letters &nbsp; <b>K</b> sketchbook &nbsp; <b>J</b> journal</p>
  <p><b>Scroll</b> camera nearer or further &nbsp; <b>G</b> hide the goal line &nbsp; <b>P</b> picture quality &nbsp; <b>N</b> sound on/off</p>
  <p>In conversation, <b>hold Space</b> while someone speaks. Letting go early is interrupting.<br/>When they fall silent, staying present is sometimes the kindest thing.</p>`;

export class Menu {
  button: HTMLButtonElement;
  gear: HTMLButtonElement;
  strip: HTMLElement;
  page: HTMLElement;
  tab: MenuTab | null = null;
  private confirmReset = false;
  onTab: (t: MenuTab) => void = () => {};
  onClose: () => void = () => {};
  onGear: () => void = () => {};
  onQuality: (q: QualityPick) => void = () => {};
  onVolume: (v: number) => void = () => {};
  onMute: () => void = () => {};
  onCamDist: (d: number) => void = () => {};
  onSens: (s: number) => void = () => {};
  onReset: () => void = () => {};
  onGo: (i: number) => void = () => {};

  constructor(root: HTMLElement) {
    this.button = document.createElement('button');
    this.button.className = 'menubtn hidden';
    this.button.setAttribute('aria-label', 'Journey: goal, map, worlds, backpack, letters, journal');
    this.button.dataset.tip = 'Journey: goal, map, backpack, journal';
    this.button.innerHTML = ICON;
    this.gear = document.createElement('button');
    this.gear.className = 'gearbtn hidden';
    this.gear.setAttribute('aria-label', 'Settings (Esc)');
    this.gear.dataset.tip = 'Settings';
    this.gear.dataset.key = 'Esc';
    this.gear.innerHTML = GEAR;
    this.gear.addEventListener('click', e => { e.stopPropagation(); this.gear.blur(); this.onGear(); });
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
      if (a.dataset.a === 'quality') this.onQuality(a.dataset.q as QualityPick);
      if (a.dataset.a === 'mute') this.onMute();
      if (a.dataset.a === 'controls') this.onTab('controls');
      if (a.dataset.a === 'close') this.onClose();
      if (a.dataset.a === 'reset') { if (this.confirmReset) this.onReset(); else { this.confirmReset = true; a.textContent = 'Sure? Click again to erase your journey'; a.classList.add('warn'); } }
    });
    this.page.addEventListener('input', e => {
      const r = e.target as HTMLInputElement, v = Number(r.value);
      const out = (t: string) => { const o = r.parentElement?.querySelector('output'); if (o) o.textContent = t; };
      if (r.dataset.a === 'volume') { this.onVolume(v / 100); out(v + '%'); }
      if (r.dataset.a === 'camdist') { const d = 4 + v / 100 * 10; this.onCamDist(d); out(distWord(d)); }
      if (r.dataset.a === 'sens') { const s = sensFrom100(v); this.onSens(s); out(sensWord(s)); }
    });
    // Sliders and buttons on the page must not keep keyboard focus: Space, arrows and Esc belong to the game.
    this.page.addEventListener('change', e => (e.target as HTMLElement).blur?.());
    this.page.addEventListener('pointerup', e => { const t = e.target as HTMLElement; if (t.tagName === 'BUTTON') t.blur(); });
    root.append(this.page, this.strip, this.gear, this.button);
  }

  /** Show the corner button only while walking around. */
  setButton(on: boolean) { this.button.classList.toggle('hidden', !on); this.gear.classList.toggle('hidden', !on); }

  /** Mark the open tab; null closes the strip. */
  select(t: MenuTab | null) {
    this.tab = t;
    this.strip.classList.toggle('hidden', !t);
    this.button.classList.toggle('open', !!t && t !== 'settings');
    this.gear.classList.toggle('open', t === 'settings');
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
    this.open(`<div class="sheet menusheet worlds"><h2>Worlds</h2><p class="lead">Fly back to any world you have been to. Everything there stays as you left it.</p>
      ${list.map((w, i) => `<div class="row wrow ${w.state}"><span><small>${esc(w.n)}</small> ${esc(w.name)}</span><em>${tag[w.state]}</em>${w.state === 'done' || w.state === 'visited' ? `<button data-a="go" data-i="${i}">Go back</button>` : ''}</div>`).join('')}</div>`);
  }

  showControls() { this.open(`<div class="sheet menusheet help2"><h2>Controls</h2>${CONTROLS_HTML}</div>`); }

  showSettings(s: SettingsInfo) {
    const q = (id: QualityPick, label: string, note: string) => {
      const on = id === 'auto' ? s.auto : !s.auto && s.quality === id;
      return `<button data-a="quality" data-q="${id}" class="${on ? 'on' : ''}" aria-pressed="${on}"><b>${label}</b><small>${note}</small></button>`;
    };
    const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
    this.open(`<div class="sheet menusheet settings${s.onTitle ? ' ontitle' : ''}">
      <button class="sx" data-a="close" aria-label="Close (Esc)" title="Close (Esc)">×</button>
      <h2>Settings</h2>
      <section><h3>Picture <span class="hint">Lower is smoother on older laptops &middot; <kbd>P</kbd></span></h3>
        <div class="seg">${q('auto', 'Auto', s.auto ? `now ${cap(s.quality)}` : 'picks for you')}${q('low', 'Low', 'smoothest')}${q('medium', 'Medium', 'balanced')}${q('high', 'High', 'most painterly')}</div>
      </section>
      <section><h3>Sound <span class="hint">Best with headphones &middot; <kbd>N</kbd> on / off</span></h3>
        <div class="slide"><label for="set-vol">Volume</label><input id="set-vol" type="range" min="0" max="100" value="${pct(s.volume)}" data-a="volume"><output>${pct(s.volume)}%</output>
          <button data-a="mute" class="mute${s.muted ? ' off' : ''}" aria-pressed="${s.muted}">${s.muted ? 'Sound off' : 'Sound on'}</button></div>
      </section>
      <section><h3>Camera <span class="hint">The mouse wheel also brings it nearer</span></h3>
        <div class="slide"><label for="set-dist">Distance</label><input id="set-dist" type="range" min="0" max="100" value="${distTo100(s.camDist)}" data-a="camdist"><output>${distWord(s.camDist)}</output></div>
        <div class="slide"><label for="set-sens">Mouse speed</label><input id="set-sens" type="range" min="0" max="100" value="${sensTo100(s.sens)}" data-a="sens"><output>${sensWord(s.sens)}</output></div>
      </section>
      <section><h3>Controls ${s.onTitle ? '' : '<button class="link" data-a="controls">See all controls</button>'}</h3>
        <div class="keys">${KEYS_SHORT.map(([k, w]) => `<div><kbd>${k}</kbd><span>${w}</span></div>`).join('')}</div>
      </section>
      ${s.onTitle ? '' : `<section class="journey"><h3>Your journey</h3>
        <div class="slide"><button data-a="reset" class="reset">Begin again</button><span class="hint">Erases your save and starts from the very beginning</span></div>
      </section>`}
      <p class="foot">Kept on this computer &middot; <kbd>Esc</kbd> to close</p></div>`);
    this.page.classList.toggle('ontitle', !!s.onTitle);
  }

  /** Redraw the Settings page if it is the one showing (after P or N from the keyboard). */
  refreshSettings(s: SettingsInfo) { if (!this.page.classList.contains('hidden') && this.page.querySelector('.settings')) this.showSettings(s); }

  /** Update the sound button without redrawing the page (so a slider drag is not interrupted). */
  setMuted(m: boolean) {
    const b = this.page.querySelector('[data-a="mute"]');
    if (b) { b.textContent = m ? 'Sound off' : 'Sound on'; b.classList.toggle('off', m); b.setAttribute('aria-pressed', String(m)); }
  }

  private open(html: string) { this.page.innerHTML = html; this.page.classList.remove('hidden', 'ontitle'); }
  hidePage() { this.page.classList.add('hidden'); }
}

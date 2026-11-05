import type { Card } from '../systems/connection';

const $ = (html: string) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild as HTMLElement; };

/** All on-screen UI. Deliberately quiet: no minimap, no quest markers, no meters. */
export class Hud {
  root = document.getElementById('ui')!;
  prompt = $(`<div class="prompt"></div>`);
  toast = $(`<div class="toast"></div>`);
  banner = $(`<div class="banner"><div class="bn"></div><div class="bs"></div></div>`);
  fade = $(`<div class="fade"></div>`);
  frost = $(`<div class="frost"></div>`);
  sky = $(`<div class="skyread"></div>`);
  dlg = $(`<div class="dlg hidden"><div class="who"><span class="nm"></span><span class="tt"></span></div><div class="tx"></div><div class="cards"></div><div class="listen"><div class="ring"></div><span>Hold <b>Space</b> to listen</span></div></div>`);
  story = $(`<div class="story hidden"><div class="st"></div><div class="sk">press Space</div></div>`);
  help = $(`<div class="help hidden"></div>`);
  caption = $(`<div class="caption"><div class="cw"></div><div class="ct"></div><div class="ck">Space</div></div>`);
  chapter = $(`<div class="chapter"><div class="cn"></div><div class="cti"></div><div class="cs"></div></div>`);
  goal = $(`<div class="goal"><div class="gk">On my way home</div><div class="gt"></div></div>`);
  letter = $(`<div class="letter hidden"><div class="paper"><div class="lt"></div><div class="lk">E to fold it away</div></div></div>`);
  panel = $(`<div class="kpanel hidden"><div class="frame"></div><div class="kc"></div></div>`);
  hold = $(`<div class="hold"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" class="bg"/><circle cx="22" cy="22" r="18" class="fg"/></svg><span></span></div>`);
  labels = $(`<div class="labels"></div>`);
  goalHidden = false;
  private chapterT = 0;
  private toastQ: string[] = [];
  private toastT = 0;
  private bannerT = 0;

  constructor() {
    this.root.append(this.sky, this.frost, this.labels, this.goal, this.banner, this.prompt, this.toast, this.hold, this.caption, this.dlg, this.story, this.panel, this.letter, this.chapter, this.fade, this.help);
    this.help.innerHTML = `<h2>How to travel</h2>
      <p><b>W A S D</b> walk &nbsp; <b>Shift</b> run &nbsp; <b>Space</b> jump (hold to glide, once you have the kite) &nbsp; <b>Mouse</b> look (click to capture, or hold right button and drag) &nbsp; <b>Arrows</b> turn</p>
      <p><b>E</b> talk, use, sit, board Fold &nbsp; <b>Q</b> Skyreading (once learned) &nbsp; <b>F</b> whistle</p>
      <p><b>Tab</b> or <b>scroll out</b> see all the worlds &nbsp; <b>M</b> map &nbsp; <b>J</b> journal &nbsp; <b>B</b> backpack, letters, sketchbook &nbsp; <b>G</b> hide the goal line</p>
      <p><b>P</b> picture quality &nbsp; <b>N</b> sound on/off &nbsp; <b>H</b> this help</p>
      <p>In conversation, <b>hold Space</b> while someone speaks. Letting go early is interrupting.<br/>When they fall silent, staying present is sometimes the kindest thing.</p>
      <p>On the river, <b>E</b> unfolds Fold into a raft. Downstream always leads on.</p>
      <p class="dim">Press H to close</p>`;
  }

  setPrompt(text: string | null) {
    this.prompt.innerHTML = text ?? '';
    this.prompt.classList.toggle('on', !!text);
  }

  notify(text: string) { if (!this.toastQ.includes(text)) this.toastQ.push(text); if (this.toastQ.length > 4) this.toastQ.shift(); }

  showBanner(name: string, sub: string) {
    (this.banner.querySelector('.bn') as HTMLElement).textContent = name;
    (this.banner.querySelector('.bs') as HTMLElement).textContent = sub;
    this.banner.classList.add('on'); this.bannerT = 5;
  }

  setFade(a: number, color = '#fff8ee') { this.fade.style.opacity = String(a); this.fade.style.background = color; }
  setFrost(a: number) { this.frost.style.opacity = String(a); }

  // ---- dialogue ----
  openDialogue(name: string, title: string) {
    (this.dlg.querySelector('.nm') as HTMLElement).textContent = name;
    (this.dlg.querySelector('.tt') as HTMLElement).textContent = title;
    this.dlg.classList.remove('hidden');
    this.setCards(null);
  }
  closeDialogue() { this.dlg.classList.add('hidden'); }
  setLine(text: string, shown: number, holding: boolean, silence = false) {
    const tx = this.dlg.querySelector('.tx') as HTMLElement;
    if (silence) tx.innerHTML = `<span class="sil">. . .</span>`;
    else tx.innerHTML = `<span>${esc(text.slice(0, shown))}</span><span class="ghost">${esc(text.slice(shown))}</span>`;
    const l = this.dlg.querySelector('.listen') as HTMLElement;
    l.classList.toggle('holding', holding);
    l.style.display = 'flex';
  }
  setCards(cards: Card[] | null, onPick?: (i: number) => void) {
    const c = this.dlg.querySelector('.cards') as HTMLElement;
    c.innerHTML = '';
    if (!cards) { c.style.display = 'none'; return; }
    (this.dlg.querySelector('.listen') as HTMLElement).style.display = 'none';
    (this.dlg.querySelector('.tx') as HTMLElement).innerHTML = '';
    c.style.display = 'flex';
    cards.forEach((card, i) => {
      const b = $(`<button class="card"><span class="k">${i + 1}</span>${esc(card.text)}</button>`);
      b.onclick = () => onPick?.(i);
      c.append(b);
    });
  }

  showStory(text: string, light = false) {
    (this.story.querySelector('.st') as HTMLElement).innerHTML = text;
    this.story.classList.remove('hidden');
    this.story.classList.toggle('light', light);
  }
  hideStory() { this.story.classList.add('hidden'); }
  toggleHelp(force?: boolean) { this.help.classList.toggle('hidden', force === undefined ? undefined : !force); }
  helpOpen() { return !this.help.classList.contains('hidden'); }

  // ---- story pieces ----
  showCaption(who: string | null, text: string | null) {
    this.caption.classList.toggle('on', !!text);
    if (!text) return;
    (this.caption.querySelector('.cw') as HTMLElement).textContent = who ?? '';
    (this.caption.querySelector('.ct') as HTMLElement).innerHTML = text;
  }
  showChapter(n: string, title: string, sub = '', secs = 5) {
    (this.chapter.querySelector('.cn') as HTMLElement).textContent = n;
    (this.chapter.querySelector('.cti') as HTMLElement).textContent = title;
    (this.chapter.querySelector('.cs') as HTMLElement).textContent = sub;
    this.chapter.classList.add('on'); this.chapterT = secs;
  }
  setGoal(text: string | null) {
    const t = this.goal.querySelector('.gt') as HTMLElement;
    if (text && t.textContent !== text) { t.textContent = text; this.goal.classList.remove('pulse'); void this.goal.offsetWidth; this.goal.classList.add('pulse'); }
    this.goal.classList.toggle('on', !!text && !this.goalHidden);
  }
  showLetter(text: string | null) {
    this.letter.classList.toggle('hidden', !text);
    if (text) (this.letter.querySelector('.lt') as HTMLElement).textContent = text;
  }
  showPanel(canvas: HTMLCanvasElement | null, caption = '', alpha = 1) {
    this.panel.classList.toggle('hidden', !canvas);
    if (!canvas) return;
    const f = this.panel.querySelector('.frame') as HTMLElement;
    if (f.firstChild !== canvas) { f.innerHTML = ''; f.append(canvas); f.style.opacity = '1'; }
    (this.panel.querySelector('.kc') as HTMLElement).textContent = caption;
    this.panel.style.opacity = String(alpha);
  }
  setHold(progress: number | null, label = '') {
    this.hold.classList.toggle('on', progress !== null);
    if (progress === null) return;
    const fg = this.hold.querySelector('.fg') as SVGCircleElement;
    fg.style.strokeDashoffset = String(113 * (1 - progress));
    (this.hold.querySelector('span') as HTMLElement).innerHTML = label;
  }

  update(dt: number) {
    if (this.chapterT > 0) { this.chapterT -= dt; if (this.chapterT <= 0) this.chapter.classList.remove('on'); }
    this.toastT -= dt;
    if (this.toastT <= 0) {
      const next = this.toastQ.shift();
      if (next) { this.toast.innerHTML = next; this.toast.classList.add('on'); this.toastT = this.toastQ.length > 1 ? 1.9 : 3; }
      else this.toast.classList.remove('on');
    }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.banner.classList.remove('on'); }
  }
}

export function esc(s: string) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!)); }

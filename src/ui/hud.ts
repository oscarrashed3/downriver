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
  private toastQ: string[] = [];
  private toastT = 0;
  private bannerT = 0;

  constructor() {
    this.root.append(this.sky, this.frost, this.fade, this.banner, this.prompt, this.toast, this.dlg, this.story, this.help);
    this.help.innerHTML = `<h2>How to travel</h2>
      <p><b>W A S D</b> walk &nbsp; <b>Shift</b> run &nbsp; <b>Space</b> jump &nbsp; <b>Mouse</b> look (click to capture)</p>
      <p><b>E</b> talk, use, board Fold &nbsp; <b>Q</b> Skyreading (once learned)</p>
      <p><b>M</b> your map &nbsp; <b>J</b> journal &nbsp; <b>H</b> this help &nbsp; <b>N</b> sound on/off</p>
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

  update(dt: number) {
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

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { WORLDS } from './world/worlds';
import { Planet } from './world/planet';
import { Sky } from './world/sky';
import { prepare, populate, type WorldContent, type Interactable } from './world/content';
import * as Q from './world/props2';
import { PK, peaksFlowers } from './world/peaks';
import { latLonOf, orientTo, wrapDeg } from './world/sphere';
import { clamp, lerp, smoothstep } from './world/noise';
import { Player } from './player/player';
import { Fold } from './player/fold';
import { CameraRig } from './player/camera';
import { Input } from './core/input';
import { Sound } from './core/audio';
import { Hud, esc } from './ui/hud';
import { Conversation, type Mood, type Script, type Node } from './systems/connection';
import { SCRIPTS } from './data/scripts';
import { JOURNAL } from './data/journal';
import { MapView, PIECES } from './systems/mapView';
import { createRiverState, flowArrivingAt, riverHealth, riverWidthFor, type RiverState } from './systems/riverState';
import { createSnowpack, springFlowFrom, projectedSnowpack, type SnowpackState } from './systems/snowpack';
import { Skyreading } from './systems/skyreading';
import { Motes } from './systems/particles';
import { loadSave, writeSave, clearSave, type SaveData } from './systems/save';
import type { Npc } from './systems/npc';
import { PAINT } from './render/paint';
import { DayCycle } from './render/daylight';
import { Grass } from './render/grass';
import { QualityAuto } from './render/quality';
import { SkyView, type CamPose } from './systems/skyView';
import { Life } from './systems/life';
import { Sequencer, type Beat } from './story/sequencer';
import { currentStep, activeSideQuests, type QuestCtx } from './story/quests';
import { CHAPTERS, MAIN_QUEST, NOT_YET, OPENING } from './data/story';
import { ChapterOne } from './story/chapterOne';
import * as Opening from './story/opening';

export type Mode = 'title' | 'cut' | 'play' | 'talk' | 'ride' | 'raft' | 'overlay' | 'sky' | 'letter';

interface Ride { to: number; curve: THREE.Curve<THREE.Vector3>; s: number; dur: number; kite: boolean; arrive: () => void }

const FOG_BASE = 0.0026;

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 12000);
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  sunLight: THREE.DirectionalLight;
  moonLight: THREE.DirectionalLight;
  day: DayCycle;
  sky: Sky;
  planets: Planet[] = [];
  contents: WorldContent[] = [];
  streams: THREE.Mesh[] = [];
  streamMat: THREE.ShaderMaterial | null = null;
  updrafts: THREE.Mesh[] = [];
  updraftMat: THREE.ShaderMaterial;
  cur = 0;
  player = new Player();
  fold = new Fold();
  rig: CameraRig;
  input: Input;
  hud = new Hud();
  sound = new Sound();
  map: MapView;
  skyread: Skyreading;
  skyView: SkyView;
  grass: Grass;
  life: Life;
  quality = new QualityAuto();
  motes: Motes;
  rain: Motes;
  blizzard: Motes;
  beacon: THREE.Sprite;
  beaconPos = new THREE.Vector3();
  seq: Sequencer;
  ch1: ChapterOne;
  mode: Mode = 'title';
  flags = new Set<string>();
  moods: Record<string, Mood> = {};
  sigs: Record<string, string> = {};
  river: RiverState = createRiverState();
  snow: SnowpackState = createSnowpack();
  polesRead = new Set<number>();
  journal: string[] = [];
  flowers = 0;
  time = 0;
  timer = new THREE.Timer();
  /** Winter blanket 0..1, used during the campfire night. */
  winter = 0;
  // conversation
  conv: Conversation | null = null;
  convNpc: Npc | null = null;
  shownChars = 0;
  lineHold = 0;
  silenceGrace = 0;
  lastBlip = 0;
  // other state
  ride: Ride | null = null;
  overlay: 'map' | 'journal' | null = null;
  journalEl: HTMLElement;
  titleEl: HTMLElement | null = null;
  nearest: { label: string; act: () => void; hold?: number; key: string } | null = null;
  holdT = 0;
  holdKey = '';
  /** Camera pose for scripted scenes, or null to follow the traveler. */
  cutCam: CamPose | null = null;
  /** 0..1: thin the fog so far worlds show (title, sky view, the home light shot). */
  fogK = 0;
  sitting: THREE.Object3D | null = null;
  departure = false;
  travel: { to: number; t: number; done: boolean } | null = null;
  raftYaw = 0;
  raftSpin = 0;
  edgeWarned = false;
  fps = 60;
  /** ?fast in the URL speeds up talking and waiting, for automated playtests. */
  fast = new URLSearchParams(location.search).has('fast') ? 10 : 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.fog = new THREE.FogExp2('#cfe5f2', FOG_BASE);

    const sunDir0 = new THREE.Vector3(0.5, 0.35, 0.8).normalize();
    const riverLon = Math.atan2(sunDir0.z, sunDir0.x) * 180 / Math.PI;
    WORLDS.forEach((w, i) => {
      const p = new Planet(w, i, riverLon);
      prepare(p);
      p.build();
      p.terrain.receiveShadow = true;
      this.scene.add(p.group);
      this.planets.push(p);
      this.contents.push(populate(p, this.scene, i));
    });
    this.day = new DayCycle(riverLon);
    this.sky = new Sky(this.scene, this.day.sun, this.planets[0].center);

    this.sunLight = new THREE.DirectionalLight('#fff1da', 2.4);
    this.sunLight.castShadow = true;
    const sc = this.sunLight.shadow.camera;
    sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 260;
    this.sunLight.shadow.bias = -0.0006; this.sunLight.shadow.normalBias = 0.06;
    this.moonLight = new THREE.DirectionalLight('#9fb0ff', 0);
    this.scene.add(this.sunLight, this.sunLight.target, this.moonLight, this.moonLight.target);

    this.buildStreams();
    this.updraftMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uTime: PAINT.uTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        void main(){ float s = smoothstep(0.55, 1.0, sin((vUv.y * 9.0 - uTime * 1.6 + vUv.x * 12.566) ) * 0.5 + 0.5);
        float fade = smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.5, vUv.y);
        gl_FragColor = vec4(1.0, 0.92, 0.75, s * fade * 0.35); }`,
    });
    this.buildTravelProps();

    const p0 = this.planets[0];
    this.grass = new Grass(p0, p0.grassW!, 3.4, d => peaksFlowers(p0, d));
    this.scene.add(this.grass.group);
    const R0 = this.contents[0].refs;
    this.life = new Life(this.scene, p0, PK.flowers, R0.chimneys, (R0.fire as THREE.Object3D).position, PK.fire);

    this.scene.add(this.player.root, this.fold.root, this.fold.string);
    this.rig = new CameraRig(this.camera);
    this.input = new Input(canvas);
    this.map = new MapView(this.contents.flatMap(c => c.landmarks));
    this.skyread = new Skyreading(this.scene);
    this.motes = new Motes(this.scene, 500);
    this.rain = new Motes(this.scene, 900, '#bfe3ff', 0.22);
    this.blizzard = new Motes(this.scene, 1400, '#ffffff', 0.24);
    this.journalEl = document.createElement('div');
    this.journalEl.className = 'overlay hidden';
    document.getElementById('ui')!.append(this.journalEl);
    this.skyView = new SkyView(this.scene, this.planets, this.hud.labels);

    // The home light: the lighthouse at the end of the river, blinking far below the clouds.
    const sea = this.planets[5];
    sea.surfacePoint(sea.dirRiver(172, 3), 16.5, this.beaconPos);
    const bc = document.createElement('canvas'); bc.width = bc.height = 64;
    const bx = bc.getContext('2d')!;
    const bg = bx.createRadialGradient(32, 32, 0, 32, 32, 32);
    bg.addColorStop(0, 'rgba(255,255,235,1)'); bg.addColorStop(0.2, 'rgba(255,230,150,0.95)'); bg.addColorStop(1, 'rgba(255,190,110,0)');
    bx.fillStyle = bg; bx.fillRect(0, 0, 64, 64);
    this.beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(bc), sizeAttenuation: false, transparent: true, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.beacon.position.copy(this.beaconPos);
    this.beacon.scale.setScalar(0.022);
    this.beacon.renderOrder = 10;
    this.scene.add(this.beacon);

    this.seq = new Sequencer((who, text) => this.hud.showCaption(who, text));
    if (this.fast > 1) this.seq.speed = 4;

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.2, 0.5, 0.96);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.applyQuality();

    this.player.onStep = () => this.sound.sfxPlay(this.surfaceSound());
    this.player.onJump = () => { this.sound.sfxPlay('jump'); };
    this.player.onLand = () => { this.sound.sfxPlay('land'); this.fold.hop(); };

    this.ch1 = new ChapterOne(this);
    this.registerTravel();
    this.applyRiver();
    this.enterWorld(0, false);
    this.player.placeAt(p0, p0.dirRiver(PK.wake[0], PK.wake[1]));
    this.day.setLocal(this.player.up, 0.5);
    this.rig.faceDir(this.player.up, p0.surfacePoint(p0.dirRiver(40, -10)).sub(this.player.pos));
    this.showTitle();

    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.composer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    });
    (window as any).__game = this;
    (window as any).THREE = THREE;
  }

  // ------------------------------------------------------------------ setup
  /** Falling streams: each world's river leaves over its south pole and pours into the next world's spring. */
  buildStreams() {
    this.streams.forEach(s => { this.scene.remove(s); s.geometry.dispose(); });
    this.streams = [];
    if (!this.streamMat) {
      this.streamMat = this.planets[0].waterMat.clone();
      this.streamMat.uniforms.uSpeed.value = 2.5;
      this.streamMat.side = THREE.DoubleSide;
    }
    for (let i = 0; i < this.planets.length - 1; i++) {
      const curve = this.streamCurve(i);
      const f = flowArrivingAt(this.river, i);
      const g = new THREE.TubeGeometry(curve, 160, 0.6 + f * 1.4, 10, false);
      const m = new THREE.Mesh(g, this.streamMat);
      this.scene.add(m);
      this.streams.push(m);
    }
  }

  streamCurve(i: number): THREE.CubicBezierCurve3 {
    const a = this.planets[i], b = this.planets[i + 1];
    const endDir = a.path[a.path.length - 1];
    const p0 = a.center.clone().addScaledVector(endDir, a.waterLevelRadius() + 0.3);
    const startDir = b.path[0];
    const p3 = b.center.clone().addScaledVector(startDir, b.waterLevelRadius() + 0.3);
    const tangentOut = a.path[a.path.length - 1].clone().sub(a.path[a.path.length - 4]).normalize();
    const p1 = p0.clone().addScaledVector(endDir, 50).addScaledVector(tangentOut, 40);
    const p2 = p3.clone().addScaledVector(startDir, 120);
    return new THREE.CubicBezierCurve3(p0, p1, p2, p3);
  }

  /** Where warm air rises near each world's north pole, and the curve the kite rides back up. */
  updraftDir(i: number) { return this.planets[i].dirRiver(9, 9); }
  updraftCurve(from: number): THREE.CubicBezierCurve3 {
    const a = this.planets[from], b = this.planets[from - 1];
    const da = this.updraftDir(from), db = b.dirRiver(158, 12);
    const p0 = a.surfacePoint(da, 1.5);
    const p3 = b.surfacePoint(db, 1.2);
    return new THREE.CubicBezierCurve3(p0, p0.clone().addScaledVector(da, 160), p3.clone().addScaledVector(db, 110), p3);
  }

  /** Docks in every world, and columns of warm rising air in every world below the first. */
  buildTravelProps() {
    for (let i = 1; i < this.planets.length; i++) {
      const p = this.planets[i];
      const off = (p.cfg.riverWidth + 1.4) / (p.R * Math.PI / 180);
      const d = p.dirRiver(18, off);
      const dock = Q.dock();
      p.surfacePoint(d, -0.15, dock.position);
      orientTo(dock, d, p.surfacePoint(p.dirRiver(18, 0)).sub(dock.position));
      this.scene.add(dock);
      this.contents[i].refs.dock = dock;
      const ud = this.updraftDir(i);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 46, 18, 1, true), this.updraftMat);
      p.surfacePoint(ud, 23, col.position);
      orientTo(col, ud);
      this.scene.add(col);
      this.updrafts.push(col);
    }
  }

  registerTravel() {
    const at = (o: THREE.Object3D) => o.position.clone();
    this.contents.forEach((c, i) => {
      if (i === 0 || i >= this.planets.length - 1 || !c.refs.edge) return;
      c.interactables.push({
        id: 'edge' + i, world: i, pos: at(c.refs.edge), radius: 10,
        label: () => `Ride the falling stream down to ${WORLDS[i + 1].name}`,
        act: () => this.startRide(i, i + 1),
      });
    });
    for (let i = 1; i < this.planets.length; i++) {
      const c = this.contents[i], p = this.planets[i];
      c.interactables.push({
        id: 'dock' + i, world: i, pos: at(c.refs.dock), radius: 4,
        label: () => 'Unfold Fold into a raft',
        act: () => this.boardRaft(),
      });
      c.interactables.push({
        id: 'updraft' + i, world: i, pos: p.surfacePoint(this.updraftDir(i), 1), radius: 6,
        label: () => this.flags.has('power:kite') ? `Fold into a kite and ride the warm air up to ${WORLDS[i - 1].name}` : `Warm air rises here, up toward ${WORLDS[i - 1].name}. <i>If only you could fly.</i>`,
        act: () => { if (this.flags.has('power:kite')) this.startUpdraft(i); },
      });
    }
    const sea = this.contents[5], sp = this.planets[5];
    sea.interactables.push({
      id: 'lighthouse', world: 5, pos: sp.surfacePoint(sp.dirRiver(172, 3)), radius: 10,
      label: () => 'Knock on the lighthouse door',
      act: () => this.cut([
        { line: { text: 'The door is warm, as if someone just left it. A kettle ticks on the stove.' } },
        { line: { text: 'This is the light you saw from the top of the world.' } },
        { line: { text: 'The rest of the way home is still being written. Thank you for walking this far.' } },
      ], () => { this.give('loop-complete'); this.river.loopComplete = true; this.save(); }),
    });
  }

  // ------------------------------------------------------------------ state
  questCtx(): QuestCtx {
    return { flags: this.flags, projected: projectedSnowpack(this.snow), echoes: [0, 1, 2, 3, 4].filter(i => this.flags.has('echo:' + i)).length };
  }

  give(item: string) {
    const had = this.flags.has(item);
    this.flags.add(item);
    if (had) return;
    if (item.startsWith('map:')) {
      const pc = PIECES.find(p => p.id === item);
      if (pc) { this.hud.notify(`A piece of the map: <i>${esc(pc.label)}</i>. <b>M</b>`); this.sound.sfxPlay('paper'); }
    } else if (item === 'power:skyreading') {
      this.hud.notify('You learned <b>Skyreading</b>. Press <b>Q</b> to see the wind.');
      this.sound.sfxPlay('power'); this.fold.hop();
    } else if (item === 'power:kite') {
      this.player.canGlide = true;
      this.hud.notify('Fold can be a kite now. <b>Hold Space</b> while falling to glide. Warm updrafts carry you back up to earlier worlds.');
      this.sound.sfxPlay('power'); this.fold.hop();
    } else if (item.startsWith('journal:')) {
      const e = JOURNAL[item.slice(8)];
      if (e && !this.journal.includes(e.id)) { this.journal.push(e.id); this.hud.notify(`In your journal: <i>${esc(e.title)}</i>. <b>J</b>`); this.sound.sfxPlay('gift'); }
    } else if (item === 'item:bottle') {
      this.hud.notify('Nima gave you an empty bottle.'); this.sound.sfxPlay('soft');
    } else if (item === 'boat-ready') {
      this.fold.hop(); this.sound.sfxPlay('chime');
    }
  }

  /** Snowline (height 0..1 above which snow lies) for a snowpack value. */
  snowline(sp: number) { return 0.86 - sp * 0.3; }
  applySnow() {
    const sp = this.snow.snowpack;
    this.planets[0].setSnow(this.snowline(sp) - this.winter * 0.5, sp, this.winter);
  }

  applyRiver() {
    this.river.flow = springFlowFrom(this.snow.snowpack);
    this.planets.forEach((p, i) => p.setFlow(riverWidthFor(flowArrivingAt(this.river, i)), riverHealth(this.river, i)));
    this.applySnow();
    if (this.streamMat) this.streamMat.uniforms.uHealth.value = riverHealth(this.river, 1);
    this.buildStreams();
    this.player.dropGlow = riverHealth(this.river, this.cur);
    this.sound.health = riverHealth(this.river, this.cur);
    const healed = this.flags.has('peaks-healed');
    this.grass.lush = healed ? 1 : 0.62;
    this.grass.bloom = healed ? 1 : 0.35;
  }

  applyQuality() {
    const pr = this.quality.preset;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, pr.pixelRatio));
    this.composer.setPixelRatio(Math.min(devicePixelRatio, pr.pixelRatio));
    this.composer.setSize(innerWidth, innerHeight);
    this.grass?.setQuality(pr.grass);
    this.bloom.enabled = pr.bloom;
    this.sunLight.castShadow = pr.shadows;
    if (this.sunLight.shadow.mapSize.x !== pr.shadowSize) {
      this.sunLight.shadow.mapSize.set(pr.shadowSize, pr.shadowSize);
      this.sunLight.shadow.map?.dispose(); this.sunLight.shadow.map = null;
    }
  }

  save() {
    const d = this.player.up;
    const data: SaveData = {
      v: 2, flags: [...this.flags], moods: this.moods, river: this.river, snow: this.snow, world: this.cur,
      dir: [d.x, d.y, d.z], poles: [...this.polesRead], journal: this.journal, pins: this.map.pins,
      day: this.day.t, flowers: this.flowers, sigs: this.sigs,
    };
    writeSave(data);
  }

  load(d: SaveData) {
    this.flags = new Set(d.flags); this.moods = d.moods; this.river = d.river; this.snow = d.snow;
    this.polesRead = new Set(d.poles); this.journal = d.journal; this.map.pins = d.pins ?? {};
    this.flowers = d.flowers; this.sigs = d.sigs; this.day.t = d.day;
    this.player.hasDrop = true;
    this.player.canGlide = this.flags.has('power:kite');
    this.ch1.restore();
    this.applyRiver();
    this.enterWorld(d.world, false);
    this.player.placeAt(this.planets[d.world], new THREE.Vector3(...d.dir).normalize());
    this.rig.snap();
  }

  // ------------------------------------------------------------------ title & scenes
  showTitle() {
    const saved = loadSave();
    const has = !!saved.data;
    const el = document.createElement('div');
    el.className = 'title';
    el.innerHTML = `<h1 class="hand">Downriver</h1><div class="tag">a long way from home, and a river that knows the way back</div>
      ${saved.notice ? `<div class="notice">${esc(saved.notice)}</div>` : ''}
      <div>${has ? '<button data-a="continue">Continue</button>' : ''}<button data-a="new">${has ? 'Begin again' : 'Begin'}</button></div>
      <div class="foot">Chapter One &middot; best with headphones &middot; press H for controls</div>`;
    document.getElementById('ui')!.append(el);
    this.titleEl = el;
    el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      this.sound.start();
      el.classList.add('out');
      setTimeout(() => el.remove(), 900);
      this.titleEl = null;
      if ((b as HTMLElement).dataset.a === 'continue' && saved.data) {
        this.load(saved.data);
        this.mode = 'play';
        this.hud.showBanner(WORLDS[this.cur].name, CHAPTERS[this.cur].n + '. ' + CHAPTERS[this.cur].title);
      } else {
        clearSave();
        this.cut(Opening.wakeBeats(this), () => { this.mode = 'play'; });
      }
    }));
  }

  /** Play a scripted scene. The traveler can't move; Space skips spoken lines. */
  cut(beats: Beat[], done?: () => void) {
    this.mode = 'cut';
    this.input.unlock();
    this.hud.setPrompt(null);
    this.seq.run(beats, () => { this.cutCam = null; this.rig.override = null; if (this.mode === 'cut') this.mode = 'play'; done?.(); });
  }

  // ------------------------------------------------------------------ worlds
  enterWorld(i: number, banner = true) {
    this.cur = i;
    const w = WORLDS[i].palette;
    this.sky.setPalette(w.skyTop, w.skyHorizon);
    this.sound.voice = WORLDS[i].music;
    this.sound.health = riverHealth(this.river, i);
    this.player.dropGlow = riverHealth(this.river, i);
    const style: Record<string, [string, number, number]> = {
      peaks: ['#fff6e0', 0.1, 0.45], pines: ['#ffb070', 0.14, 0.7], deep: ['#d8ffd8', 0.1, 0.6],
      desert: ['#f4d8b0', 0.08, 0.5], aquila: ['#ffe0f0', 0.14, 0.6], sea: ['#ffffff', 0.08, 0.4],
    };
    const st = style[WORLDS[i].id];
    this.motes.setStyle(st[0], st[1], st[2]);
    const first = !this.flags.has('visited:' + i);
    this.flags.add('visited:' + i);
    if (banner) {
      if (first) this.hud.showChapter(CHAPTERS[i].n, CHAPTERS[i].title, i > 0 ? 'a sketch of what is still to come' : '', 5);
      else this.hud.showBanner(WORLDS[i].name, CHAPTERS[i].n + '. ' + CHAPTERS[i].title);
    }
  }

  get planet() { return this.planets[this.cur]; }

  visited(): Set<number> {
    const s = new Set<number>();
    this.planets.forEach((_, i) => { if (this.flags.has('visited:' + i)) s.add(i); });
    return s;
  }

  surfaceSound(): 'step' | 'stepSnow' | 'stepGrass' | 'stepWood' | 'stepStone' {
    const p = this.planet, d = this.player.up;
    if (this.cur !== 0) return WORLDS[this.cur].id === 'desert' ? 'stepSnow' : 'step';
    const h = p.height(d) / p.cfg.amplitude;
    if (this.winter > 0.5 || h > this.snowline(this.snow.snowpack) + 0.02) return 'stepSnow';
    if ((this.contents[0].refs.bridge as THREE.Object3D).position.distanceTo(this.player.pos) < 5.5) return 'stepWood';
    const pd = p.pathDist(d);
    if (pd.dist < pd.width * 0.8) return 'stepStone';
    return 'stepGrass';
  }

  // ------------------------------------------------------------------ rides
  startRide(from: number, to: number) {
    this.mode = 'ride';
    this.input.unlock();
    this.departure = false;
    this.ride = {
      to, curve: this.streamCurve(from), s: 0, dur: 9, kite: false,
      arrive: () => {
        const pl = this.planets[to];
        this.player.placeAt(pl, pl.pathPoint(0.03));
        this.boardRaft(0.03);
      },
    };
    this.sound.sfxPlay('whoosh');
    this.fold.hop();
  }

  startUpdraft(from: number) {
    const to = from - 1;
    this.mode = 'ride';
    this.input.unlock();
    this.fold.kiteMode = true;
    this.ride = {
      to, curve: this.updraftCurve(from), s: 0, dur: 13, kite: true,
      arrive: () => {
        const pl = this.planets[to];
        this.player.placeAt(pl, pl.dirRiver(158, 12));
        this.fold.kiteMode = false;
        this.mode = 'play';
        this.hud.notify('The warm air sets you down gently. Everything you did here is just as you left it.');
      },
    };
    this.sound.sfxPlay('whoosh');
  }

  updateRide(dt: number) {
    dt *= this.fast > 1 ? 3 : 1;
    const r = this.ride!;
    r.s = Math.min(1, r.s + dt / r.dur);
    const e = r.s * r.s * (3 - 2 * r.s) * 0.4 + r.s * 0.6;
    const p = r.curve.getPoint(e);
    const tan = r.curve.getTangent(e).normalize();
    this.player.pos.copy(p);
    const worldUp = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(tan, worldUp).normalize();
    const camUp = new THREE.Vector3().crossVectors(side, tan).normalize();
    if (camUp.dot(worldUp) < 0) camUp.negate();
    this.player.root.position.copy(p);
    orientTo(this.player.root, camUp, tan);
    this.player.animate(dt, 0, false);
    this.fold.update(dt, p, camUp, tan, !r.kite);
    if (r.kite) this.fold.updateString(this.player.person.arms[1].hand.getWorldPosition(new THREE.Vector3()));
    const camPos = p.clone().addScaledVector(tan, -9).addScaledVector(camUp, 3.2);
    this.rig.override = { pos: camPos, look: p.clone().addScaledVector(tan, 6), up: camUp };
    this.hud.setFade(smoothstep(0.92, 1, r.s) * 0.6);
    if (r.s >= 1) {
      this.rig.override = null;
      this.enterWorld(r.to);
      r.arrive();
      this.hud.setFade(0);
      this.rig.snap();
      this.ride = null;
      this.save();
    }
  }

  // ------------------------------------------------------------------ raft
  boardRaft(t?: number) {
    const p = this.planet;
    const near = p.riverNearest(this.player.up);
    this.player.raftT = t ?? near.t;
    this.player.raftSide = 0;
    this.raftYaw = 0; this.raftSpin = 0;
    this.mode = 'raft';
    this.sitting = null;
    this.player.pose = {};
    this.sound.sfxPlay('splash');
    this.fold.hop();
  }

  updateRaft(dt: number) {
    const p = this.planet;
    const pl = this.player;
    const flow = flowArrivingAt(this.river, this.cur);
    const fwd = this.input.axis(['KeyS'], ['KeyW']);
    const t0 = pl.raftT;
    const rapids = (t0 > 0.55 && t0 < 0.62) || (t0 > 0.8 && t0 < 0.86) ? 1 : 0;
    const speed = (1.5 + flow * 0.9) * (fwd > 0 ? 1.9 : fwd < 0 ? 0.35 : 1) * (1 + rapids * 0.7) * (this.fast > 1 ? 4 : 1);
    const len = Math.PI * p.R;
    pl.raftT = clamp(pl.raftT + speed * dt / len, 0, 0.995);
    pl.raftSide = clamp(pl.raftSide + this.input.axis(['KeyA'], ['KeyD']) * dt * 1.4, -0.75, 0.75);
    // Rocks spin the raft around, but never sink it.
    const rocks = (this.contents[this.cur].refs.riverRocks ?? []) as { t: number; side: number }[];
    for (const r of rocks) {
      if (Math.abs(r.t - pl.raftT) < 0.0035 && Math.abs(r.side - pl.raftSide) < 0.2 && this.raftSpin === 0) {
        this.raftSpin = (pl.raftSide >= r.side ? 1 : -1) * 5.5;
        pl.raftSide = clamp(pl.raftSide + (pl.raftSide >= r.side ? 0.22 : -0.22), -0.75, 0.75);
        this.sound.sfxPlay('bump'); this.fold.hop();
      }
    }
    this.raftYaw += this.raftSpin * dt;
    this.raftSpin *= Math.exp(-1.6 * dt);
    if (Math.abs(this.raftSpin) < 0.15) { this.raftSpin = 0; this.raftYaw = lerp(this.raftYaw, Math.round(this.raftYaw / (Math.PI * 2)) * Math.PI * 2, 1 - Math.exp(-2 * dt)); }
    const d = p.pathPoint(pl.raftT);
    const d2 = p.pathPoint(Math.min(1, pl.raftT + 0.004));
    const tan = d2.clone().sub(d).normalize();
    const side = new THREE.Vector3().crossVectors(d, tan).normalize();
    const w = p.cfg.riverWidth * p.flowWidth;
    const dir = d.clone().addScaledVector(side, -pl.raftSide * w / p.R).normalize();
    const bob = Math.sin(this.time * 2.4) * (0.05 + rapids * 0.12);
    pl.pos.copy(dir).multiplyScalar(p.waterLevelRadius() + 0.22 + bob).add(p.center);
    pl.up.copy(dir);
    pl.facing.copy(tan).applyAxisAngle(dir, this.raftYaw);
    pl.vel.copy(tan).multiplyScalar(speed);
    pl.grounded = true;
    pl.pose = { sit: 1 };
    pl.animate(dt, 0, false);
    pl.sync();
    this.fold.update(dt, pl.pos, pl.up, pl.facing, true);
    this.hud.setPrompt('<b>W</b> faster &nbsp; <b>S</b> slower &nbsp; <b>A D</b> steer &nbsp; <b>E</b> step ashore');
    if (this.input.hit('Space') || this.input.hit('KeyE')) {
      const bankDir = d.clone().addScaledVector(side, -(pl.raftSide >= 0 ? 1 : -1) * (w + 3.5) / p.R).normalize();
      pl.placeAt(p, bankDir); pl.facing.copy(tan);
      pl.pose = {};
      this.mode = 'play';
      this.departure = false;
      this.sound.sfxPlay('land');
      return;
    }
    if (pl.raftT >= 0.99) {
      if (this.cur === 0 && !this.flags.has('chapter1-complete')) {
        pl.raftT = 0.97;
        if (!this.edgeWarned) { this.edgeWarned = true; this.hud.notify(NOT_YET.edgeEarly); }
      } else if (this.cur < this.planets.length - 1) { pl.pose = {}; this.startRide(this.cur, this.cur + 1); }
    }
    if (this.cur === 5 && pl.raftT > 0.95) pl.raftT = 0.95;
  }

  // ------------------------------------------------------------------ conversation
  /** Every flag a script can react to. A person repeats their short "after" lines only if none of these changed. */
  scriptFlags(s: Script): string[] {
    const out = new Set<string>();
    const walk = (nodes: Node[]) => nodes.forEach(n => {
      if (n.type === 'branch') { out.add(n.ifFlag); walk(n.then); if (n.else) walk(n.else); }
      else if (n.type === 'gate') walk(n.pass);
      else if (n.type === 'give') n.items.forEach(i => out.add(i));
      else if (n.type === 'ask') n.cards.forEach(c => { c.requires?.forEach(f => out.add(f)); c.hiddenIf?.forEach(f => out.add(f)); c.gives?.forEach(f => out.add(f)); });
    });
    walk(s.nodes);
    return [...out].sort();
  }
  sigFor(id: string) { return this.scriptFlags(SCRIPTS[id]).filter(f => this.flags.has(f)).join(','); }

  startTalk(npc: Npc) {
    const base = SCRIPTS[npc.id];
    let script: Script = base;
    const closed = this.flags.has('closed:' + npc.id);
    if (this.flags.has('talked:' + npc.id) && !closed && this.sigs[npc.id] === this.sigFor(npc.id)) {
      script = { ...base, nodes: (base.after ?? ['...']).map(t => ({ type: 'say' as const, text: t })) };
    }
    const mood = this.moods[npc.id] ?? { ...base.start };
    if (closed) { this.flags.delete('closed:' + npc.id); mood.trust = Math.min(1, mood.trust + 0.12); }
    if (this.flowers > 0 && !this.flags.has('flower:' + npc.id)) {
      this.flowers--; this.flags.add('flower:' + npc.id);
      mood.trust = Math.min(1, mood.trust + 0.08); mood.worry = Math.max(0, mood.worry - 0.05);
      npc.smileT = 3;
      this.hud.notify(`You give ${base.name} a mountain flower.`);
      this.sound.sfxPlay('gift');
    }
    this.conv = new Conversation(script, mood, { flags: this.flags, give: i => this.give(i) });
    this.convNpc = npc;
    npc.talking = true;
    this.mode = 'talk';
    this.sitting = null; this.player.pose = {};
    this.input.unlock();
    this.hud.openDialogue(base.name, base.title);
    this.shownChars = 0; this.lineHold = 0; this.silenceGrace = 0; this.lastBlip = 0;
    this.hud.setPrompt(null);
  }

  endTalk() {
    const npc = this.convNpc!, conv = this.conv!;
    this.moods[npc.id] = { ...conv.mood };
    this.flags.add('talked:' + npc.id);
    this.sigs[npc.id] = this.sigFor(npc.id);
    npc.talking = false;
    this.hud.closeDialogue();
    this.rig.override = null;
    this.mode = 'play';
    const hint = SCRIPTS[npc.id].hint;
    if (this.flags.has('closed:' + npc.id) && hint) setTimeout(() => this.hud.notify(`<i>${esc(hint)}</i>`), 2500);
    this.ch1.afterTalk(npc.id);
    this.conv = null; this.convNpc = null;
    this.save();
  }

  updateTalk(dt: number) {
    dt *= this.fast;
    const conv = this.conv!, npc = this.convNpc!;
    const holding = this.input.key('Space') || this.input.mouseHeld;
    npc.mood = conv.mood;
    const mid = this.player.pos.clone().lerp(npc.root.position, 0.5);
    const up = this.player.up;
    const across = npc.root.position.clone().sub(this.player.pos).projectOnPlane(up).normalize();
    const side = new THREE.Vector3().crossVectors(up, across).normalize();
    this.rig.override = { pos: mid.clone().addScaledVector(side, 6.2).addScaledVector(up, 2.2).addScaledVector(across, -1.6), look: mid.clone().addScaledVector(up, 1.2), up };
    this.player.facing.copy(across);
    this.player.lookAt = npc.root.position.clone().addScaledVector(up, 1.3);
    this.player.pose = { listen: holding ? 1 : 0 };
    this.player.animate(dt / this.fast, 0, false);
    this.player.sync();
    const step = conv.step();
    if (step.kind === 'line') {
      if (holding) this.shownChars = Math.min(step.text.length, this.shownChars + dt * 34);
      else if (this.shownChars > 0 && this.shownChars < step.text.length) conv.interrupt();
      const blip = Math.floor(this.shownChars / 3);
      if (blip > this.lastBlip && this.shownChars < step.text.length) { this.sound.voiceBlip(npc.voice); }
      this.lastBlip = blip;
      this.hud.setLine(step.text, Math.floor(this.shownChars), holding);
      if (this.shownChars >= step.text.length) {
        this.lineHold += dt;
        if (this.lineHold > 0.9) { conv.finishLine(); this.shownChars = 0; this.lineHold = 0; this.silenceGrace = 0; this.lastBlip = 0; }
      }
    } else if (step.kind === 'silence') {
      this.silenceGrace += dt;
      this.hud.setLine('', 0, holding, true);
      if (this.silenceGrace > 0.6 || holding) {
        if (conv.holdSilence(dt, holding || this.silenceGrace < 0.6)) this.silenceGrace = 0;
      }
    } else if (step.kind === 'cards') {
      if (!this.hud.dlg.querySelector('.card')) this.hud.setCards(step.cards, i => { conv.choose(i); this.hud.setCards(null); this.sound.sfxPlay('soft'); });
      for (let i = 0; i < step.cards.length; i++) if (this.input.hit('Digit' + (i + 1))) { conv.choose(i); this.hud.setCards(null); this.sound.sfxPlay('soft'); }
    } else {
      this.player.lookAt = null; this.player.pose = {};
      this.endTalk();
    }
  }

  // ------------------------------------------------------------------ overlays
  toggleOverlay(kind: 'map' | 'journal') {
    if (this.overlay === kind) { this.closeOverlay(); return; }
    this.closeOverlay();
    this.overlay = kind; this.mode = 'overlay';
    this.input.unlock();
    if (kind === 'map') {
      const ll = latLonOf(this.player.up);
      this.map.draw(this.planet, this.flags, { lat: ll.lat, lonOff: wrapDeg(ll.lon - this.planet.lonAtLat(ll.lat)) });
      this.map.show(true); this.sound.sfxPlay('paper');
    } else {
      this.renderJournal(); this.journalEl.classList.remove('hidden'); this.sound.sfxPlay('paper');
    }
  }
  closeOverlay() {
    if (!this.overlay) return;
    this.map.show(false); this.journalEl.classList.add('hidden');
    this.overlay = null;
    if (this.mode === 'overlay') this.mode = 'play';
  }
  /** Open the journal during a scene (no mode change). */
  showJournal(on: boolean) {
    if (on) { this.renderJournal(); this.journalEl.classList.remove('hidden'); this.sound.sfxPlay('paper'); }
    else this.journalEl.classList.add('hidden');
  }
  renderJournal() {
    const c = this.questCtx();
    const step = currentStep(c);
    const side = activeSideQuests(c);
    const main = `<div class="quest"><div class="qk">The way home</div><div class="qm">${esc(MAIN_QUEST)}</div>${step ? `<div class="qs">${esc(step.text)}</div>` : ''}</div>`;
    const sideHtml = side.length ? `<div class="sub">Along the way:</div><ul>${side.map(q => `<li><b>${esc(q.title)}.</b> ${esc(q.text)}</li>`).join('')}</ul>` : '';
    const entries = this.journal.map(id => JOURNAL[id]).filter(Boolean);
    this.journalEl.innerHTML = `<div class="sheet journal"><h2>Journal</h2>${main}${sideHtml}${entries.length ? '' : '<p class="dim">Things I learn will be drawn here.</p>'}<div class="entries"></div><p class="dim">J to close</p></div>`;
    const box = this.journalEl.querySelector('.entries')!;
    for (const e of entries) {
      const row = document.createElement('div'); row.className = 'entry';
      const cv = document.createElement('canvas'); cv.width = 120; cv.height = 90;
      const ctx = cv.getContext('2d')!; ctx.fillStyle = '#efe2c0'; ctx.fillRect(0, 0, 120, 90); e.sketch(ctx);
      const tx = document.createElement('div'); tx.innerHTML = `<h3>${esc(e.title)}</h3><p>${esc(e.text)}</p>`;
      row.append(cv, tx); box.append(row);
    }
  }

  // ------------------------------------------------------------------ sitting, sky view, fast travel
  sit(bench: THREE.Object3D) {
    this.sitting = bench;
    const up = bench.position.clone().sub(this.planet.center).normalize();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(bench.quaternion).projectOnPlane(up).normalize();
    this.player.pos.copy(bench.position).addScaledVector(up, 0.02).addScaledVector(fwd, 0.08);
    this.player.up.copy(up); this.player.facing.copy(fwd); this.player.vel.set(0, 0, 0);
    this.player.pose = { sit: 1 };
    this.player.sync();
    this.hud.notify('You sit for a while. The day goes by a little faster. <i>Move to stand up.</i>');
  }

  npcsNear(pos: THREE.Vector3, r: number) { return this.contents[this.cur].npcs.some(n => n.root.position.distanceTo(pos) < r); }

  openSky() {
    this.mode = 'sky';
    this.input.unlock();
    this.input.allowLock = false;
    this.skyView.enter(this.rigPose());
    this.sound.sfxPlay('whoosh');
  }

  rigPose(): CamPose { return { pos: this.camera.position.clone(), look: this.rig.look.clone(), up: this.camera.up.clone() }; }

  startTravel(to: number) {
    this.travel = { to, t: 0, done: false };
    this.sound.sfxPlay('whoosh');
  }

  updateSky(dt: number) {
    const inp = this.input;
    if (this.travel) {
      const tr = this.travel;
      tr.t += dt;
      this.hud.setFade(tr.t < 0.5 ? smoothstep(0, 0.5, tr.t) : 1 - smoothstep(0.6, 1.3, tr.t), '#fff8ee');
      if (tr.t >= 0.5 && !tr.done) {
        tr.done = true;
        const pl = this.planets[tr.to];
        this.enterWorld(tr.to);
        const dir = tr.to === 0 ? pl.dirRiver(PK.benches[3][0] + 1.5, PK.benches[3][1] + 2) : pl.dirRiver(20, 6);
        this.player.placeAt(pl, dir);
        this.rig.snap();
        this.rig.update(0.016, this.player.pos, this.player.up, pl, 0, 0, 0);
        this.skyView.k = 0; this.skyView.dir = 0;
        this.rig.override = null;
        this.save();
      }
      if (tr.t >= 1.3) { this.travel = null; this.hud.setFade(0); this.mode = 'play'; this.input.allowLock = true; }
      return;
    }
    if (inp.hit('Tab') || inp.wheel < 0 || inp.hit('Escape')) { this.skyView.exit(); this.sound.sfxPlay('soft'); }
    const canTravel = this.flags.has('power:kite');
    for (const c of inp.clicks) {
      const i = this.skyView.pick(c, this.camera);
      if (i === null) continue;
      if (!this.flags.has('visited:' + i)) this.hud.notify('You have not been there yet. Follow the river.');
      else if (i === this.cur) this.skyView.exit();
      else if (!canTravel) this.hud.notify('You would need a kite to fly there. <i>Tor might know about kites.</i>');
      else this.startTravel(i);
    }
  }

  // ------------------------------------------------------------------ main loop
  interactPrompt(): { label: string; act: () => void; hold?: number; key: string } | null {
    const pl = this.player;
    if (this.cur === 0 && !this.flags.has('read-letter')) return { label: 'Read the letter in your satchel', act: () => this.openLetter(), key: 'letter' };
    let best: { label: string; act: () => void; hold?: number; key: string; d: number } | null = null;
    for (const n of this.contents[this.cur].npcs) {
      const d = n.root.position.distanceTo(pl.pos);
      if (d < 3.6 && (!best || d < best.d)) best = { label: `Talk to ${SCRIPTS[n.id].name}`, act: () => this.startTalk(n), d, key: 'npc:' + n.id };
    }
    // People and things compete by distance; a person counts as a little closer, so talking wins ties.
    if (best) best.d -= 0.8;
    for (const it of this.contents[this.cur].interactables as Interactable[]) {
      const d = it.pos.distanceTo(pl.pos);
      if (d < it.radius && (!best || d < best.d)) { const l = it.label(); if (l) best = { label: l, act: it.act, hold: it.hold, d, key: it.id }; }
    }
    if (!best && (this.cur > 0 || this.flags.has('peaks-healed'))) {
      const near = this.planet.riverNearest(pl.up);
      if (near.dist < this.planet.cfg.riverWidth * this.planet.flowWidth + 2.2 && near.t < 0.985) best = { label: 'Unfold Fold into a raft', act: () => this.boardRaft(), d: 99, key: 'raft' };
    }
    return best;
  }

  openLetter() {
    this.mode = 'letter';
    this.player.satchelGlow = 0;
    this.player.pose = { listen: 1 };
    this.hud.showLetter(Opening.LETTER_TEXT);
    this.sound.sfxPlay('paper');
  }

  frame() {
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    this.time += dt;
    this.fps = lerp(this.fps, 1 / Math.max(1e-3, dt), 0.05);
    PAINT.uTime.value = this.time;
    const inp = this.input;
    if (inp.hit('KeyH') && this.mode !== 'title') this.hud.toggleHelp();
    if (inp.hit('KeyN')) this.sound.setMuted(!this.sound.muted);
    if (inp.hit('KeyP') && this.mode !== 'title') { const l = this.quality.cycle(); this.applyQuality(); this.hud.notify(`Picture quality: <b>${l}</b>`); }
    if (inp.hit('KeyG') && this.mode !== 'title') { this.hud.goalHidden = !this.hud.goalHidden; }

    switch (this.mode) {
      case 'title': this.rig.override = Opening.titleCamera(this, this.time); break;
      case 'cut': {
        this.seq.update(dt, inp.hit('Space') || inp.hit('Enter') || inp.hit('KeyE'));
        this.player.animate(dt, 0, false); this.player.sync();
        break;
      }
      case 'letter':
        this.player.animate(dt, 0, false); this.player.sync();
        if (inp.hit('KeyE') || inp.hit('Space') || inp.hit('Escape')) {
          this.hud.showLetter(null);
          this.player.pose = {};
          this.give('read-letter');
          this.sound.sfxPlay('paper');
          this.cut(Opening.lookDownBeats(this), () => { this.hud.notify(OPENING.walkHint); this.save(); });
        }
        break;
      case 'play': this.updatePlay(dt); break;
      case 'raft': this.updateRaft(dt); break;
      case 'talk': this.updateTalk(dt); break;
      case 'ride': this.updateRide(dt); break;
      case 'sky': this.updateSky(dt); break;
      case 'overlay':
        if (inp.hit('Escape') || (this.overlay === 'map' && inp.hit('KeyM')) || (this.overlay === 'journal' && inp.hit('KeyJ'))) this.closeOverlay();
        else if (this.overlay === 'map' && inp.hit('KeyJ')) this.toggleOverlay('journal');
        else if (this.overlay === 'journal' && inp.hit('KeyM')) this.toggleOverlay('map');
        break;
    }
    if (this.mode !== 'play' && this.mode !== 'raft') { this.hud.setPrompt(null); this.hud.setHold(null); }

    // ---- time of day, light and wind
    const p = this.planet;
    const viewUp = this.mode === 'title' ? new THREE.Vector3(0, 1, 0) : this.player.up;
    this.day.update(dt * (this.sitting ? 9 : 1), viewUp);
    this.day.apply(WORLDS[this.cur].palette, this.sunLight, this.moonLight, this.scene.fog as THREE.FogExp2, p.center);
    this.sunLight.position.copy(this.player.pos).addScaledVector(this.day.sun, 120);
    this.sunLight.target.position.copy(this.player.pos);
    const east = new THREE.Vector3(-this.player.up.z, 0, this.player.up.x);
    if (east.lengthSq() < 1e-4) east.set(1, 0, 0);
    east.normalize().multiplyScalar(1 + 0.35 * Math.sin(this.time * 0.37) * Math.sin(this.time * 0.11 + 1));
    PAINT.uWind.value.copy(east);
    const invQ = this.player.root.quaternion.clone().invert();
    this.player.windLocal.copy(east).applyQuaternion(invQ);

    // ---- the world moves on
    if (this.mode !== 'ride' && this.mode !== 'raft') this.fold.update(dt, this.player.pos, this.player.up, this.player.facing, false);
    if (this.mode !== 'ride') this.fold.updateString(this.player.person.arms[1].hand.getWorldPosition(new THREE.Vector3()));
    const free = this.mode === 'play' || this.mode === 'raft';
    if (this.cutCam) this.rig.override = this.cutCam;
    else if (this.mode === 'cut' || this.mode === 'letter') this.rig.override = null;
    this.rig.update(dt, this.player.pos, this.player.up, p, free ? inp.mouseDX : 0, free ? inp.mouseDY : 0, free ? inp.axis(['ArrowLeft'], ['ArrowRight']) : 0);
    if (this.mode === 'sky' || this.skyView.open) {
      const pose = this.skyView.update(dt, { pos: this.rig.pos.clone(), look: this.rig.look.clone(), up: this.rig.smoothUp.clone() }, this.player.pos, this.cur, this.visited(), this.flags.has('power:kite'), this.camera);
      if (pose) { this.camera.position.copy(pose.pos); this.camera.up.copy(pose.up); this.camera.lookAt(pose.look); }
      else if (this.mode === 'sky' && !this.travel) { this.mode = 'play'; this.input.allowLock = true; }
    }
    const fog = this.scene.fog as THREE.FogExp2;
    const far = this.mode === 'title' ? 1 : Math.max(this.fogK, smoothstep(0, 0.5, this.skyView.k));
    (this.beacon.material as THREE.SpriteMaterial).depthTest = far < 0.3;
    fog.density = lerp(FOG_BASE, 0.00006, far);

    for (const c of this.contents) c.animate.forEach(f => f(dt, this.time));
    const npcWind = east.clone();
    for (const n of this.contents[this.cur].npcs) n.update(dt, this.mode === 'cut' ? null : this.player.pos, npcWind.clone().applyQuaternion(n.root.quaternion.clone().invert()));
    for (const pl of this.planets) pl.waterMat.uniforms.uTime.value = this.time;
    if (this.streamMat) this.streamMat.uniforms.uTime.value = this.time;
    for (const pl of this.planets) if (pl.ocean) (pl.ocean.material as THREE.ShaderMaterial).uniforms.uTime.value = this.time;
    // Seen from far away (title, sky view, the home light shot) the cloud sea is always in plain daylight.
    const upForSky = far > 0.5 ? this.day.sun.clone().lerp(new THREE.Vector3(0, 1, 0), 0.25).normalize() : this.rig.override ? this.rig.override.up : this.rig.smoothUp;
    this.sky.update(upForSky, this.camera.position, this.time, this.day.sun, Math.max(this.day.day, far), this.day.dusk * (1 - far));
    this.skyread.update(dt, p, this.time);
    this.hud.sky.classList.toggle('on', this.skyread.active && this.mode === 'play');
    const onPeaks = this.cur === 0;
    this.grass.update(this.player.pos, this.camera.position, onPeaks && this.skyView.k < 0.6);
    const whistled = this.mode === 'play' && inp.hit('KeyF');
    this.life.update(dt, this.time, this.day.day, this.player.pos, whistled, onPeaks);
    if (onPeaks) this.ch1.update(dt, whistled);
    // the home light blinks, slow and steady
    const blink = 0.55 + 0.45 * Math.pow(Math.max(0, Math.sin(this.time * 1.7)), 3);
    (this.beacon.material as THREE.SpriteMaterial).opacity = blink;
    if (this.mode !== 'cut') this.beacon.scale.setScalar(this.mode === 'title' ? 0.03 : 0.018 + this.skyView.k * 0.012);
    for (const u of this.updrafts) u.visible = this.skyView.k < 0.5;
    if (this.mode !== 'ride') this.motes.update(dt, p.center, this.player.pos, onPeaks ? 0.6 : 0.8, onPeaks ? 0.6 : 0.35);
    this.blizzard.update(dt, p.center, this.player.pos, 7, onPeaks ? this.winter : 0);
    this.rain.update(dt, p.center, this.player.pos, 16, this.ch1.rainT > 0 ? 1 : 0);
    // sound
    const near = p.riverNearest(this.player.up);
    const riverNear = this.mode === 'raft' ? 1 : clamp(1 - near.dist / 30);
    const alt = clamp(p.height(this.player.up) / p.cfg.amplitude);
    this.sound.amb.day = this.day.day;
    this.sound.update(riverNear, flowArrivingAt(this.river, this.cur), onPeaks ? 0.3 + alt * 0.6 : 0.2);
    this.hud.setFrost(onPeaks && this.mode === 'play' ? clamp((1 - this.player.warmth) * 1.1) : 0);
    const showGoal = this.mode === 'play' || this.mode === 'raft' || this.mode === 'overlay';
    const step = currentStep(this.questCtx());
    this.hud.setGoal(showGoal && step && this.flags.has('read-letter') ? step.text : null);
    if (this.mode === 'play' || this.mode === 'raft') { const lv = this.quality.sample(dt); if (lv) { this.applyQuality(); this.hud.notify(`Picture quality set to <b>${lv}</b> to keep things smooth. <b>P</b> to change.`); } }
    this.hud.update(dt);
    this.composer.render();
    inp.endFrame();
  }

  updatePlay(dt: number) {
    const inp = this.input, pl = this.player, p = this.planet;
    const { f, r } = this.rig.basis(pl.up);
    const mv = f.multiplyScalar(inp.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp'])).add(r.multiplyScalar(inp.axis(['KeyA'], ['KeyD'])));
    if (mv.lengthSq() > 1) mv.normalize();
    if (this.hud.helpOpen()) mv.set(0, 0, 0);
    if (this.sitting) {
      if (mv.lengthSq() > 0.01 || inp.hit('Space') || inp.hit('KeyE')) { this.sitting = null; pl.pose = {}; }
      else { pl.animate(dt, 0, false); pl.sync(); this.hud.setPrompt(null); return; }
    }
    pl.update(dt, p, mv, inp.hit('Space'), inp.key('ShiftLeft') || inp.key('ShiftRight'), inp.key('Space'));
    this.fold.kiteMode = pl.gliding;
    if (inp.hit('KeyQ') && this.flags.has('power:skyreading')) { this.skyread.active = !this.skyread.active; this.sound.sfxPlay('soft'); }
    if (inp.hit('KeyF')) { this.sound.sfxPlay('whistle'); this.fold.hop(); pl.pose = {}; }
    if (inp.hit('KeyM')) { this.toggleOverlay('map'); return; }
    if (inp.hit('KeyJ')) { this.toggleOverlay('journal'); return; }
    if (inp.hit('Tab') || inp.wheel > 0) { this.openSky(); return; }
    this.nearest = this.interactPrompt();
    const n = this.nearest;
    if (n && n.hold) {
      if (this.holdKey !== n.key) { this.holdKey = n.key; this.holdT = 0; }
      if (inp.key('KeyE')) this.holdT += dt * (this.fast > 1 ? 3 : 1); else this.holdT = Math.max(0, this.holdT - dt * 2);
      this.hud.setPrompt(`<b>Hold E</b>${n.label}`);
      this.hud.setHold(this.holdT > 0 ? Math.min(1, this.holdT / n.hold) : null, '');
      if (this.holdT >= n.hold) { this.holdT = 0; this.hud.setHold(null); n.act(); }
    } else {
      this.holdT = 0; this.holdKey = ''; this.hud.setHold(null);
      this.hud.setPrompt(n ? `<b>E</b>${n.label}` : null);
      if (n && inp.hit('KeyE')) n.act();
    }
    // Walking off the end of the world: carried on by the falling stream anyway, once the river is ready.
    const near = p.riverNearest(pl.up);
    if (near.t > 0.995 && this.cur < this.planets.length - 1 && (this.cur > 0 || this.flags.has('chapter1-complete'))) this.startRide(this.cur, this.cur + 1);
  }

  run() {
    const loop = () => { this.frame(); requestAnimationFrame(loop); };
    loop();
  }
}

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { WORLDS } from './world/worlds';
import { Planet } from './world/planet';
import { Sky } from './world/sky';
import { prepare, populate, type WorldContent, type Interactable } from './world/content';
import * as Props from './world/props';
import { latLonOf, orientTo, wrapDeg } from './world/sphere';
import { clamp, lerp, smoothstep } from './world/noise';
import { Player } from './player/player';
import { Fold } from './player/fold';
import { CameraRig } from './player/camera';
import { Input } from './core/input';
import { Sound } from './core/audio';
import { Hud, esc } from './ui/hud';
import { Conversation, type Mood, type Script } from './systems/connection';
import { SCRIPTS } from './data/scripts';
import { JOURNAL } from './data/journal';
import { MapView, PIECES } from './systems/mapView';
import { createRiverState, flowArrivingAt, riverHealth, riverWidthFor, type RiverState } from './systems/riverState';
import { createSnowpack, passWinter, isHealed, springFlowFrom, projectedSnowpack, type SnowpackState } from './systems/snowpack';
import { Skyreading } from './systems/skyreading';
import { Motes } from './systems/particles';
import { loadSave, writeSave, clearSave, type SaveData } from './systems/save';
import type { Npc } from './systems/npc';

type Mode = 'title' | 'story' | 'play' | 'talk' | 'ride' | 'raft' | 'overlay' | 'rest';

const QUESTS: Record<string, string> = {
  'quest:drop': 'Follow the river up to the spring, where it begins, and take its last drop.',
  'quest:journey': 'Carry the drop downriver, world after world, all the way to the sea.',
  'quest:snowpack': 'Help the mountain hold its snow: fences on the windy ridges, or ice towers by the spring. Then rest by the fire until spring.',
  'quest:markers': "Read Tor's three snow poles.",
  'quest:route': 'Tell Bram which road up to the pasture is safe.',
  'quest:cloud': 'Catch a sleeping cloud on the tall peak east of the river, and let it go over the dry meadow by the village.',
};
const QUEST_DONE: Record<string, string> = {
  'quest:drop': 'has-drop', 'quest:snowpack': 'peaks-healed', 'quest:markers': 'journal:poles',
  'quest:route': 'flag:route-chosen', 'quest:cloud': 'journal:cloud', 'quest:journey': 'loop-complete',
};
const POLE_READINGS = [
  { now: 1.1, old: 2.6 }, { now: 0.9, old: 2.3 }, { now: 0.8, old: 2.1 },
];

interface Ride { from: number; to: number; curve: THREE.Curve<THREE.Vector3>; s: number; dur: number; finale: boolean }

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 12000);
  composer: EffectComposer;
  sunDir = new THREE.Vector3(0.5, 0.35, 0.8).normalize();
  sunLight: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: Sky;
  planets: Planet[] = [];
  contents: WorldContent[] = [];
  streams: THREE.Mesh[] = [];
  streamMat: THREE.ShaderMaterial | null = null;
  cur = 0;
  player = new Player();
  fold = new Fold();
  rig: CameraRig;
  input: Input;
  hud = new Hud();
  sound = new Sound();
  map: MapView;
  skyread: Skyreading;
  motes: Motes;
  rain: Motes;
  mode: Mode = 'title';
  flags = new Set<string>();
  moods: Record<string, Mood> = {};
  river: RiverState = createRiverState();
  snow: SnowpackState = createSnowpack();
  polesRead = new Set<number>();
  journal: string[] = [];
  time = 0;
  timer = new THREE.Timer();
  // conversation
  conv: Conversation | null = null;
  convNpc: Npc | null = null;
  shownChars = 0;
  lineHold = 0;
  silenceGrace = 0;
  // other state
  ride: Ride | null = null;
  rideCloud = Props.cloudWisp();
  storyQueue: string[] = [];
  storyDone: (() => void) | null = null;
  overlay: 'map' | 'journal' | null = null;
  journalEl: HTMLElement;
  restT = 0;
  restPhase = 0;
  rainT = 0;
  avalancheT = -1;
  titleEl: HTMLElement | null = null;
  nearest: { label: string; act: () => void } | null = null;
  fps = 60;
  /** ?fast in the URL speeds up talking and waiting, for automated playtests. */
  fast = new URLSearchParams(location.search).has('fast') ? 10 : 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.scene.fog = new THREE.FogExp2('#c9c3e6', 0.0012);
    this.sky = new Sky(this.scene, this.sunDir);
    this.sunLight = new THREE.DirectionalLight('#ffe2c4', 2.1);
    this.sunLight.position.copy(this.sunDir).multiplyScalar(2000);
    this.scene.add(this.sunLight);
    this.hemi = new THREE.HemisphereLight('#a9b4ff', '#6a5a8a', 0.95);
    this.scene.add(this.hemi);

    const riverLon = Math.atan2(this.sunDir.z, this.sunDir.x) * 180 / Math.PI;
    WORLDS.forEach((w, i) => {
      const p = new Planet(w, i, riverLon);
      prepare(p);
      p.build();
      this.scene.add(p.group);
      this.planets.push(p);
      this.contents.push(populate(p, this.scene, i));
    });
    this.buildStreams();

    this.scene.add(this.player.root, this.fold.root);
    this.rig = new CameraRig(this.camera);
    this.input = new Input(canvas);
    this.map = new MapView(this.contents.flatMap(c => c.landmarks));
    this.skyread = new Skyreading(this.scene);
    this.motes = new Motes(this.scene, 700);
    this.rain = new Motes(this.scene, 900, '#bfe3ff', 0.22);
    this.journalEl = document.createElement('div');
    this.journalEl.className = 'overlay hidden';
    document.getElementById('ui')!.append(this.journalEl);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.28, 0.6, 0.9));
    this.composer.addPass(new OutputPass());

    this.player.onStep = s => this.sound.sfxPlay(s === 'peaks' ? 'stepSnow' : 'step');
    this.player.onJump = () => { this.sound.sfxPlay('jump'); };
    this.player.onLand = () => { this.sound.sfxPlay('land'); this.fold.hop(); };

    this.registerDynamicInteractables();
    this.applyRiver();
    this.enterWorld(0, false);
    this.player.placeAt(this.planets[0], this.planets[0].dirRiver(59.5, -7.5));
    this.rig.faceDir(this.player.up, this.planets[0].surfacePoint(this.planets[0].dirRiver(50, 0)).sub(this.player.pos));
    this.showTitle();

    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.composer.setSize(innerWidth, innerHeight);
      this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    });
    (window as any).__game = this;
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

  registerDynamicInteractables() {
    const peaks = this.contents[0];
    const pk = this.planets[0];
    const refs = peaks.refs;
    const at = (o: THREE.Object3D) => o.position.clone();
    // The spring
    peaks.interactables.push({
      id: 'spring', world: 0, pos: at(refs.spring), radius: 6,
      label: () => (this.player.hasDrop ? null : 'Take the last drop of the spring'),
      act: () => {
        this.player.hasDrop = true;
        this.give('has-drop'); this.give('journal:first-drop'); this.give('quest:journey');
        this.sound.sfxPlay('power'); this.fold.hop();
        (refs.spring.userData.drop as THREE.Mesh).visible = false;
        this.hud.notify('The drop is in your lantern. <i>Downstream always leads on.</i>');
        this.save();
      },
    });
    // Fence and stupa sites
    for (const site of this.snow.sites) {
      const cairn = refs.cairns[site.id] as THREE.Object3D;
      peaks.interactables.push({
        id: site.id, world: 0, pos: at(cairn), radius: 5,
        label: () => {
          const s = this.snow.sites.find(x => x.id === site.id)!;
          if (s.built) return null;
          if (s.kind === 'fence') {
            if (!this.flags.has('flag:knows-fences')) return null;
            if (this.skyread.active) return s.windExposure > 0.5 ? 'Build a snow fence. <i>The wind drops its snow here.</i>' : 'Build a snow fence. <i>The wind barely touches this hollow.</i>';
            return this.flags.has('power:skyreading') ? 'Build a snow fence here <i>(Q to read the wind first)</i>' : 'Build a snow fence here';
          }
          if (!this.flags.has('flag:knows-stupas')) return null;
          return 'Build an ice tower to store winter water';
        },
        act: () => this.buildSite(site.id),
      });
    }
    // Snow poles
    (refs.poles as { obj: THREE.Object3D }[]).forEach((pole, i) => peaks.interactables.push({
      id: 'pole' + i, world: 0, pos: at(pole.obj), radius: 4,
      label: () => 'Read the snow pole',
      act: () => {
        const r = POLE_READINGS[i];
        this.hud.notify(`Pole ${i + 1}: snow today <b>${r.now} m</b>. Tor's oldest paint mark: <b>${r.old} m</b>.`);
        this.sound.sfxPlay('soft');
        this.polesRead.add(i);
        if (this.polesRead.size === 3) this.give('journal:poles');
        this.save();
      },
    }));
    // Campfire: rest until spring
    peaks.interactables.push({
      id: 'fire', world: 0, pos: at(refs.fire), radius: 5,
      label: () => (this.player.hasDrop ? (this.flags.has('peaks-healed') ? 'Sit by the fire a while' : 'Rest by the fire until spring') : 'Warm your hands by the fire'),
      act: () => {
        if (!this.player.hasDrop || this.flags.has('peaks-healed')) { this.player.warmth = 1; this.hud.notify('Warm again.'); return; }
        this.startRest();
      },
    });
    // The sleeping cloud
    peaks.interactables.push({
      id: 'wisp', world: 0, pos: at(refs.wisp), radius: 9,
      label: () => (this.flags.has('item:bottle') && !this.flags.has('cloud-caught') ? "Catch the cloud in Nima's bottle" : null),
      act: () => {
        this.give('cloud-caught'); this.sound.sfxPlay('chime');
        (refs.wisp as THREE.Group).scale.setScalar(0.35);
        this.hud.notify('The bottle fogs up, cold and heavy. <i>There is weather inside.</i>');
        this.save();
      },
    });
    const meadowPos = pk.surfacePoint(pk.dirRiver(69, -41));
    peaks.interactables.push({
      id: 'meadow', world: 0, pos: meadowPos, radius: 8,
      label: () => (this.flags.has('cloud-caught') && !this.flags.has('journal:cloud') ? 'Let the cloud go over the dry meadow' : null),
      act: () => {
        this.rainT = 7; this.sound.sfxPlay('splash');
        (refs.meadow as THREE.Mesh[]).forEach(g => (g.material = Props.toon('#8ad04a', '#6ab03a', 0.25)));
        this.give('journal:cloud'); this.save();
      },
    });
    // Edges: ride the falling stream on to the next world
    this.contents.forEach((c, i) => {
      if (!c.refs.edge || i >= this.planets.length - 1) return;
      c.interactables.push({
        id: 'edge' + i, world: i, pos: at(c.refs.edge), radius: 10,
        label: () => (this.player.hasDrop ? `Ride the falling stream down to ${WORLDS[i + 1].name}` : null),
        act: () => this.startRide(i, i + 1),
      });
    });
    // The lighthouse at the end of the river
    const sea = this.contents[5], sp = this.planets[5];
    sea.interactables.push({
      id: 'lighthouse', world: 5, pos: sp.surfacePoint(sp.dirRiver(172, 3)), radius: 10,
      label: () => (this.player.hasDrop ? 'Give the drop back to the sea' : null),
      act: () => this.startFinale(),
    });
  }

  // ------------------------------------------------------------------ state
  give(item: string) {
    if (this.flags.has(item) && !item.startsWith('journal:')) return;
    const had = this.flags.has(item);
    this.flags.add(item);
    if (had) return;
    if (item.startsWith('map:')) {
      const pc = PIECES.find(p => p.id === item);
      if (pc) { this.hud.notify(`A piece of the map: <i>${esc(pc.label)}</i>. <b>M</b>`); this.sound.sfxPlay('paper'); }
    } else if (item === 'power:skyreading') {
      this.hud.notify('You learned <b>Skyreading</b>. Press <b>Q</b> to see the wind.');
      this.sound.sfxPlay('power'); this.fold.hop();
    } else if (item.startsWith('journal:')) {
      const e = JOURNAL[item.slice(8)];
      if (e && !this.journal.includes(e.id)) { this.journal.push(e.id); this.hud.notify(`In your journal: <i>${esc(e.title)}</i>. <b>J</b>`); this.sound.sfxPlay('gift'); }
    } else if (item === 'item:bottle') {
      this.hud.notify('Nima gave you an empty bottle.'); this.sound.sfxPlay('soft');
    }
  }

  applyRiver() {
    this.river.flow = springFlowFrom(this.snow.snowpack);
    this.planets.forEach((p, i) => p.setFlow(riverWidthFor(flowArrivingAt(this.river, i)), riverHealth(this.river, i)));
    const sp = this.snow.snowpack;
    this.planets[0].setSnow(0.38 + sp * 0.5, sp);
    if (this.streamMat) this.streamMat.uniforms.uHealth.value = riverHealth(this.river, 1);
    this.buildStreams();
    this.player.dropGlow = riverHealth(this.river, this.cur);
    this.sound.health = riverHealth(this.river, this.cur);
  }

  save() {
    const d = this.player.up;
    const data: SaveData = {
      v: 1, flags: [...this.flags], moods: this.moods, river: this.river, snow: this.snow, world: this.cur,
      dir: [d.x, d.y, d.z], poles: [...this.polesRead], journal: this.journal, pins: this.map.pins,
    };
    writeSave(data);
  }

  load(d: SaveData) {
    this.flags = new Set(d.flags); this.moods = d.moods; this.river = d.river; this.snow = d.snow;
    this.polesRead = new Set(d.poles); this.journal = d.journal; this.map.pins = d.pins ?? {};
    this.player.hasDrop = this.flags.has('has-drop');
    if (this.player.hasDrop) (this.contents[0].refs.spring.userData.drop as THREE.Mesh).visible = false;
    for (const s of this.snow.sites) if (s.built) this.placeBuilt(s.id);
    if (this.flags.has('cloud-caught')) this.contents[0].refs.wisp.scale.setScalar(0.35);
    if (this.flags.has('journal:cloud')) (this.contents[0].refs.meadow as THREE.Mesh[]).forEach(g => (g.material = Props.toon('#8ad04a', '#6ab03a', 0.25)));
    if (this.snow.winters > 0) this.placeNewStone(this.snow.snowpack);
    this.applyRiver();
    this.enterWorld(d.world, false);
    this.player.placeAt(this.planets[d.world], new THREE.Vector3(...d.dir).normalize());
    this.rig.snap();
  }

  // ------------------------------------------------------------------ title & story
  showTitle() {
    const has = !!loadSave();
    const el = document.createElement('div');
    el.className = 'title';
    el.innerHTML = `<h1>DOWNRIVER</h1><div class="tag">one river, six small worlds, from the spring to the sea</div>
      <div>${has ? '<button data-a="continue">Continue the journey</button>' : ''}<button data-a="new">${has ? 'Begin again' : 'Begin the journey'}</button></div>
      <div class="foot">Milestone 1 &middot; best with headphones &middot; press H for controls</div>`;
    document.getElementById('ui')!.append(el);
    this.titleEl = el;
    el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      this.sound.start();
      el.remove(); this.titleEl = null;
      if ((b as HTMLElement).dataset.a === 'continue') {
        const d = loadSave(); if (d) this.load(d);
        this.mode = 'play';
        this.hud.showBanner(WORLDS[this.cur].name, WORLDS[this.cur].subtitle);
      } else {
        clearSave();
        this.give('quest:drop');
        this.playStory([
          'High above the cloud sea, a spring is fading.',
          'The elders say the sea has forgotten the mountains.',
          "Someone must carry the spring's last drop all the way down, to remind it.",
          'Nobody else would go. So you did.',
          'First, the drop. The spring is upstream, where the river begins.',
        ], () => { this.mode = 'play'; this.hud.showBanner(WORLDS[0].name, WORLDS[0].subtitle); this.fold.hop(); this.hud.notify('Press <b>H</b> any time for controls.'); });
      }
    }));
  }

  storyLight = false;
  playStory(lines: string[], done: () => void, light = false) {
    this.mode = 'story';
    this.storyQueue = [...lines];
    this.storyDone = done;
    this.storyLight = light;
    this.hud.showStory(this.storyQueue.shift()!, light);
  }

  // ------------------------------------------------------------------ worlds
  enterWorld(i: number, banner = true) {
    this.cur = i;
    const w = WORLDS[i].palette;
    (this.scene.fog as THREE.FogExp2).color.set(w.fog);
    this.sky.setPalette(w.skyTop, w.skyHorizon);
    this.sunLight.color.set(w.light);
    this.hemi.color.set(w.ambient).lerp(new THREE.Color('#ffffff'), 0.35);
    this.hemi.groundColor.set(w.ambient).multiplyScalar(0.6);
    this.sound.voice = WORLDS[i].music;
    this.sound.health = riverHealth(this.river, i);
    this.player.dropGlow = riverHealth(this.river, i);
    const style: Record<string, [string, number, number]> = {
      peaks: ['#ffffff', 0.16, 0.9], pines: ['#ffb070', 0.14, 0.7], deep: ['#d8ffd8', 0.1, 0.6],
      desert: ['#f4d8b0', 0.08, 0.5], aquila: ['#ffe0f0', 0.14, 0.6], sea: ['#ffffff', 0.08, 0.4],
    };
    const st = style[WORLDS[i].id];
    this.motes.setStyle(st[0], st[1], st[2]);
    if (banner) this.hud.showBanner(WORLDS[i].name, WORLDS[i].subtitle);
  }

  get planet() { return this.planets[this.cur]; }

  // ------------------------------------------------------------------ puzzle
  buildSite(id: string) {
    const s = this.snow.sites.find(x => x.id === id)!;
    if (s.built) return;
    s.built = true;
    this.placeBuilt(id);
    this.sound.sfxPlay('build'); this.fold.hop();
    if (s.kind === 'stupa') {
      this.give('built-stupa');
      if (!this.flags.has('flag:asked-bram')) {
        this.flags.add('stupa-without-asking');
        const m = this.moods.bram ?? { ...SCRIPTS.bram.start };
        m.trust = Math.max(0, m.trust - 0.2); this.moods.bram = m;
        this.hud.notify('The ice tower rises. Down by the village, the meadow channel runs dry.');
      } else this.hud.notify('The ice tower rises, fed from the high channel Bram offered.');
    } else {
      this.give('built-fence');
      this.hud.notify(s.windExposure > 0.5 ? 'The fence hums in the wind. Snow begins to settle behind it.' : 'The fence stands quietly. Hardly any snow drifts here.');
    }
    const proj = projectedSnowpack(this.snow);
    if (proj >= 0.7) setTimeout(() => this.hud.notify('Ysolde would say the mountain can hold its snow now. <i>Rest by the fire to let winter come.</i>'), 3600);
    this.save();
  }

  placeBuilt(id: string) {
    const c = this.contents[0];
    const spots = c.refs.siteSpots as Record<string, [number, number]>;
    const [la, lo] = spots[id];
    const p = this.planets[0];
    const obj = id.startsWith('stupa') ? Props.stupa() : Props.fence();
    const d = p.dirRiver(la, lo);
    p.surfacePoint(d, -0.2, obj.position);
    // fences face across the wind (wind blows toward +lon)
    const east = p.surfacePoint(p.dirRiver(la, lo + 3)).sub(obj.position);
    orientTo(obj, d, east);
    this.scene.add(obj);
    (c.refs.cairns[id] as THREE.Object3D).visible = false;
  }

  placeNewStone(v: number) {
    const p = this.planets[0];
    const obj = Props.stone(2.4, true);
    const lat = 4 + v * 35 + 1;
    const d = p.dirRiver(lat, 17.5);
    p.surfacePoint(d, -0.15, obj.position);
    orientTo(obj, d);
    this.scene.add(obj);
    this.contents[0].landmarks.push({ world: 'peaks', name: 'The newest stone', lat, lon: 17.5, icon: 'stone' });
  }

  startRest() {
    this.mode = 'rest';
    this.restT = 0; this.restPhase = 0;
    this.input.unlock();
  }

  updateRest(dt: number) {
    dt *= this.fast > 1 ? 3 : 1;
    this.restT += dt;
    if (this.restPhase === 0) {
      this.hud.setFade(smoothstep(0, 1.8, this.restT) * 0.92, '#eef0fa');
      if (this.restT > 2) {
        this.restPhase = 1;
        const before = this.snow.snowpack;
        passWinter(this.snow);
        const after = this.snow.snowpack;
        this.applyRiver();
        if (after > before + 0.01) this.placeNewStone(after);
        let lines: string[];
        if (isHealed(this.snow)) {
          this.give('peaks-healed');
          if (this.flags.has('built-fence')) this.give('journal:fences');
          if (this.flags.has('built-stupa')) this.give('journal:stupas');
          lines = ['Winter comes. The wind howls over the ridges, and this time the snow stays.', 'Spring comes. The spring runs strong and bright.', 'Far below, every world drinks a little deeper.'];
        } else if (after > before + 0.01) {
          lines = ['Winter comes, and the mountain holds a little more snow than last year.', 'Spring comes. The spring is stronger, but still thin.'];
        } else {
          lines = ['Winter comes. The wind strips the ridges bare again.', 'Spring comes. Nothing has changed. The spring is thin.'];
        }
        this.hud.setFade(0.92, '#eef0fa');
        this.playStory(lines, () => { this.mode = 'rest'; this.restPhase = 2; this.restT = 0; }, true);
      }
    } else if (this.restPhase === 2) {
      this.hud.setFade((1 - smoothstep(0, 1.6, this.restT)) * 0.92, '#eef0fa');
      if (this.restT > 1.7) { this.hud.setFade(0); this.mode = 'play'; this.save(); }
    }
  }

  // ------------------------------------------------------------------ rides
  startRide(from: number, to: number) {
    this.mode = 'ride';
    this.input.unlock();
    this.ride = { from, to, curve: this.streamCurve(from), s: 0, dur: 9, finale: false };
    this.sound.sfxPlay('whoosh');
    this.fold.hop();
  }

  startFinale() {
    this.mode = 'story';
    this.input.unlock();
    this.playStory([
      'You hold the lantern over the water and open it.',
      'The drop falls into the sea. For a moment nothing happens.',
      'Then the sea remembers.',
    ], () => {
      const a = this.planets[5], b = this.planets[0];
      const p0 = this.player.pos.clone();
      const up0 = this.player.up.clone();
      const p3 = b.surfacePoint(b.dirRiver(15, 2), 1);
      const p1 = p0.clone().addScaledVector(up0, 160);
      const p2 = b.center.clone().add(new THREE.Vector3(0, b.R + 260, 0)).add(new THREE.Vector3(140, 0, 0));
      this.ride = { from: 5, to: 0, curve: new THREE.CubicBezierCurve3(p0, p1, p2, p3), s: 0, dur: 16, finale: true };
      this.mode = 'ride';
      this.sound.sfxPlay('whoosh');
      void a;
    });
  }

  updateRide(dt: number) {
    dt *= this.fast > 1 ? 3 : 1;
    const r = this.ride!;
    r.s = Math.min(1, r.s + dt / r.dur);
    const e = r.finale ? smoothstep(0, 1, r.s) : r.s * r.s * (3 - 2 * r.s) * 0.4 + r.s * 0.6;
    const p = r.curve.getPoint(e);
    const tan = r.curve.getTangent(e).normalize();
    this.player.pos.copy(p);
    const worldUp = new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(tan, worldUp).normalize();
    const camUp = new THREE.Vector3().crossVectors(side, tan).normalize();
    if (camUp.dot(worldUp) < 0) camUp.negate();
    this.player.root.position.copy(p);
    orientTo(this.player.root, camUp, tan);
    this.fold.update(dt, p, camUp, tan, true);
    const camPos = p.clone().addScaledVector(tan, -9).addScaledVector(camUp, 3.2);
    this.rig.override = { pos: camPos, look: p.clone().addScaledVector(tan, 6), up: camUp };
    this.hud.setFade(r.finale ? smoothstep(0.85, 1, r.s) * 0.9 : smoothstep(0.92, 1, r.s) * 0.6);
    if (r.finale) {
      this.player.hasDrop = false;
      if (!this.rideCloud.parent) this.scene.add(this.rideCloud);
      this.rideCloud.position.copy(p).addScaledVector(camUp, -1.2);
      this.rideCloud.scale.setScalar(0.6 + smoothstep(0, 0.15, r.s) * 0.5);
      this.motes.update(dt, p.clone().addScaledVector(camUp, -40), p, 2, 1);
    }
    if (r.s >= 1) {
      this.rig.override = null;
      this.enterWorld(r.to, !r.finale);
      const pl = this.planets[r.to];
      if (r.finale) {
        this.player.placeAt(pl, pl.dirRiver(16, 4));
        this.player.hasDrop = true;
        this.give('loop-complete');
        this.river.loopComplete = true;
        this.hud.setFade(0);
        this.mode = 'play';
        this.playStory([
          'You come down as rain, high above the Spring Peaks.',
          'The spring takes the water gladly. It runs a little stronger.',
          'The river was a circle all along.',
          'Every world stays open to you now. Thank you for playing the first milestone of Downriver.',
        ], () => { this.mode = 'play'; this.hud.showBanner('The journey continues', 'every world can be visited again'); });
        this.save();
      } else {
        this.player.placeAt(pl, pl.pathPoint(0.03));
        this.boardRaft(0.03);
        this.hud.setFade(0);
        this.save();
      }
      this.rig.snap();
      this.ride = null;
      this.scene.remove(this.rideCloud);
    }
  }

  // ------------------------------------------------------------------ raft
  boardRaft(t?: number) {
    const p = this.planet;
    const near = p.riverNearest(this.player.up);
    this.player.raftT = t ?? near.t;
    this.player.raftSide = 0;
    this.mode = 'raft';
    this.sound.sfxPlay('splash');
    this.fold.hop();
  }

  updateRaft(dt: number) {
    const p = this.planet;
    const pl = this.player;
    const flow = flowArrivingAt(this.river, this.cur);
    const fwd = this.input.axis(['KeyS'], ['KeyW']);
    const speed = (6 + flow * 7) * (fwd > 0 ? 1.7 : fwd < 0 ? 0.3 : 1);
    const len = Math.PI * p.R;
    pl.raftT = clamp(pl.raftT + speed * dt / len, 0, 0.995);
    pl.raftSide = clamp(pl.raftSide + this.input.axis(['KeyA'], ['KeyD']) * dt * 1.6, -0.75, 0.75);
    const d = p.pathPoint(pl.raftT);
    const d2 = p.pathPoint(Math.min(1, pl.raftT + 0.004));
    const tan = d2.clone().sub(d).normalize();
    const side = new THREE.Vector3().crossVectors(d, tan).normalize();
    const w = p.cfg.riverWidth * p.flowWidth;
    const dir = d.clone().addScaledVector(side, -pl.raftSide * w / p.R).normalize();
    const bob = Math.sin(this.time * 2.4) * 0.05;
    pl.pos.copy(dir).multiplyScalar(p.waterLevelRadius() + 0.22 + bob).add(p.center);
    pl.up.copy(dir);
    pl.facing.copy(tan);
    pl.vel.copy(tan).multiplyScalar(speed);
    pl.grounded = true;
    pl.animate(dt, 0, false);
    pl.sync();
    this.fold.update(dt, pl.pos, pl.up, tan, true);
    // Step off with E or Space onto the nearest bank.
    if (this.input.hit('Space') || this.input.hit('KeyE')) {
      const bankDir = d.clone().addScaledVector(side, -(pl.raftSide >= 0 ? 1 : -1) * (w + 3.5) / p.R).normalize();
      pl.placeAt(p, bankDir); pl.facing.copy(tan);
      this.mode = 'play';
      this.sound.sfxPlay('land');
      return;
    }
    if (pl.raftT >= 0.99) {
      if (this.cur < this.planets.length - 1 && pl.hasDrop) this.startRide(this.cur, this.cur + 1);
      else if (this.cur === this.planets.length - 1) { /* the river ends at the lighthouse */ }
    }
    if (this.cur === 5 && pl.raftT > 0.95) pl.raftT = 0.95;
  }

  // ------------------------------------------------------------------ conversation
  startTalk(npc: Npc) {
    const base = SCRIPTS[npc.id];
    const done = this.flags.has('talked:' + npc.id) && !this.flags.has('closed:' + npc.id);
    const healedNew = npc.id === 'ysolde' && this.flags.has('peaks-healed') && !this.flags.has('journal:stone-returns');
    let script: Script = base;
    if (done && !healedNew && !(npc.id === 'bram' && (this.flags.has('stupa-without-asking') && !this.flags.has('flag:bram-forgiven') || (this.flags.has('power:skyreading') && !this.flags.has('flag:route-chosen'))))) {
      script = { ...base, nodes: (base.after ?? ['...']).map(t => ({ type: 'say' as const, text: t })) };
    }
    if (this.flags.has('closed:' + npc.id)) {
      this.flags.delete('closed:' + npc.id);
      const m = this.moods[npc.id]; if (m) m.trust = Math.min(1, m.trust + 0.12);
    }
    const mood = this.moods[npc.id] ?? { ...base.start };
    this.conv = new Conversation(script, mood, { flags: this.flags, give: i => this.give(i) });
    this.convNpc = npc;
    npc.talking = true;
    this.mode = 'talk';
    this.input.unlock();
    this.hud.openDialogue(base.name, base.title);
    this.shownChars = 0; this.lineHold = 0; this.silenceGrace = 0;
    this.hud.setPrompt(null);
  }

  endTalk() {
    const npc = this.convNpc!, conv = this.conv!;
    this.moods[npc.id] = { ...conv.mood };
    this.flags.add('talked:' + npc.id);
    npc.talking = false;
    this.hud.closeDialogue();
    this.rig.override = null;
    this.mode = 'play';
    const hint = SCRIPTS[npc.id].hint;
    if (this.flags.has('closed:' + npc.id) && hint) setTimeout(() => this.hud.notify(`<i>${esc(hint)}</i>`), 2500);
    if (this.flags.has('flag:route-east') && !this.flags.has('avalanche')) { this.flags.add('avalanche'); this.avalancheT = 0; }
    this.conv = null; this.convNpc = null;
    this.save();
  }

  updateTalk(dt: number) {
    dt *= this.fast;
    const conv = this.conv!, npc = this.convNpc!;
    const holding = this.input.key('Space') || this.input.mouseHeld;
    npc.mood = conv.mood;
    // Frame the two of them from the side.
    const mid = this.player.pos.clone().lerp(npc.root.position, 0.5);
    const up = this.player.up;
    const across = npc.root.position.clone().sub(this.player.pos).projectOnPlane(up).normalize();
    const side = new THREE.Vector3().crossVectors(up, across).normalize();
    this.rig.override = { pos: mid.clone().addScaledVector(side, 7).addScaledVector(up, 2.6).addScaledVector(across, -1.5), look: mid.clone().addScaledVector(up, 1.3), up };
    this.player.facing.copy(across); this.player.sync();
    const step = conv.step();
    if (step.kind === 'line') {
      if (holding) this.shownChars = Math.min(step.text.length, this.shownChars + dt * 34);
      else if (this.shownChars > 0 && this.shownChars < step.text.length) conv.interrupt();
      this.hud.setLine(step.text, Math.floor(this.shownChars), holding);
      if (this.shownChars >= step.text.length) {
        this.lineHold += dt;
        if (this.lineHold > 0.9) { conv.finishLine(); this.shownChars = 0; this.lineHold = 0; this.silenceGrace = 0; }
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
    this.overlay = null; this.mode = 'play';
  }
  renderJournal() {
    const active = Object.keys(QUESTS).filter(q => this.flags.has(q) && !this.flags.has(QUEST_DONE[q]));
    const quests = active.length ? `<div class="sub">On my mind:</div><ul>${active.map(q => `<li>${esc(QUESTS[q])}${q === 'quest:markers' ? ` (${this.polesRead.size} of 3)` : ''}</li>`).join('')}</ul>` : '';
    const entries = this.journal.map(id => JOURNAL[id]).filter(Boolean);
    this.journalEl.innerHTML = `<div class="sheet journal"><h2>Journal</h2>${quests}${entries.length ? '' : '<p class="dim">Nothing yet. Things I learn will be drawn here.</p>'}<div class="entries"></div><p class="dim">J to close</p></div>`;
    const box = this.journalEl.querySelector('.entries')!;
    for (const e of entries) {
      const row = document.createElement('div'); row.className = 'entry';
      const cv = document.createElement('canvas'); cv.width = 120; cv.height = 90;
      const ctx = cv.getContext('2d')!; ctx.fillStyle = '#efe2c0'; ctx.fillRect(0, 0, 120, 90); e.sketch(ctx);
      const tx = document.createElement('div'); tx.innerHTML = `<h3>${esc(e.title)}</h3><p>${esc(e.text)}</p>`;
      row.append(cv, tx); box.append(row);
    }
  }

  // ------------------------------------------------------------------ main loop
  interactPrompt(): { label: string; act: () => void } | null {
    const pl = this.player;
    let best: { label: string; act: () => void; d: number } | null = null;
    for (const n of this.contents[this.cur].npcs) {
      const d = n.root.position.distanceTo(pl.pos);
      if (d < 3.6 && (!best || d < best.d)) best = { label: `Talk to ${SCRIPTS[n.id].name}`, act: () => this.startTalk(n), d };
    }
    if (!best) for (const it of this.contents[this.cur].interactables as Interactable[]) {
      const d = it.pos.distanceTo(pl.pos);
      if (d < it.radius && (!best || d < best.d)) { const l = it.label(); if (l) best = { label: l, act: it.act, d }; }
    }
    if (!best && this.player.hasDrop) {
      const near = this.planet.riverNearest(pl.up);
      if (near.dist < this.planet.cfg.riverWidth * this.planet.flowWidth + 2.2 && near.t < 0.985) best = { label: 'Unfold Fold into a raft', act: () => this.boardRaft(), d: 99 };
    }
    return best;
  }

  frame() {
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    this.time += dt;
    this.fps = lerp(this.fps, 1 / Math.max(1e-3, dt), 0.05);
    const inp = this.input;
    if (inp.hit('KeyH') && this.mode !== 'title') this.hud.toggleHelp();
    if (inp.hit('KeyN')) this.sound.setMuted(!this.sound.muted);

    switch (this.mode) {
      case 'title': {
        // A slow orbit around the first world, with the others hanging below.
        const p = this.planets[0];
        const a = this.time * 0.05;
        const pos = p.center.clone().add(new THREE.Vector3(Math.cos(a) * 190, 60, Math.sin(a) * 190));
        this.rig.override = { pos, look: p.center.clone().add(new THREE.Vector3(0, -110, 0)), up: new THREE.Vector3(0, 1, 0) };
        break;
      }
      case 'story':
        if (inp.hit('Space') || inp.hit('Enter') || inp.hit('KeyE') || inp.mouseHeld) {
          inp.mouseHeld = false;
          const next = this.storyQueue.shift();
          if (next) this.hud.showStory(next, this.storyLight);
          else { this.hud.hideStory(); this.mode = 'play'; const d = this.storyDone; this.storyDone = null; this.rig.override = null; d?.(); }
        }
        break;
      case 'play': this.updatePlay(dt); break;
      case 'raft': this.updateRaft(dt); break;
      case 'talk': this.updateTalk(dt); break;
      case 'ride': this.updateRide(dt); break;
      case 'rest': this.updateRest(dt); break;
      case 'overlay':
        if (inp.hit('Escape') || (this.overlay === 'map' && inp.hit('KeyM')) || (this.overlay === 'journal' && inp.hit('KeyJ'))) this.closeOverlay();
        else if (this.overlay === 'map' && inp.hit('KeyJ')) this.toggleOverlay('journal');
        else if (this.overlay === 'journal' && inp.hit('KeyM')) this.toggleOverlay('map');
        break;
    }
    if (this.mode !== 'play') this.hud.setPrompt(null);

    // world-wide updates
    const p = this.planet;
    if (this.mode !== 'ride') this.fold.update(dt, this.player.pos, this.player.up, this.player.facing, this.mode === 'raft');
    if (this.mode !== 'title' && this.mode !== 'ride' && this.mode !== 'talk') {
      this.rig.update(dt, this.player.pos, this.player.up, p, inp.mouseDX, inp.mouseDY, inp.axis(['ArrowLeft'], ['ArrowRight']));
    } else {
      this.rig.update(dt, this.player.pos, this.player.up, p, 0, 0, 0);
    }
    for (const c of this.contents) c.animate.forEach(f => f(dt, this.time));
    for (const n of this.contents[this.cur].npcs) n.update(dt, this.player.pos);
    for (const pl of this.planets) pl.waterMat.uniforms.uTime.value = this.time;
    if (this.streamMat) this.streamMat.uniforms.uTime.value = this.time;
    for (const pl of this.planets) if (pl.ocean) (pl.ocean.material as THREE.ShaderMaterial).uniforms.uTime.value = this.time;
    const upForSky = this.rig.override ? this.rig.override.up : this.rig.smoothUp;
    this.sky.update(this.mode === 'title' ? new THREE.Vector3(0, 1, 0) : upForSky, this.camera.position, this.time);
    this.skyread.update(dt, p, this.time);
    this.hud.sky.classList.toggle('on', this.skyread.active && this.mode === 'play');
    if (this.mode !== 'ride') this.motes.update(dt, p.center, this.player.pos, this.cur === 0 ? 2.2 : 0.8, this.cur === 0 ? 1 : 0.35);
    if (this.rainT > 0) { this.rainT -= dt; this.rain.update(dt, p.center, this.player.pos, 16, 1); } else this.rain.update(dt, p.center, this.player.pos, 16, 0);
    this.updateAvalanche(dt);
    this.updateCairns();
    // sound
    const near = p.riverNearest(this.player.up);
    const riverNear = this.mode === 'raft' ? 1 : clamp(1 - near.dist / 30);
    const alt = clamp(p.height(this.player.up) / p.cfg.amplitude);
    this.sound.update(riverNear, flowArrivingAt(this.river, this.cur), this.cur === 0 ? 0.4 + alt * 0.6 : 0.2);
    this.hud.setFrost(this.cur === 0 && this.player.hasDrop ? clamp((1 - this.player.warmth) * 1.1) : 0);
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
    pl.update(dt, p, mv, inp.hit('Space'), inp.key('ShiftLeft') || inp.key('ShiftRight'));
    if (inp.hit('KeyQ') && this.flags.has('power:skyreading')) { this.skyread.active = !this.skyread.active; this.sound.sfxPlay('soft'); }
    if (inp.hit('KeyM')) { this.toggleOverlay('map'); return; }
    if (inp.hit('KeyJ')) { this.toggleOverlay('journal'); return; }
    this.nearest = this.interactPrompt();
    this.hud.setPrompt(this.nearest ? `<b>E</b>${this.nearest.label}` : null);
    if (this.nearest && inp.hit('KeyE')) this.nearest.act();
    // Walking off the end of the world: you are carried on by the falling stream anyway.
    const near = p.riverNearest(pl.up);
    if (near.t > 0.995 && pl.hasDrop && this.cur < this.planets.length - 1) this.startRide(this.cur, this.cur + 1);
  }

  updateCairns() {
    if (this.cur !== 0) return;
    const c = this.contents[0];
    for (const s of this.snow.sites) {
      const ring = (c.refs.cairns[s.id] as THREE.Object3D).userData.ring as THREE.Mesh;
      const m = ring.material as THREE.MeshBasicMaterial;
      let target = 0;
      if (!s.built && s.kind === 'fence' && this.flags.has('flag:knows-fences')) target = this.skyread.active ? (s.windExposure > 0.5 ? 0.9 : 0.15) : 0.25;
      if (!s.built && s.kind === 'stupa' && this.flags.has('flag:knows-stupas')) target = 0.4;
      m.opacity = lerp(m.opacity, target, 0.08);
      ring.scale.setScalar(1 + Math.sin(this.time * 2 + s.windExposure * 5) * 0.06);
    }
    const cor = c.refs.cornice as THREE.Mesh;
    (cor.material as THREE.MeshToonMaterial).emissive?.set(this.skyread.active && !this.flags.has('avalanche') ? '#ff9a7a' : '#000000');
  }

  updateAvalanche(dt: number) {
    if (this.avalancheT < 0) return;
    this.avalancheT += dt;
    const cor = this.contents[0].refs.cornice as THREE.Mesh;
    if (this.avalancheT < 0.05) { this.hud.notify('Far up the east road, the heavy slope lets go with a long, low roar.'); this.sound.sfxPlay('whoosh'); }
    const p = this.planets[0];
    const k = smoothstep(0, 5, this.avalancheT);
    const d = p.dirRiver(lerp(42, 50, k), lerp(-92, -88, k));
    p.surfacePoint(d, 0.2 - k * 1.5, cor.position);
    cor.scale.set(1.4 + k, 0.5 - k * 0.3, 0.8 + k * 1.5);
    if (this.avalancheT > 6) this.avalancheT = -1;
  }

  run() {
    const loop = () => { this.frame(); requestAnimationFrame(loop); };
    loop();
  }
}

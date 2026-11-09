import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FinishPass } from './render/finish';
import { WORLDS } from './world/worlds';

/** The forest, where the fox waits. */
const FOX_WORLD = WORLDS.findIndex(w => w.id === 'pines');
import { Planet } from './world/planet';
import { Sky } from './world/sky';
import { prepare, populate, FOX_SPOT, HOME_LIGHT, type WorldContent, type Interactable } from './world/content';
import * as Q from './world/props2';
import { talkSpot, overShoulder, segmentClear, chooseShot } from './systems/stage';
import { resolveSolids } from './world/collide';
import { fireView } from './world/fire';
import { PK, peaksFlowers } from './world/peaks';
import { latLonOf, orientTo, wrapDeg } from './world/sphere';
import { clamp, lerp, smoothstep } from './world/noise';
import { fallGeometry } from './world/water';
import { Player } from './player/player';
import { Fold } from './player/fold';
import { CameraRig } from './player/camera';
import { Input } from './core/input';
import { Sound } from './core/audio';
import { Hud, esc } from './ui/hud';
import { Conversation, type Mood, type Script, type Node } from './systems/connection';
import { SCRIPTS, pickReturnLine } from './data/scripts';
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
import { currentStep, activeSideQuests, stepDetail, lanternsLit, knownAs, nextPerson, type QuestCtx } from './story/quests';
import { Menu, MENU_TABS, type MenuTab, type GoalInfo } from './ui/menu';
import { AREAS, AREA_AGAIN, discoveredAreas, type Area } from './data/areas';
import { NOTE, PROMPT, NEW_GOAL, WHERE } from './data/words';
import { BackpackView, ITEMS, bagAdd, doTrade } from './systems/backpack';
import { foldMood } from './player/fold';
import { Fox } from './world/fox';
import { CHAPTERS, MAIN_QUEST, NOT_YET, OPENING } from './data/story';
import { ChapterOne } from './story/chapterOne';
import * as Opening from './story/opening';

export type Mode = 'title' | 'cut' | 'play' | 'talk' | 'ride' | 'raft' | 'overlay' | 'sky' | 'letter' | 'inside' | 'approach';

interface Ride { to: number; curve: THREE.Curve<THREE.Vector3>; s: number; dur: number; kite: boolean; arrive: () => void }

const FOG_BASE = 0.0026;

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 12000);
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  finish!: FinishPass;
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
  overlay: MenuTab | null = null;
  menu!: Menu;
  /** When the menu opened because the browser let go of the mouse (its Esc key may arrive a moment later). */
  menuByLock = -1;
  /** Set while starting over, so nothing writes the old journey back. */
  saveOff = false;
  /** An area's border on the ground, as points around its center. */
  areaOutline(a: Area): THREE.Vector3[] {
    const p = this.planet, c = p.dirRiver(a.at[0], a.at[1]);
    const t1 = new THREE.Vector3(0, 1, 0).cross(c).normalize(), out: THREE.Vector3[] = [];
    for (let i = 0; i < 36; i++) {
      const wob = 1 + Math.sin(i * 1.7 + a.r) * 0.06;
      const axis = t1.clone().applyAxisAngle(c, i / 36 * Math.PI * 2);
      out.push(p.surfacePoint(c.clone().applyAxisAngle(axis, a.r * wob / p.R)));
    }
    return out;
  }

  /** How much you are inside each area (0..1), for its light and sound. */
  areaWeights(): { a: Area; w: number }[] {
    const up = this.player.up;
    return AREAS.filter(a => a.world === this.cur).map(a => ({ a, w: smoothstep(a.r + 8, a.r - 2, up.angleTo(this.planet.dirRiver(a.at[0], a.at[1])) * this.planet.R) })).filter(x => x.w > 0);
  }

  /** The first time you come near someone, the camera looks at them for a moment. */
  meet: { npc: Npc; t: number; from: CamPose } | null = null;
  nameTags: HTMLElement;
  /** Playtests can record the route walked, to draw it on the map. */
  trailOn = false;
  trailT = 0;
  renderEvery = 1;
  /** When you were last inside each area (game seconds), to name it again after a long time away. */
  areaSeen: Record<string, number> = {};
  bleatT = 0;
  areaBanner: { a: Area; t: number } | null = null;
  frameN = 0;
  bag: string[] = [];
  sketches: { id: string; label: string; img: string }[] = [];
  sent: Record<string, string> = {};
  bagView!: BackpackView;
  fox!: Fox;
  foxWorld = FOX_WORLD;
  surveyT = 0;
  journalEl: HTMLElement;
  titleEl: HTMLElement | null = null;
  nearest: { label: string; act: () => void; hold?: number; key: string } | null = null;
  holdT = 0;
  holdKey = '';
  /** Camera pose for scripted scenes, or null to follow the traveler. */
  cutCam: CamPose | null = null;
  /** Walking Nilo up to something before using it: a seat, an easel, a thing on the ground, a person. */
  appr: { spot: THREE.Vector3; face: THREE.Vector3; t: number; phase: 'walk' | 'turn' | 'kneel'; kneel: boolean; then: () => void } | null = null;
  /** The two-shot during a talk: who the camera is on, and when the dialogue box may open. */
  talkCam: { side: number; wide: number; lift: number; onNilo: boolean; t: number; open: boolean } | null = null;
  kneelT = 0;
  sitSlide: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
  /** Inside a cottage: the little room, the fade in and out, and what Nilo noticed. */
  room: { obj: THREE.Group; t: number; phase: 'in' | 'stay' | 'out'; text: string; pose: CamPose } | null = null;
  /** 0..1: thin the fog so far worlds show (title, sky view, the home light shot). */
  fogK = 0;
  sitting: THREE.Object3D | null = null;
  departure = false;
  travel: { to: number; t: number; done: boolean } | null = null;
  raftYaw = 0;
  raftSpin = 0;
  edgeWarned = false;
  fps = 60;
  /** The goal line last shown, so a new one can be announced. */
  lastGoal: string | null = null;
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
    fireView.cam = this.camera;
    // keep the camera out of houses, trunks and rocks: it pushes in toward Nilo instead
    // (the bridge only counts when choosing a talk shot: Nilo walks on it, so it must not shove the follow camera)
    this.rig.block = (look, pos) => !this.planet.solids.length ? 1 : this.talkCam || this.meet ? segmentClear(this.planet.solids, look, pos, this.planet.center) : segmentClear(this.planet.solids.filter(s => !s.camOnly), look, pos, this.planet.center);
    this.input = new Input(canvas);
    this.map = new MapView(this.contents.flatMap(c => c.landmarks));
    this.skyread = new Skyreading(this.scene);
    this.motes = new Motes(this.scene, 500);
    this.rain = new Motes(this.scene, 900, '#bfe3ff', 0.22);
    this.blizzard = new Motes(this.scene, 1400, '#ffffff', 0.24);
    this.bagView = new BackpackView();
    this.journalEl = document.createElement('div');
    this.journalEl.className = 'overlay hidden';
    document.getElementById('ui')!.append(this.journalEl);
    this.menu = new Menu(document.getElementById('ui')!);
    this.nameTags = document.createElement('div'); this.nameTags.className = 'nametags';
    document.getElementById('ui')!.prepend(this.nameTags);
    this.menu.onGo = i => this.goBack(i);
    this.menu.onTab = t => { if (this.mode === 'play' || this.mode === 'overlay') this.openTab(t); };
    this.menu.onClose = () => this.closeOverlay();
    this.menu.onQuality = () => { const l = this.quality.cycle(); this.applyQuality(); this.hud.notify(NOTE.quality(l)); this.menu.showSettings(this.settingsInfo()); };
    this.menu.onVolume = v => { this.sound.setVolume(v); this.menu.setMuted(this.sound.muted); };
    this.menu.onMute = () => { this.sound.setMuted(!this.sound.muted); this.menu.setMuted(this.sound.muted); };
    this.menu.onReset = () => { clearSave(); this.saveOff = true; location.reload(); };
    // Clicking the dim space around any sheet closes the menu.
    for (const el of [this.map.el, this.bagView.el, this.journalEl]) el.addEventListener('click', e => { if (e.target === el) this.closeOverlay(); });
    this.skyView = new SkyView(this.scene, this.planets, this.hud.labels);

    // The home light: the lighthouse on the dunes where the river ends, blinking far below the clouds.
    const home = this.planets[this.planets.length - 1];
    home.surfacePoint(home.dirRiver(HOME_LIGHT.lat, HOME_LIGHT.lon), 16.5, this.beaconPos);
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

    const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(innerWidth, innerHeight) });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.2, 0.5, 0.96);
    this.composer.addPass(this.bloom);
    this.finish = new FinishPass(this.camera);
    this.composer.addPass(this.finish);
    this.composer.addPass(new OutputPass());
    this.applyQuality();

    this.player.onStep = () => this.sound.sfxPlay(this.surfaceSound());
    this.player.onJump = () => { this.sound.sfxPlay('jump'); };
    this.player.onRoll = () => { this.sound.sfxPlay('soft'); };
    this.player.onLand = () => { this.sound.sfxPlay('land'); this.fold.hop(); };

    this.ch1 = new ChapterOne(this);
    const game = this;
    // The fox waits in the Ember Pines (the forest) until you are worth walking with.
    this.fox = new Fox();
    this.scene.add(this.fox.f.root);
    const forest = this.planets[FOX_WORLD];
    this.fox.place(forest, forest.dirRiver(FOX_SPOT.lat, FOX_SPOT.lon));
    this.contents[FOX_WORLD].interactables.push({
      id: 'fox', world: FOX_WORLD, get pos() { return game.fox.f.root.position; }, radius: 3.5, hold: 3,
      label: () => (game.flags.has('fox-joined') ? null : 'Kneel, and hold out your hand to the fox'),
      act: () => {
        game.give('fox-joined'); game.sound.sfxPlay('chime');
        game.hud.notify('The fox sniffs your fingers for a long time. Then she trots past you, stops, and looks back. <i>She is coming.</i>');
        game.save();
      },
    } as any);
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
    this.streams.forEach(s => { this.scene.remove(s); s.geometry.dispose(); s.children.forEach(c => (c as THREE.Mesh).geometry?.dispose()); });
    this.streams = [];
    if (!this.streamMat) {
      this.streamMat = this.planets[0].waterMat.clone();
      this.streamMat.uniforms.uSpeed.value = 2.5;
      this.streamMat.side = THREE.DoubleSide;
    }
    for (let i = 0; i < this.planets.length - 1; i++) {
      const curve = this.streamCurve(i);
      const f = flowArrivingAt(this.river, i);
      // the sheet leaves the lip exactly as wide as the river there, and in the river's own across direction
      const a = this.planets[i], P = a.path, end = P[P.length - 1];
      const side = new THREE.Vector3().crossVectors(end, end.clone().sub(P[P.length - 3]).normalize()).normalize();
      const g = fallGeometry(curve, side, a.cfg.riverWidth * a.flowWidth, 0.6 + f * 1.4);
      const m = new THREE.Mesh(g, this.streamMat);
      // where it leaves, the water pours into a soft bank of cloud and spray, so the lip reads as a fall
      const out = curve.getTangentAt(0.02), lip = curve.getPointAt(0.03);
      const mistMat = new THREE.MeshToonMaterial({ color: '#f6f2f4', transparent: true, opacity: 0.88 });
      for (let k = 0; k < 9; k++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(1.6 + (k % 3) * 0.9, 12, 9), mistMat);
        const sx = new THREE.Vector3().crossVectors(out, end).normalize();
        b.position.copy(lip).addScaledVector(sx, (k - 4) * 1.5 + Math.sin(k * 2.1) * 0.6).addScaledVector(out, 1.5 + (k % 2) * 2).addScaledVector(end, -1.2 + (k % 3) * 0.5);
        b.scale.y = 0.6; m.add(b);
      }
      this.scene.add(m);
      this.streams.push(m);
    }
  }

  streamCurve(i: number): THREE.CubicBezierCurve3 {
    const a = this.planets[i], b = this.planets[i + 1];
    const endDir = a.path[a.path.length - 1];
    const p0 = a.center.clone().addScaledVector(endDir, a.waterLevelRadius() + 0.02);
    const startDir = b.path[0];
    const p3 = b.center.clone().addScaledVector(startDir, b.waterLevelRadius() + 0.3);
    const tangentOut = a.path[a.path.length - 1].clone().sub(a.path[a.path.length - 4]).normalize();
    // the water runs on off the lip first, then bends away in one long arc: a ribbon in the sky, not a spout
    const p1 = p0.clone().addScaledVector(endDir, 14).addScaledVector(tangentOut, 70);
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
    // The last world: the river rests in the sand, and the lighthouse stands beside it.
    const L = this.planets.length - 1, last = this.contents[L], lp = this.planets[L];
    last.interactables.push({
      id: 'lighthouse', world: L, pos: lp.surfacePoint(lp.dirRiver(HOME_LIGHT.lat, HOME_LIGHT.lon)), radius: 10,
      label: () => 'Knock on the lighthouse door',
      act: () => this.cut([
        { line: { text: 'The door is warm, as if someone just left it. Sand has blown in under it. A kettle ticks.' } },
        { line: { text: 'This is the light you saw from the top of the world.' } },
        { line: { text: 'The rest of the way home is still being written. Thank you for walking this far.' } },
      ], () => { this.give('loop-complete'); this.river.loopComplete = true; this.save(); }),
    });
  }

  // ------------------------------------------------------------------ state
  questCtx(): QuestCtx {
    return { flags: this.flags, projected: projectedSnowpack(this.snow), echoes: [0, 1, 2, 3, 4].filter(i => this.flags.has('echo:' + i)).length, fences: this.snow.sites.filter(s => s.kind === 'fence' && s.built && s.windExposure > 0.5).length };
  }

  give(item: string) {
    const had = this.flags.has(item);
    this.flags.add(item);
    if (had) return;
    if (ITEMS[item]) {
      if (bagAdd(this.bag, item)) this.hud.notify(`Into your backpack: <b>${esc(ITEMS[item].name)}</b>. <i>B to look.</i>`);
      else this.hud.notify('Your backpack is full. <i>Swap something away first.</i>');
      this.sound.sfxPlay('paper');
      return;
    }
    if (item.startsWith('map:')) {
      const pc = PIECES.find(p => p.id === item);
      if (pc && this.cur !== 0) { this.hud.notify(`A piece of the map: <i>${esc(pc.label)}</i>. <b>M</b>`); this.sound.sfxPlay('paper'); }
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
    if (this.saveOff) return;
    const d = this.player.up;
    const data: SaveData = {
      v: 4, flags: [...this.flags], moods: this.moods, river: this.river, snow: this.snow, world: this.cur,
      dir: [d.x, d.y, d.z], poles: [...this.polesRead], journal: this.journal, pins: this.map.pins,
      day: this.day.t, flowers: this.flowers, sigs: this.sigs,
      bag: this.bag, sketches: this.sketches, sent: this.sent, seen: this.map.exportSeen(),
    };
    writeSave(data);
  }

  load(d: SaveData) {
    this.flags = new Set(d.flags); this.moods = d.moods; this.river = d.river; this.snow = d.snow;
    this.polesRead = new Set(d.poles); this.journal = d.journal; this.map.pins = d.pins ?? {};
    this.flowers = d.flowers; this.sigs = d.sigs; this.day.t = d.day;
    this.bag = d.bag ?? []; this.sketches = d.sketches ?? []; this.sent = d.sent ?? {}; this.map.importSeen(d.seen ?? {});
    this.player.hasDrop = true;
    this.player.canGlide = this.flags.has('power:kite');
    this.ch1.restore();
    this.applyRiver();
    // A world index the layout no longer has falls back to the start; a redrawn world starts at its arrival point.
    const w = d.world >= 0 && d.world < this.planets.length ? d.world : 0;
    this.enterWorld(w, false);
    const dir = w !== d.world || d.arrive ? this.arrivalDir(w) : new THREE.Vector3(...d.dir).normalize();
    this.player.placeAt(this.planets[w], dir);
    this.rig.snap();
  }

  // ------------------------------------------------------------------ title & scenes
  showTitle() {
    const saved = loadSave();
    const has = !!saved.data;
    const el = document.createElement('div');
    el.className = 'title';
    el.innerHTML = `<h1 class="hand">The Light<br>Below the Clouds</h1><div class="tag">a long way from home, and a river that knows the way back</div>
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
        // leave the title camera behind and start right behind Nilo
        this.cutCam = null; this.rig.override = null; this.rig.faceDir(this.player.up, this.player.facing); this.rig.snap();
        this.mode = 'play';
        this.hud.showBanner(WORLDS[this.cur].name, CHAPTERS[this.cur].n + '. ' + CHAPTERS[this.cur].title);
      } else {
        clearSave();
        // once he is on his feet, the letter in his satchel opens by itself
        this.cut(Opening.wakeBeats(this), () => { this.mode = 'play'; setTimeout(() => { if (this.mode === 'play' && !this.flags.has('read-letter')) this.openLetter(); }, 700); });
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
      peaks: ['#fff6e0', 0.1, 0.45], pines: ['#ffb070', 0.14, 0.7],
      sea: ['#ffffff', 0.08, 0.4], desert: ['#f4d8b0', 0.08, 0.5],
    };
    const st = style[WORLDS[i].id] ?? style.peaks;
    this.motes.setStyle(st[0], st[1], st[2]);
    const first = !this.flags.has('visited:' + i);
    this.flags.add('visited:' + i);
    if (banner) {
      if (first) this.hud.showChapter(CHAPTERS[i].n, CHAPTERS[i].title, i > 0 ? 'a sketch of what is still to come' : '', 5);
      else this.hud.showBanner(WORLDS[i].name, CHAPTERS[i].n + '. ' + CHAPTERS[i].title);
    }
  }

  get planet() { return this.planets[this.cur]; }

  /** Worlds whose story is written. The rest are a quiet bank to rest on, with the way home. */
  worldReady(i: number) { return i === 0; }

  /** A safe place to arrive in each world: on the bank beside the dock, out of the water. */
  arrivalDir(i: number) {
    const p = this.planets[i];
    if (i === 0) return p.dirRiver(PK.benches[3][0] + 1.5, PK.benches[3][1] + 2);
    const off = (p.cfg.riverWidth + 3.2) / (p.R * Math.PI / 180);
    return p.dirRiver(20, off);
  }

  /** Compile every material in view-independent order so a new world's first frame doesn't stall. */
  warmUp() { try { this.renderer.compile(this.scene, this.camera); } catch { /* ignore */ } }

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
        // set down on the bank by the dock, never adrift: the river only carries you on when you choose it
        const pl = this.planets[to];
        this.player.placeAt(pl, this.arrivalDir(to));
        this.player.facing.copy(pl.surfacePoint(pl.pathPoint(0.08)).sub(this.player.pos).projectOnPlane(this.player.up).normalize());
        this.rig.faceDir(this.player.up, this.player.facing); this.rig.snap();
        this.mode = 'play';
        if (!this.flags.has('told-goback:' + from)) { this.flags.add('told-goback:' + from); this.hud.notify(NOTE.goBack(WORLDS[from].name)); }
        if (!this.worldReady(to)) this.hud.notify(NOTE.unbuilt(WORLDS[to].name));
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
    this.hud.setFade(smoothstep(0.86, 0.97, r.s), '#fff8ee');
    if (r.s >= 1) {
      this.rig.override = null;
      this.hud.setFade(1, '#fff8ee', true);
      this.enterWorld(r.to);
      r.arrive();
      this.warmUp();
      this.hud.setFade(0, '#fff8ee');
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
      } else if (this.cur < this.planets.length - 1) {
        pl.raftT = 0.99;
        this.hud.setPrompt(`<b>R</b> ride the falling stream down to ${WORLDS[this.cur + 1].name} &nbsp; <b>E</b> step ashore`);
        if (this.input.hit('KeyR')) { pl.pose = {}; this.startRide(this.cur, this.cur + 1); }
      }
    }
    if (this.cur === this.planets.length - 1 && pl.raftT > 0.95) pl.raftT = 0.95;
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

  /** Press E on a person: Nilo walks to a spot in front of them, both turn to face each other, then the talk begins. */
  startTalk(npc: Npc) {
    npc.talking = true;
    const up = npc.up.clone();
    const free = (p: THREE.Vector3) => {
      const q = p.clone();
      if (this.cur === 0 && resolveSolids(this.planet.solids, q, this.planet.center, 0.45)) return false;
      if (this.contents[this.cur].npcs.some(o => o !== npc && o.root.position.distanceTo(p) < 1.0)) return false;
      const n = p.clone().sub(this.planet.center).normalize();
      return Math.abs(this.planet.surfaceRadius(n) - npc.root.position.distanceTo(this.planet.center)) < 1.2;
    };
    const spot = talkSpot(npc.root.position, up, this.player.pos, free);
    this.beginApproach(spot, npc.root.position, () => this.openTalk(npc));
  }

  openTalk(npc: Npc) {
    const base = SCRIPTS[npc.id];
    let script: Script = base;
    const closed = this.flags.has('closed:' + npc.id);
    if (this.flags.has('talked:' + npc.id) && !closed && this.sigs[npc.id] === this.sigFor(npc.id)) {
      // nothing changed for them: one fresh line that fits where the story is, never repeated until they run out
      const line = pickReturnLine(npc.id, this.flags);
      script = { ...base, nodes: (line ? [line] : base.after ?? ['...']).map(t => ({ type: 'say' as const, text: t })) };
    }
    const mood = this.moods[npc.id] ?? { ...base.start };
    if (closed) { this.flags.delete('closed:' + npc.id); mood.trust = Math.min(1, mood.trust + 0.12); }
    this.conv = new Conversation(script, mood, { flags: this.flags, give: i => this.give(i) });
    this.convNpc = npc;
    npc.talking = true;
    this.mode = 'talk';
    this.sitting = null; this.player.pose = {};
    this.input.unlock();
    // the camera eases to over Nilo's shoulder; the dialogue box opens once it has settled
    const across = npc.root.position.clone().sub(this.player.pos).projectOnPlane(this.player.up).normalize();
    const eye = this.player.pos.clone().addScaledVector(this.player.up, 1.4);
    // pick the side and height where neither shot (on them, on Nilo) has a wall, a rock or Hollo in the way
    const npcEye = npc.root.position.clone().addScaledVector(npc.up, 1.4);
    const S = this.planet.solids, C = this.planet.center;
    // and where the camera's line of sight stays above the ground (river banks rise steeply by the bridge)
    const P = this.planet, q = new THREE.Vector3();
    const groundClear = (a: THREE.Vector3, b: THREE.Vector3) => {
      for (let i = 1; i <= 16; i++) { q.lerpVectors(a, b, i / 16); const d = q.clone().sub(C); if (d.length() < P.surfaceRadius(d.normalize()) + 0.4) return (i - 1) / 16; }
      return 1;
    };
    const pick = chooseShot(eye, npcEye, this.player.up, (a, b) => this.cur === 0 ? Math.min(segmentClear(S, a, b, C), groundClear(a, b)) : groundClear(a, b));
    this.talkCam = { side: pick.side, wide: pick.wide, lift: pick.lift, onNilo: false, t: 0, open: false };
    this.fold.root.visible = false; // Fold tucks himself away so he isn't between the two faces
    this.rig.easeFromHere(0.75);
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
    this.rig.override = null; this.talkCam = null; this.fold.root.visible = true;
    this.rig.easeFromHere(0.9);
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
    const up = this.player.up;
    const across = npc.root.position.clone().sub(this.player.pos).projectOnPlane(up).normalize();
    // over-the-shoulder two-shot: on the person while they speak, on Nilo while he chooses what to say
    const tc = this.talkCam!;
    const niloEye = this.player.person.head.getWorldPosition(new THREE.Vector3()).addScaledVector(up, 0.18);
    const npcEye = npc.person.head.getWorldPosition(new THREE.Vector3()).addScaledVector(npc.up, 0.18);
    const onNilo = conv.step().kind === 'cards';
    if (onNilo !== tc.onNilo && tc.open) { tc.onNilo = onNilo; this.rig.easeFromHere(0.8); }
    this.rig.override = tc.onNilo ? overShoulder(npcEye, niloEye, up, -tc.side, tc.wide, tc.lift) : overShoulder(niloEye, npcEye, up, tc.side, tc.wide, tc.lift);
    tc.t += dt / this.fast;
    if (!tc.open) {
      this.player.facing.lerp(across, 1 - Math.exp(-10 * dt)).normalize();
      this.player.animate(dt / this.fast, 0, false); this.player.sync();
      if (tc.t > 0.8) { tc.open = true; this.hud.openDialogue(SCRIPTS[npc.id].name, SCRIPTS[npc.id].title); }
      return;
    }
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
  /** Open a menu tab, or close the menu if that tab is already open. */
  toggleOverlay(kind: MenuTab) {
    if (this.overlay === kind) this.closeOverlay(); else this.openTab(kind);
  }
  openTab(kind: MenuTab) {
    if (this.overlay === kind) return;
    this.hideSheets();
    this.overlay = kind; this.mode = 'overlay';
    this.input.unlock();
    this.menu.select(kind);
    this.sound.sfxPlay('paper');
    switch (kind) {
      case 'bag': case 'letters': case 'sketches':
        this.bagView.tab = kind; this.renderBag(); this.bagView.show(true); break;
      case 'map': {
        const c = this.questCtx();
        const toLL = (v: THREE.Vector3) => { const l = latLonOf(v.clone().sub(this.planet.center).normalize()); return { lat: l.lat, lonOff: wrapDeg(l.lon - this.planet.lonAtLat(l.lat)) }; };
        if (this.cur === 0) {
          // world 1: only the named areas you have walked into, the people you have met, and the task pin
          const night = this.flags.has('quest:night') && !this.flags.has('peaks-healed');
          this.map.people = this.contents[0].npcs.filter(n => this.flags.has('talked:' + n.id)).map(n => ({ name: SCRIPTS[n.id].name, ...toLL(n.root.position), invited: night && this.flags.has('invited:' + n.id) }));
          this.map.areas = discoveredAreas(0, this.flags).map(a => ({ id: a.id, name: a.name, at: toLL(this.planet.surfacePoint(this.planet.dirRiver(a.at[0], a.at[1]))), outline: this.areaOutline(a).map(v => toLL(v)) }));
          const t = this.ch1.guideTarget();
          const label = this.flags.has('read-letter') ? stepDetail(c) : null;
          this.map.task = t ? { dir: t, label: (label ?? 'Next').replace(/\s*\(\d+ of \d+\)\s*$/, '') } : null;
        } else { this.map.people = []; this.map.areas = null; this.map.task = null; }
        this.map.draw(this.planet, this.flags, { dir: this.player.up.clone(), facing: this.player.facing.clone() });
        this.map.show(true); break;
      }
      case 'journal': this.renderJournal(); this.journalEl.classList.remove('hidden'); break;
      case 'goal': this.menu.showGoal(this.goalInfo()); break;
      case 'worlds': this.menu.showWorlds(this.worldList()); break;
      case 'controls': this.menu.showControls(); break;
      case 'settings': this.menu.showSettings(this.settingsInfo()); break;
    }
  }
  private hideSheets() { this.map.show(false); this.journalEl.classList.add('hidden'); this.bagView.show(false); this.menu.hidePage(); }
  closeOverlay() {
    if (!this.overlay) return;
    this.hideSheets();
    this.menu.select(null);
    this.overlay = null;
    if (this.mode === 'overlay') this.mode = 'play';
    this.sound.sfxPlay('soft');
  }
  goalInfo(): GoalInfo {
    const c = this.questCtx();
    const who = nextPerson(c);
    const raw = who ? knownAs(c, who) : '';
    return {
      quest: MAIN_QUEST,
      step: this.flags.has('read-letter') ? stepDetail(c) : null,
      lanterns: this.cur === 0 && this.flags.has('quest:hollo') && !this.flags.has('chapter1-complete') ? lanternsLit(c) : null,
      next: who ? { name: raw.charAt(0).toUpperCase() + raw.slice(1), where: WHERE[who] ?? '' } : null,
      side: activeSideQuests(c),
    };
  }
  worldList() {
    return WORLDS.map((w, i) => ({ name: w.name, n: CHAPTERS[i].n,
      state: (i === this.cur ? 'here' : this.worldDone(i) ? 'done' : this.flags.has('visited:' + i) ? 'visited' : 'ahead') as 'here' | 'done' | 'visited' | 'ahead' }));
  }
  worldDone(i: number) { return i === 0 ? this.flags.has('chapter1-complete') : false; }
  /** Fly back to a world from the menu: close it, open the sky, and travel. */
  goBack(i: number) {
    if (i === this.cur || !this.flags.has('visited:' + i)) return;
    this.closeOverlay();
    this.openSky();
    this.startTravel(i);
  }
  settingsInfo() { return { quality: this.quality.level.charAt(0).toUpperCase() + this.quality.level.slice(1), volume: this.sound.volume, muted: this.sound.muted }; }
  /** Open the journal during a scene (no mode change). */
  showJournal(on: boolean) {
    if (on) { this.renderJournal(); this.journalEl.classList.remove('hidden'); this.sound.sfxPlay('paper'); }
    else this.journalEl.classList.add('hidden');
  }
  updateFox(dt: number) {
    const fx = this.fox, joined = this.flags.has('fox-joined');
    fx.f.root.visible = joined ? this.mode !== 'raft' && this.mode !== 'ride' : this.cur === FOX_WORLD;
    if (!fx.f.root.visible) return;
    const p = this.planet;
    if (joined && this.foxWorld !== this.cur) { this.foxWorld = this.cur; fx.place(p, this.player.up.clone()); }
    if (joined) {
      const step = currentStep(this.questCtx());
      fx.update(dt, p, this.player.pos, this.player.facing, { happy: this.fold.happy > 0.05, poi: this.cur === 0 && step ? this.ch1.guideTarget() : null });
    } else {
      // waiting: she sits and watches, and flattens her ears if you run at her
      const d = fx.f.root.position.distanceTo(this.player.pos);
      const spd = this.player.vel.clone().projectOnPlane(this.player.up).length();
      fx.gesture = d < 9 && spd > 6 ? 'wary' : 'sit';
      orientTo(fx.f.root, fx.dir, this.player.pos.clone().sub(fx.f.root.position));
      fx.t += dt; (fx as any).pose(dt);
    }
  }

  /** Entering a named area for the first time shows its name. */
  updateAreas() {
    if (!this.flags.has('read-letter')) return;
    const up = this.player.up;
    for (const a of AREAS) {
      if (a.world !== this.cur) continue;
      if (up.angleTo(this.planet.dirRiver(a.at[0], a.at[1])) * this.planet.R > a.r) continue;
      const known = this.flags.has('area:' + a.id), last = this.areaSeen[a.id];
      // the map knows it at once; the name card waits its turn if something else is on screen
      if (!known || (last !== undefined && this.time - last > AREA_AGAIN)) { this.flags.add('area:' + a.id); this.areaBanner = { a, t: this.time }; }
      this.areaSeen[a.id] = this.time;
    }
    const b = this.areaBanner;
    if (b && this.time - b.t > 12) this.areaBanner = null;
    else if (b && !this.meet && !this.hud.banner.classList.contains('on') && !this.hud.chapter.classList.contains('on')) {
      this.areaBanner = null;
      this.hud.showBanner(b.a.name, b.a.sub); this.sound.sfxPlay('chime');
    }
  }

  /** The first time you come near someone on the main path, the camera turns to them for about a second. */
  updateMeet(dt: number) {
    if (this.meet) {
      const m = this.meet, up = this.player.up;
      m.t += dt;
      if (m.npc.root.position.distanceTo(this.player.pos) > 12) m.t = Math.max(m.t, 1.8);
      const head = m.npc.root.position.clone().addScaledVector(m.npc.up, 1.45);
      const across = m.npc.root.position.clone().sub(this.player.pos).projectOnPlane(up).normalize();
      const side = new THREE.Vector3().crossVectors(up, across).normalize();
      // a close, slightly low portrait of their face, from the side you are coming from
      const frame = { pos: head.clone().addScaledVector(across, -3.4).addScaledVector(side, 1.3).addScaledVector(up, 0.15), look: head.clone().addScaledVector(up, -0.15), up };
      const k = smoothstep(0, 0.45, m.t) * (1 - smoothstep(1.35, 1.8, m.t));
      this.cutCam = { pos: m.from.pos.clone().lerp(frame.pos, k), look: m.from.look.clone().lerp(frame.look, k), up };
      if (m.t > 1.8) { this.meet = null; this.cutCam = null; this.rig.override = null; }
      return;
    }
    if (this.cur !== 0 || !this.flags.has('read-letter')) return;
    for (const n of this.contents[0].npcs) {
      if (this.flags.has('met:' + n.id) || this.flags.has('talked:' + n.id)) continue;
      if (n.root.position.distanceTo(this.player.pos) > 9) continue;
      this.flags.add('met:' + n.id);
      const fwd = this.camera.getWorldDirection(new THREE.Vector3());
      // start the move from where the camera is, unless it is still far off (just after Continue): then from behind Nilo
      const pl = this.player, near = this.camera.position.distanceTo(pl.pos) < 25;
      const from = near ? { pos: this.camera.position.clone(), look: this.camera.position.clone().addScaledVector(fwd, 6), up: pl.up.clone() }
        : { pos: pl.pos.clone().addScaledVector(pl.up, 3.2).addScaledVector(pl.facing, -7), look: pl.pos.clone().addScaledVector(pl.up, 1.3), up: pl.up.clone() };
      this.meet = { npc: n, t: 0, from };
      break;
    }
  }

  /** Names over people's heads when you are close: "Tor, who builds kites", or how you'd describe them. */
  updateNameTags() {
    const show = this.mode === 'play' && this.cur === 0;
    const npcs = show ? this.contents[0].npcs.filter(n => n.root.position.distanceTo(this.player.pos) < 9) : [];
    const els = this.nameTags.children;
    while (els.length < npcs.length) this.nameTags.append(document.createElement('div'));
    const c = this.questCtx();
    for (let i = 0; i < els.length; i++) {
      const el = els[i] as HTMLElement, n = npcs[i];
      if (!n) { el.style.display = 'none'; continue; }
      const p = n.root.position.clone().addScaledVector(n.up, 2.25).project(this.camera);
      if (p.z > 1) { el.style.display = 'none'; continue; }
      const s = SCRIPTS[n.id], name = knownAs(c, n.id);
      const known = name === s.name;
      el.style.display = '';
      el.innerHTML = known ? `<b>${esc(s.name)}</b>, ${esc(s.title)}` : esc(name.charAt(0).toUpperCase() + name.slice(1));
      el.style.left = `${(p.x * 0.5 + 0.5) * 100}%`; el.style.top = `${(-p.y * 0.5 + 0.5) * 100}%`;
      el.style.opacity = String(clamp((9 - n.root.position.distanceTo(this.player.pos)) / 3));
    }
  }

  renderBag() {
    const near = this.mode === 'overlay' ? this.contents[this.cur].npcs.filter(n => n.root.position.distanceTo(this.player.pos) < 5).sort((a, b) => a.root.position.distanceTo(this.player.pos) - b.root.position.distanceTo(this.player.pos))[0] : undefined;
    this.bagView.render({
      bag: this.bag, flags: this.flags, sketches: this.sketches, sent: this.sent,
      near: near ? { id: near.id, name: SCRIPTS[near.id].name } : null,
      onTrade: t => {
        if (!doTrade(this.bag, t)) return;
        this.flags.add(t.give); this.flags.add('traded:' + t.npc);
        const n = this.contents[this.cur].npcs.find(x => x.id === t.npc); if (n) n.smileT = 3;
        const m = this.moods[t.npc] ?? { ...SCRIPTS[t.npc].start }; m.trust = Math.min(1, m.trust + 0.1); this.moods[t.npc] = m;
        this.sound.sfxPlay('gift');
        this.hud.notify(`<b>${esc(SCRIPTS[t.npc].name)}:</b> <i>${esc(t.line)}</i>`);
        this.save();
      },
      onReply: (l, r) => {
        this.sent[l] = r; this.sound.sfxPlay('paper');
        this.hud.notify('You fold your reply into a little boat and tuck it in your bag. <i>The postman will find it.</i>');
        this.save();
      },
    });
  }

  renderJournal() {
    const c = this.questCtx();
    const step = currentStep(c);
    const side = activeSideQuests(c);
    const main = `<div class="quest"><div class="qk">The way home</div><div class="qm">${esc(MAIN_QUEST)}</div>${step ? `<div class="qs">${esc(stepDetail(c) ?? step.text)}</div>` : ''}</div>`;
    const sideHtml = side.length ? `<div class="sub">Along the way:</div><ul>${side.map(q => `<li><b>${esc(q.title)}.</b> ${esc(q.text)}</li>`).join('')}</ul>` : '';
    const entries = this.journal.map(id => JOURNAL[id]).filter(Boolean);
    this.journalEl.innerHTML = `<div class="sheet journal"><h2>Journal</h2>${main}${sideHtml}${entries.length ? '' : '<p class="dim">Things I learn will be drawn here.</p>'}<div class="entries"></div></div>`;
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
    bench.updateWorldMatrix(true, false);
    const at = bench.getWorldPosition(new THREE.Vector3());
    const up = at.clone().sub(this.planet.center).normalize();
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(bench.getWorldQuaternion(new THREE.Quaternion())).projectOnPlane(up).normalize();
    // Nilo has walked up in front of the seat: he settles back onto it while he sits
    this.sitSlide = { from: this.player.pos.clone(), to: at.clone().addScaledVector(up, 0.02).addScaledVector(fwd, 0.08), t: 0 };
    this.player.up.copy(up); this.player.facing.copy(fwd); this.player.vel.set(0, 0, 0);
    this.player.pose = { sit: 1 };
    this.player.sync();
    if (bench.userData.fireSeat) {
      // on a log by the fire: the camera comes round behind him and looks into the flames
      const side = new THREE.Vector3().crossVectors(up, fwd).normalize();
      const fire = at.clone().addScaledVector(fwd, 2.1);
      this.rig.easeFromHere(1.0);
      // behind his shoulder, a little to one side; try the other side or closer in if a house or tree is in the way
      const head = at.clone().addScaledVector(up, 1.1);
      const solids = this.planet.solids.filter(s => !s.camOnly);
      let cp = new THREE.Vector3();
      for (const [back, off] of [[2.3, 0.7], [2.3, -0.7], [1.8, 1.4], [1.8, -1.4], [1.4, 0]]) {
        cp = at.clone().addScaledVector(fwd, -back).addScaledVector(side, off);
        const ground = this.planet.surfacePoint(cp.clone().sub(this.planet.center).normalize()).distanceTo(this.planet.center) - this.planet.center.distanceTo(at);
        cp.addScaledVector(up, Math.max(0, ground) + 1.75);
        if (segmentClear(solids, head, cp, this.planet.center) >= 1) break;
      }
      this.rig.override = { pos: cp, look: fire.addScaledVector(up, 0.45), up };
      this.seatCam = true;
      this.hud.notify('You sit on a log by the fire. It crackles and pops. <i>E to stand up.</i>');
    } else this.hud.notify('You sit for a while. The day goes by a little faster. <i>Move to stand up.</i>');
  }
  seatCam = false;

  /** Open a door: a short fade, then the room inside. Nilo stays on the step outside the whole time. */
  enterRoom(kind: Q.RoomKind, wall: string, text: string) {
    if (this.room) return;
    const obj = Q.interior(kind, wall);
    const at = this.planet.center.clone().add(new THREE.Vector3(0, this.planet.R * 3, 0));
    obj.position.copy(at); obj.visible = false; this.scene.add(obj);
    const pose = { pos: at.clone().add(new THREE.Vector3(-0.2, 1.6, 1.85)), look: at.clone().add(new THREE.Vector3(0.2, 1.15, -2.2)), up: new THREE.Vector3(0, 1, 0) };
    this.room = { obj, t: 0, phase: 'in', text, pose };
    this.mode = 'inside';
    this.player.vel.set(0, 0, 0);
    this.sound.sfxPlay('soft');
  }

  updateInside(dt: number) {
    const r = this.room, inp = this.input, F = 0.35;
    if (!r) { this.mode = 'play'; return; }
    r.t += dt;
    this.player.animate(dt, 0, false); this.player.sync();
    const sway = { pos: r.pose.pos.clone().add(new THREE.Vector3(Math.sin(this.time * 0.5) * 0.05, Math.sin(this.time * 0.8) * 0.02, 0)), look: r.pose.look, up: r.pose.up };
    if (r.phase === 'in') {
      if (r.t < F) this.hud.setFade(r.t / F, '#2a1e1a');
      else {
        r.obj.visible = true; this.cutCam = sway;
        this.hud.setFade(Math.max(0, 1 - (r.t - F) / F), '#2a1e1a');
        if (r.t >= 2 * F) { r.phase = 'stay'; r.t = 0; this.hud.setFade(0); this.hud.notify(r.text); }
      }
      return;
    }
    if (r.phase === 'stay') {
      this.cutCam = sway;
      this.hud.setPrompt(`<b>E</b>${PROMPT.stepOut}`);
      const mv = inp.key('KeyW') || inp.key('KeyS') || inp.key('KeyA') || inp.key('KeyD');
      if (r.t > 0.6 && (inp.hit('KeyE') || inp.hit('Escape') || inp.hit('Space') || mv)) { r.phase = 'out'; r.t = 0; this.hud.setPrompt(null); this.sound.sfxPlay('soft'); }
      return;
    }
    if (r.t < F) { this.cutCam = sway; this.hud.setFade(r.t / F, '#2a1e1a'); return; }
    if (r.obj.parent) { this.scene.remove(r.obj); this.cutCam = null; this.rig.override = null; }
    this.hud.setFade(Math.max(0, 1 - (r.t - F) / F), '#2a1e1a');
    if (r.t >= 2 * F) { this.hud.setFade(0); this.room = null; this.mode = 'play'; }
  }

  /** Wrap an interactable's action so Nilo walks to it first (and kneels, for things on the ground). */
  walkFirst(it: Interactable) {
    if (!it.walkTo) return it.act;
    return () => { const w = it.walkTo!(); if (w) this.beginApproach(w.spot, w.face, it.act, w.kneel); else it.act(); };
  }

  beginApproach(spot: THREE.Vector3, face: THREE.Vector3, then: () => void, kneel = false) {
    this.appr = { spot: spot.clone(), face: face.clone(), t: 0, phase: 'walk', kneel, then };
    this.mode = 'approach';
    this.sitting = null; this.player.pose = {};
    this.hud.setPrompt(null);
  }

  updateApproach(dt: number) {
    const a = this.appr, pl = this.player;
    if (!a) { this.mode = 'play'; return; }
    a.t += dt;
    const to = a.spot.clone().sub(pl.pos).projectOnPlane(pl.up);
    const dist = to.length();
    if (a.phase === 'walk') {
      // walk, never run, and give up gracefully if something is in the way
      if (dist < 0.2 || a.t > 3.5) { a.phase = 'turn'; a.t = 0; }
      const mv = dist < 0.2 ? new THREE.Vector3() : to.normalize().multiplyScalar(clamp(dist / 0.9, 0.35, 1));
      pl.update(dt, this.planet, mv, false, false);
      this.softPush(dt);
      return;
    }
    pl.update(dt, this.planet, new THREE.Vector3(), false, false);
    const want = a.face.clone().sub(pl.pos).projectOnPlane(pl.up);
    if (want.lengthSq() > 1e-4) pl.facing.lerp(want.normalize(), 1 - Math.exp(-12 * dt)).normalize();
    if (a.phase === 'turn' && a.t > 0.3) {
      if (a.kneel) { a.phase = 'kneel'; a.t = 0; pl.pose = { kneel: 1 }; }
      else { this.appr = null; this.mode = 'play'; a.then(); }
      return;
    }
    if (a.phase === 'kneel' && a.t > 0.5) {
      // the hand reaches the ground: the thing goes into the satchel, then Nilo stands
      this.appr = null; this.mode = 'play'; this.kneelT = 0.45; a.then();
    }
  }

  /** People and goats give way gently: Nilo is eased out of them, never stopped dead. */
  softPush(dt: number) {
    const pl = this.player, c = this.contents[this.cur];
    const bodies: [THREE.Vector3, number][] = c.npcs.map(n => [n.root.position, 0.75]);
    if (this.cur === 0) for (const gt of (c.refs.goats ?? []) as { obj: THREE.Object3D }[]) bodies.push([gt.obj.position, 0.6]);
    if (this.cur === 0 && c.refs.pebble) bodies.push([(c.refs.pebble as THREE.Object3D).position, 0.45]);
    for (const [pos, r] of bodies) {
      const d = pl.pos.clone().sub(pos);
      d.addScaledVector(pl.up, -d.dot(pl.up));
      const len = d.length(), min = r + 0.38;
      if (len >= min || len < 1e-4) continue;
      pl.pos.addScaledVector(d, Math.min(1, dt * 10) * (min - len) / len);
    }
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
        this.enterWorld(tr.to); this.warmUp();
        const dir = this.arrivalDir(tr.to);
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
    const canTravel = true; // any world you have been to is always one flight away
    for (const c of inp.clicks) {
      const i = this.skyView.pick(c, this.camera);
      if (i === null) continue;
      if (!this.flags.has('visited:' + i)) this.hud.notify(NOTE.notVisited);
      else if (i === this.cur) this.skyView.exit();
      else if (!canTravel) this.hud.notify(NOTE.needKite);
      else this.startTravel(i);
    }
  }

  // ------------------------------------------------------------------ main loop
  interactPrompt(): { label: string; act: () => void; hold?: number; key: string } | null {
    const pl = this.player;
    if (this.cur === 0 && !this.flags.has('read-letter')) return { label: PROMPT.letter, act: () => this.openLetter(), key: 'letter' };
    let best: { label: string; act: () => void; hold?: number; key: string; d: number } | null = null;
    for (const n of this.contents[this.cur].npcs) {
      const d = n.root.position.distanceTo(pl.pos);
      if (d < 3.6 && (!best || d < best.d)) best = { label: PROMPT.talk(this.cur === 0 ? knownAs(this.questCtx(), n.id) : SCRIPTS[n.id].name), act: () => this.startTalk(n), d, key: 'npc:' + n.id };
    }
    // People and things compete by distance; a person counts as a little closer, so talking wins ties.
    if (best) best.d -= 0.8;
    for (const it of this.contents[this.cur].interactables as Interactable[]) {
      const d = it.pos.distanceTo(pl.pos);
      if (d < it.radius && (!best || d < best.d)) { const l = it.label(); if (l) best = { label: l, act: this.walkFirst(it), hold: it.hold, d, key: it.id }; }
    }
    if (!best && (this.cur > 0 || this.flags.has('peaks-healed'))) {
      const near = this.planet.riverNearest(pl.up);
      if (near.dist < this.planet.cfg.riverWidth * this.planet.flowWidth + 2.2 && near.t < 0.985) best = { label: PROMPT.raft, act: () => this.boardRaft(), d: 99, key: 'raft' };
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

  /** Slow motion, for looking closely (1 is normal speed). */
  timeScale = 1;
  /** For recording videos: the browser's own loop stops, and a script steps the game with a fixed dt per frame. */
  filming = false;
  fixedDt: number | null = null;

  frame() {
    this.timer.update();
    const dt = this.fixedDt ?? Math.min(0.05, this.timer.getDelta()) * this.timeScale;
    this.time += dt;
    this.fps = lerp(this.fps, 1 / Math.max(1e-3, dt), 0.05);
    PAINT.uTime.value = this.time;
    const inp = this.input;
    if (inp.hit('KeyN')) this.sound.setMuted(!this.sound.muted);
    if (inp.hit('KeyP') && this.mode !== 'title') { const l = this.quality.cycle(); this.applyQuality(); this.hud.notify(NOTE.quality(l)); }
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
      case 'play': this.updatePlay(dt); this.updateAreas(); this.updateMeet(dt); break;
      case 'inside': this.updateInside(dt); break;
      case 'approach': this.updateApproach(dt); break;
      case 'raft': this.updateRaft(dt); break;
      case 'talk': this.updateTalk(dt); break;
      case 'ride': this.updateRide(dt); break;
      case 'sky': this.updateSky(dt); break;
      case 'overlay':
      {
        inp.lockLost = false;
        const keyed = MENU_TABS.find(t => t.key && inp.hit('Key' + t.key));
        if (inp.hit('Escape') && this.time - this.menuByLock > 0.4) this.closeOverlay();
        else if (keyed) this.toggleOverlay(keyed.id);
        break;
      }
    }
    if (this.mode !== 'play' && this.mode !== 'raft' && this.mode !== 'inside') { this.hud.setPrompt(null); this.hud.setHold(null); }

    // ---- time of day, light and wind
    const p = this.planet;
    const viewUp = this.mode === 'title' ? new THREE.Vector3(0, 1, 0) : this.player.up;
    this.day.update(this.mode === 'overlay' ? 0 : dt * (this.sitting ? 9 : 1), viewUp);
    this.menu.setButton(this.mode === 'play' || this.mode === 'overlay');
    if (this.mode !== 'play' && this.mode !== 'overlay') inp.lockLost = false;
    this.day.apply(WORLDS[this.cur].palette, this.sunLight, this.moonLight, this.scene.fog as THREE.FogExp2, p.center);
    const aw = this.mode === 'title' ? [] : this.areaWeights();
    for (const { a, w } of aw) this.sunLight.color.lerp(new THREE.Color(a.light), w * 0.3);
    if (aw.length) PAINT.uSunCol.value.copy(this.sunLight.color).multiplyScalar(this.sunLight.intensity / 2.6);
    this.sunLight.position.copy(this.player.pos).addScaledVector(this.day.sun, 120);
    this.sunLight.target.position.copy(this.player.pos);
    const east = new THREE.Vector3(-this.player.up.z, 0, this.player.up.x);
    if (east.lengthSq() < 1e-4) east.set(1, 0, 0);
    east.normalize().multiplyScalar(1 + 0.35 * Math.sin(this.time * 0.37) * Math.sin(this.time * 0.11 + 1));
    PAINT.uWind.value.copy(east);
    const invQ = this.player.root.quaternion.clone().invert();
    this.player.windLocal.copy(east).applyQuaternion(invQ);

    // ---- the world moves on
    if (this.mode !== 'ride' && this.mode !== 'raft') {
      const hollo = this.cur === 0 && !this.flags.has('peaks-healed') ? this.ch1.hollo.root.position : null;
      const nearGiant = !!hollo && hollo.distanceTo(this.player.pos) < 16;
      const spd = this.player.vel.clone().projectOnPlane(this.player.up).length();
      this.fold.feel(foldMood({ night: 1 - this.day.day, cold: this.cur === 0 ? 1 - this.player.warmth : 0, nearGiant, running: spd > 6, falling: !this.player.grounded && this.player.vel.dot(this.player.up) < -9, justHappy: this.fold.happy > 0.05 }), nearGiant ? hollo : null);
      this.fold.update(dt, this.player.pos, this.player.up, this.player.facing, false);
    }
    this.updateFox(dt);
    if (this.mode !== 'ride') this.fold.updateString(this.player.person.arms[1].hand.getWorldPosition(new THREE.Vector3()));
    const free = this.mode === 'play' || this.mode === 'raft';
    if (this.cutCam) this.rig.override = this.cutCam;
    else if (this.mode === 'cut' || this.mode === 'letter') this.rig.override = null;
    // talk shots and the first-meet portrait are worked out on the fly, so keep them out of walls and Hollo
    this.rig.blockOverride = !!this.talkCam || !!this.meet;
    this.rig.update(dt, this.player.pos, this.player.up, p, free ? inp.mouseDX : 0, free ? inp.mouseDY : 0, free ? inp.axis(['ArrowLeft'], ['ArrowRight']) : 0);
    if (this.mode === 'sky' || this.skyView.open) {
      const pose = this.skyView.update(dt, { pos: this.rig.pos.clone(), look: this.rig.look.clone(), up: this.rig.smoothUp.clone() }, this.player.pos, this.cur, this.visited(), true, this.camera);
      if (pose) { this.camera.position.copy(pose.pos); this.camera.up.copy(pose.up); this.camera.lookAt(pose.look); }
      else if (this.mode === 'sky' && !this.travel) { this.mode = 'play'; this.input.allowLock = true; }
    }
    const fog = this.scene.fog as THREE.FogExp2;
    const far = this.mode === 'title' ? 1 : Math.max(this.fogK, smoothstep(0, 0.5, this.skyView.k));
    (this.beacon.material as THREE.SpriteMaterial).depthTest = far < 0.3;
    fog.density = lerp(FOG_BASE, 0.00006, far);

    (this.contents[this.cur].refs.lifeNear as THREE.Vector3 | undefined)?.copy(this.player.pos);
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
    // each area sounds a little like itself
    let riverK = riverNear, windK = onPeaks ? 0.3 + alt * 0.6 : 0.2;
    for (const { a, w } of aw) {
      if (a.sound === 'chimes') this.sound.amb.chimes = Math.max(this.sound.amb.chimes, w * 0.8);
      if (a.sound === 'fire') this.sound.amb.fire = Math.max(this.sound.amb.fire, w * 0.6);
      if (a.sound === 'birds') this.sound.amb.birds = this.day.day * (1 + w);
      if (a.sound === 'wind') windK = Math.max(windK, 0.55 + w * 0.45);
      if (a.sound === 'river') riverK = Math.max(riverK, w * 0.7);
      if (a.sound === 'falls') this.sound.amb.edge = Math.max(this.sound.amb.edge, w);
      if (a.sound === 'goats' && w > 0.5 && this.mode === 'play' && (this.bleatT -= dt) < 0) { this.bleatT = 6 + Math.random() * 9; this.sound.sfxPlay('bleat'); }
    }
    this.sound.update(riverK, flowArrivingAt(this.river, this.cur), windK);
    this.hud.setFrost(onPeaks && this.mode === 'play' ? clamp((1 - this.player.warmth) * 1.1) : 0);
    const showGoal = this.mode === 'play' || this.mode === 'raft' || this.mode === 'overlay';
    const qc = this.questCtx();
    const step = currentStep(qc);
    const goal = step && this.flags.has('read-letter') ? stepDetail(qc) : null;
    const ember = this.cur === 0 ? this.ch1.lanterns.meter() : '';
    const lit = ember ? ember : this.cur === 0 && this.flags.has('quest:hollo') && !this.flags.has('chapter1-complete') ? `Lanterns  ${'●'.repeat(lanternsLit(qc))}${'○'.repeat(3 - lanternsLit(qc))}` : '';
    this.hud.setGoal(showGoal && goal ? goal : null, lit);
    this.hud.compass.update(dt, { show: (this.mode === 'play' || this.mode === 'raft') && !this.hud.goalHidden && this.flags.has('read-letter'), center: this.planet.center, radius: this.planet.R, worldId: this.planet.cfg.id, pos: this.player.pos, camera: this.camera, task: this.cur === 0 && goal ? this.ch1.guideTarget() : null, taskLabel: goal ? goal.replace(/\s*\(\d+ of \d+\)\s*$/, '') : null, pins: this.map });
    // A new task: a toast with the same words as the goal line, once the conversation or scene is over.
    if (goal && (this.mode === 'play' || this.mode === 'raft')) {
      const key = goal.replace(/\(\d+ of \d+\)\s*$/, '').trim();
      if (key !== this.lastGoal) {
        if (this.lastGoal !== null) { this.hud.notifyNow(`<b>${NEW_GOAL}</b> · ${key}`); this.sound.sfxPlay('chime'); }
        this.lastGoal = key;
      }
    }
    if (this.mode === 'play' || this.mode === 'raft') { const lv = this.quality.sample(dt); if (lv) { this.applyQuality(); this.warmUp(); this.hud.notify(NOTE.qualityAuto(lv)); } }
    this.updateNameTags();
    if (this.trailOn && this.mode !== 'title') {
      this.trailT -= dt;
      if (this.trailT <= 0) { this.trailT = 1; const l = latLonOf(this.player.up); this.map.trail.push({ lat: l.lat, lonOff: wrapDeg(l.lon - this.planet.lonAtLat(l.lat)) }); }
    }
    this.hud.update(dt);
    this.finish.mat.uniforms.uTime.value = this.time;
    this.finish.mat.uniforms.uNight.value = 1 - Math.max(this.day.day, far);
    {
      const U = this.finish.mat.uniforms;
      const sp = this.camera.position.clone().addScaledVector(this.day.sun, 900).project(this.camera);
      const camDir = this.camera.getWorldDirection(new THREE.Vector3());
      const facing = camDir.dot(this.day.sun);
      U.uSun.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
      const onScreen = 1 - smoothstep(1.1, 1.6, Math.max(Math.abs(sp.x), Math.abs(sp.y)));
      U.uSunVis.value = facing > 0.1 ? onScreen * smoothstep(0.1, 0.5, facing) * this.day.day * (1 - far) : 0;
      const e = this.day.sun.dot(this.player.up);
      U.uMist.value = (0.12 + 0.75 * smoothstep(-0.12, 0.04, e) * (1 - smoothstep(0.1, 0.38, e))) * (1 - far);
    }
    // Playtests can skip drawing some frames so the world runs at full speed in a slow test browser.
    if (++this.frameN % this.renderEvery === 0) this.composer.render();
    inp.endFrame();
  }

  updatePlay(dt: number) {
    const inp = this.input, pl = this.player, p = this.planet;
    const { f, r } = this.rig.basis(pl.up);
    const mv = f.multiplyScalar(inp.axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp'])).add(r.multiplyScalar(inp.axis(['KeyA'], ['KeyD'])));
    if (mv.lengthSq() > 1) mv.normalize();
    if (this.hud.helpOpen() || this.meet) mv.set(0, 0, 0);
    // Esc, or the browser letting go of the mouse (which is what Esc does while looking around), opens the menu.
    if (inp.lockLost) { inp.lockLost = false; this.menuByLock = this.time; this.openTab('goal'); return; }
    if (inp.hit('Escape')) { this.openTab('goal'); return; }
    const keyed = MENU_TABS.find(t => t.key && inp.hit('Key' + t.key));
    if (keyed) { this.openTab(keyed.id); return; }
    if (this.sitting) {
      if (this.sitSlide) {
        const sl = this.sitSlide; sl.t = Math.min(1, sl.t + dt / 0.45);
        pl.pos.lerpVectors(sl.from, sl.to, sl.t * sl.t * (3 - 2 * sl.t));
        if (sl.t >= 1) this.sitSlide = null;
      }
      if (!this.sitSlide && (mv.lengthSq() > 0.01 || inp.hit('Space') || inp.hit('KeyE'))) { this.sitting = null; pl.pose = {}; if (this.seatCam) { this.seatCam = false; this.rig.easeFromHere(0.8); this.rig.override = null; } }
      else { pl.animate(dt, 0, false); pl.sync(); this.hud.setPrompt(null); return; }
    }
    if (this.kneelT > 0) { this.kneelT -= dt; if (this.kneelT <= 0 || mv.lengthSq() > 0.01) { this.kneelT = 0; pl.pose = {}; } }
    pl.update(dt, p, mv, inp.hit('Space'), inp.key('KeyX') || inp.key('ShiftLeft') || inp.key('ShiftRight'), inp.key('Space'), inp.hit('KeyC'));
    this.softPush(dt);
    this.fold.kiteMode = pl.gliding;
    if (inp.hit('KeyQ') && this.flags.has('power:skyreading')) { this.skyread.active = !this.skyread.active; this.sound.sfxPlay('soft'); }
    if (inp.hit('KeyF')) { this.sound.sfxPlay('whistle'); this.fold.hop(); pl.pose = {}; }
    if (inp.hit('Tab') || inp.wheel > 0) { this.openSky(); return; }
    this.surveyT -= dt;
    if (this.surveyT <= 0) { this.surveyT = 0.5; const ll = latLonOf(pl.up); this.map.reveal(this.planet, ll.lat, wrapDeg(ll.lon - this.planet.lonAtLat(ll.lat)), 22); }
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
    if (near.t > 0.99 && !n && this.cur < this.planets.length - 1 && (this.cur > 0 || this.flags.has('chapter1-complete'))) {
      this.hud.setPrompt(`<b>E</b>Ride the falling stream down to ${WORLDS[this.cur + 1].name}`);
      if (inp.hit('KeyE')) this.startRide(this.cur, this.cur + 1);
    }
  }

  run() {
    const loop = () => { if (!this.filming) this.frame(); requestAnimationFrame(loop); };
    loop();
  }
}

/* ============================================================
   鹈鹕骑自行车 · Pelican Coast Ride
   全程序化 Three.js 3D 骑行页：零外部素材
   ============================================================ */
(function () {
'use strict';

/* ---------------- 基础工具 ---------------- */
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const rand = (a, b) => a + Math.random() * (b - a);
const randPick = (arr) => arr[(Math.random() * arr.length) | 0];
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mod = (n, m) => ((n % m) + m) % m;

/* 简易可复现噪声（用于环境随机分布，保证远处景物不闪烁） */
function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function noise1(x) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash1(i), hash1(i + 1), u) * 2 - 1;
}

/* ---------------- 全局配置 ---------------- */
const CFG = {
  roadWidth: 7.2,          // 路面宽
  segLen: 20,              // 路段长度
  segCount: 15,            // 路段数量（前方+后方）
  recycleBehind: 30,       // 身后回收距离
  spawnAhead: 260,         // 前方生成距离
  wheelR: 0.34,            // 车轮半径
  crankR: 0.17,            // 曲柄半径
  gearRatio: 2.6,          // 轮/曲柄转速比
  maxSpeed: 22,            // m/s ≈ 79 km/h
  cruiseSpeed: 9,
  accel: 6.5,
  brake: 14,
  drag: 0.35,
  steerSpeed: 6.5,         // 变道速度 m/s
  laneLimit: 2.6,          // 车道偏移上限
  jumpVel: 5.2,
  gravity: 13.5,
  dayLength: 360,          // 一昼夜秒数
  startDayT: 0.725,         // 从黄昏前开始（0..1，0.5=正午，0/1=午夜）
};

/* ---------------- 全局状态 ---------------- */
const S = {
  running: false, paused: false, started: false,
  speed: 0, targetCruise: CFG.cruiseSpeed,
  dist: 0,                 // 总里程 m
  lane: 0,                 // 玩家横向偏移
  steer: 0,                // 平滑转向量 -1..1
  lean: 0,                 // 车身倾斜
  vy: 0, airY: 0, grounded: true,
  pedaling: 0,             // 踩踏强度 0..1
  crankAngle: -PI / 2,
  dayT: CFG.startDayT,
  fishCaught: 0,
  trickT: 0, bellT: 0, jumpCount: 0, bellCount: 0,
  rideTime: 0, autoPilot: true, idleT: 0, autoDist: 0,
  camMode: 0, camUserT: 0,
  quality: 2,              // 0低 1中 2高
  fpsAvg: 60, fpsT: 0, fpsN: 0,
  muted: false,
  best: parseFloat(localStorage.getItem('pelican_best') || '0'),
  reducedMotion: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  touch: ('ontouchstart' in window) || navigator.maxTouchPoints > 0,
};

/* ---------------- 输入 ---------------- */
const KEYS = {};
const INPUT = { up: 0, down: 0, left: 0, right: 0 };
function refreshInput() {
  INPUT.up = (KEYS.KeyW || KEYS.ArrowUp) ? 1 : 0;
  INPUT.down = (KEYS.KeyS || KEYS.ArrowDown) ? 1 : 0;
  INPUT.left = (KEYS.KeyA || KEYS.ArrowLeft) ? 1 : 0;
  INPUT.right = (KEYS.KeyD || KEYS.ArrowRight) ? 1 : 0;
  if (S.touch) {
    INPUT.up = Math.max(INPUT.up, TOUCH.up ? 1 : 0);
    INPUT.down = Math.max(INPUT.down, TOUCH.down ? 1 : 0);
    INPUT.left = Math.max(INPUT.left, TOUCH.left ? 1 : 0);
    INPUT.right = Math.max(INPUT.right, TOUCH.right ? 1 : 0);
  }
  if (INPUT.up || INPUT.down || INPUT.left || INPUT.right) { S.idleT = 0; S.autoPilot = false; S.autoDist = 0; }
}
const TOUCH = { up: 0, down: 0, left: 0, right: 0 };

/* ============================================================
   音频引擎 · 全部 WebAudio 实时合成，无任何音频文件
   - 风声(随速度) / 海浪 / 踩踏驱动的芯片音乐 / 车铃 / 抓鱼 / 跳跃 / 成就
   ============================================================ */
const AudioEngine = {
  ctx: null, master: null, musicGain: null, sfxGain: null, ambGain: null,
  started: false,
  windSrc: null, windGain: null, windFilter: null,
  waveSrc: null, waveGain: null, waveLFO: null,
  seqTimer: null, step: 0, nextT: 0,
  init() {
    if (this.started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = S.muted ? 0 : 0.9;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    this.musicGain = c.createGain(); this.musicGain.gain.value = 0.5; this.musicGain.connect(this.master);
    this.sfxGain = c.createGain(); this.sfxGain.gain.value = 0.8; this.sfxGain.connect(this.master);
    this.ambGain = c.createGain(); this.ambGain.gain.value = 0.55; this.ambGain.connect(this.master);
    this._wind(); this._waves(); this._musicLoop();
    this.started = true;
  },
  _noiseBuffer(sec) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  },
  _wind() {
    const c = this.ctx;
    this.windSrc = c.createBufferSource();
    this.windSrc.buffer = this._noiseBuffer(3); this.windSrc.loop = true;
    this.windFilter = c.createBiquadFilter(); this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500; this.windFilter.Q.value = 0.6;
    this.windGain = c.createGain(); this.windGain.gain.value = 0.0;
    this.windSrc.connect(this.windFilter); this.windFilter.connect(this.windGain); this.windGain.connect(this.ambGain);
    this.windSrc.start();
  },
  _waves() {
    const c = this.ctx;
    this.waveSrc = c.createBufferSource();
    this.waveSrc.buffer = this._noiseBuffer(4); this.waveSrc.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320; f.Q.value = 0.4;
    this.waveGain = c.createGain(); this.waveGain.gain.value = 0.10;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.14;
    const lfoG = c.createGain(); lfoG.gain.value = 0.055;
    lfo.connect(lfoG); lfoG.connect(this.waveGain.gain);
    this.waveSrc.connect(f); f.connect(this.waveGain); this.waveGain.connect(this.ambGain);
    this.waveSrc.start(); lfo.start();
  },
  /* 芯片音乐：16步音序器，速度跟随踩踏频率 */
  _musicLoop() {
    const bassNotes = [0, -1, -1, -1, 3, -1, -1, -1, 5, -1, -1, 3, -1, -1, 2, -1];
    const arpNotes  = [7, -1, 10, -1, 12, -1, 10, 7, -1, 9, -1, 12, -1, 14, -1, -1];
    const scale = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20, 22, 24]; // 小调五声扩展
    const base = 110; // A2
    const note2f = (n) => base * Math.pow(2, n / 12);
    const tick = () => {
      if (!this.ctx) return;
      const c = this.ctx;
      const cad = 2 + S.speed * 0.35;            // 步频: 2 ~ 9.7 步/秒
      const stepDur = 60 / (cad * 60) * 4;       // 16步/循环
      while (this.nextT < c.currentTime + 0.12) {
        const t = Math.max(this.nextT, c.currentTime);
        const i = this.step % 16;
        if (S.running && !S.paused && S.speed > 0.5) {
          const b = bassNotes[i];
          if (b >= 0) this._pluck(note2f(scale[b] - 12), t, 0.20, 'triangle', 0.20);
          const a = arpNotes[i];
          if (a >= 0 && S.speed > 3) this._pluck(note2f(scale[a % scale.length] + 12), t, 0.09, 'square', 0.05);
          if (i % 8 === 4) this._hat(t, 0.05);   // 踩镲
          if (i % 16 === 0) this._kick(t, 0.16); // 底鼓
        }
        this.step++; this.nextT += stepDur;
      }
    };
    this.nextT = this.ctx.currentTime + 0.1; this.step = 0;
    this.seqTimer = setInterval(tick, 40);
  },
  _pluck(freq, t, dur, type, vol) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.02);
  },
  _kick(t, vol) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + 0.16);
  },
  _hat(t, vol) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this._noiseBuffer(0.05);
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6000;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    s.connect(f); f.connect(g); g.connect(this.musicGain); s.start(t);
  },
  /* ------- SFX ------- */
  _blip(freqA, freqB, dur, type, vol, delay) {
    if (!this.started) return;
    const c = this.ctx, t = c.currentTime + (delay || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freqA, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  },
  bell() {
    this._blip(1180, 1150, 0.35, 'sine', 0.30);
    this._blip(1770, 1720, 0.28, 'sine', 0.16, 0.01);
    this._blip(1180, 1150, 0.30, 'sine', 0.22, 0.14);
  },
  catchFish() {
    this._blip(400, 1200, 0.16, 'sine', 0.28);
    this._blip(600, 1600, 0.20, 'sine', 0.22, 0.10);
    this._blip(200, 90, 0.22, 'triangle', 0.30, 0.16); // 吞咽
  },
  splash() {
    if (!this.started) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this._noiseBuffer(0.25);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 0.7;
    const g = c.createGain(); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    s.connect(f); f.connect(g); g.connect(this.sfxGain); s.start(t);
  },
  jump() { this._blip(300, 700, 0.18, 'sine', 0.18); },
  land() { this._blip(180, 80, 0.12, 'triangle', 0.20); },
  trick() {
    this._blip(500, 1000, 0.3, 'sawtooth', 0.10);
    this._blip(750, 1500, 0.3, 'sine', 0.16, 0.08);
  },
  achievement() {
    const ns = [523, 659, 784, 1046];
    ns.forEach((f, i) => this._blip(f, f, 0.22, 'triangle', 0.22, i * 0.09));
  },
  gull() {
    this._blip(rand(1100, 1500), rand(700, 900), 0.25, 'sine', 0.05, 0);
    this._blip(rand(1000, 1400), rand(650, 850), 0.2, 'sine', 0.04, 0.22);
  },
  setMuted(m) {
    S.muted = m;
    if (this.master) this.master.gain.linearRampToValueAtTime(m ? 0 : 0.9, this.ctx.currentTime + 0.1);
  },
  update() {
    if (!this.started) return;
    const w = clamp(S.speed / CFG.maxSpeed, 0, 1);
    this.windGain.gain.value = lerp(this.windGain.gain.value, 0.02 + w * 0.22, 0.06);
    this.windFilter.frequency.value = 380 + w * 900;
  }
};

/* ============================================================
   天空 · 渐变穹顶着色器（昼夜循环驱动）
   ============================================================ */
const SKY_UNI = {
  topColor:    { value: new THREE.Color(0x2a4a7a) },
  midColor:    { value: new THREE.Color(0xd06a4e) },
  botColor:    { value: new THREE.Color(0xf7b267) },
  sunDir:      { value: new THREE.Vector3(0, 0.2, -1).normalize() },
  sunColor:    { value: new THREE.Color(0xffd9a0) },
  sunIntensity:{ value: 1.0 },
  starAlpha:   { value: 0.0 },
  uTime:       { value: 0 },
};
function buildSky(scene) {
  const geo = new THREE.SphereGeometry(900, 32, 20);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: SKY_UNI,
    vertexShader: `
      varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 topColor, midColor, botColor, sunColor, sunDir;
      uniform float sunIntensity, starAlpha, uTime;
      varying vec3 vDir;
      float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        float h = clamp(vDir.y, -0.12, 1.0);
        vec3 col = mix(botColor, midColor, smoothstep(-0.05, 0.28, h));
        col = mix(col, topColor, smoothstep(0.18, 0.75, h));
        float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
        col += sunColor * (pow(s, 350.0) * 1.6 + pow(s, 24.0) * 0.35 + pow(s, 6.0) * 0.12) * sunIntensity;
        if (starAlpha > 0.01 && vDir.y > 0.02) {
          vec3 sp = floor(vDir * 220.0);
          float st = step(0.9975, hash(sp));
          float tw = 0.6 + 0.4 * sin(uTime * 2.4 + hash(sp + 1.0) * 40.0);
          col += vec3(0.9, 0.95, 1.0) * st * tw * starAlpha * smoothstep(0.02, 0.2, vDir.y);
        }
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

/* ============================================================
   海洋 · 顶点波浪 + 菲涅尔天空反射着色器
   ============================================================ */
const OCEAN_UNI = {
  uTime:      { value: 0 },
  uSunDir:    { value: new THREE.Vector3(0, 0.2, -1).normalize() },
  uSunColor:  { value: new THREE.Color(0xffd9a0) },
  uSkyColor:  { value: new THREE.Color(0x8fb8d8) },
  uDeepColor: { value: new THREE.Color(0x0e3a52) },
  uSunGlint:  { value: 1.0 },
  fogColor:   { value: new THREE.Color(0xd06a4e) },
  fogNear:    { value: 60 },
  fogFar:     { value: 420 },
};
function buildOcean(scene) {
  const geo = new THREE.PlaneGeometry(700, 900, 90, 110);
  geo.rotateX(-PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: OCEAN_UNI, fog: false,
    vertexShader: `
      uniform float uTime;
      varying vec3 vPos;
      varying float vWave;
      void main(){
        vec3 p = position;
        float w = 0.0;
        w += sin(p.x * 0.10 + uTime * 1.1) * 0.35;
        w += sin(p.z * 0.13 - uTime * 0.9) * 0.28;
        w += sin((p.x + p.z) * 0.055 + uTime * 0.55) * 0.5;
        w += sin(p.x * 0.31 - uTime * 1.7) * 0.10;
        p.y += w;
        vWave = w;
        vPos = (modelMatrix * vec4(p, 1.0)).xyz;
        gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uSunDir, uSunColor, uSkyColor, uDeepColor, fogColor;
      uniform float uSunGlint, fogNear, fogFar, uTime;
      varying vec3 vPos;
      varying float vWave;
      void main(){
        vec3 dx = dFdx(vPos), dy = dFdy(vPos);
        vec3 n = normalize(cross(dx, dy));
        if (n.y < 0.0) n = -n;
        vec3 viewDir = normalize(cameraPosition - vPos);
        float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 2.2);
        vec3 col = mix(uDeepColor, uSkyColor, clamp(fres * 0.85 + vWave * 0.06 + 0.08, 0.0, 1.0));
        vec3 hv = normalize(viewDir + normalize(uSunDir));
        float spec = pow(max(dot(n, hv), 0.0), 140.0) * uSunGlint;
        col += uSunColor * spec * 1.4;
        float sparkle = sin(vPos.x * 3.1 + uTime * 2.0) * sin(vPos.z * 2.7 - uTime * 1.6);
        col += uSunColor * smoothstep(0.86, 1.0, sparkle) * 0.10 * uSunGlint;
        float dist = length(cameraPosition - vPos);
        float f = smoothstep(fogNear, fogFar, dist);
        col = mix(col, fogColor, f);
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(-360, -0.9, -260);
  scene.add(mesh);
  return mesh;
}

/* ============================================================
   材质库 · 低多边形平涂风格
   ============================================================ */
const MAT = {};
function buildMaterials() {
  const std = (color, opt) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9, metalness: 0.0, flatShading: true }, opt || {}));
  MAT.road      = std(0x3d434b, { roughness: 0.98 });
  MAT.roadEdge  = std(0xe8e4da, { roughness: 0.9 });
  MAT.dash      = std(0xf5d76e, { roughness: 0.85, emissive: 0x342a08 });
  MAT.sand      = std(0xe3c890, { roughness: 1.0 });
  MAT.grass     = std(0x5d9c4f, { roughness: 1.0 });
  MAT.grassDark = std(0x477d3d, { roughness: 1.0 });
  MAT.rail      = std(0xc8ccd2, { roughness: 0.5, metalness: 0.55 });
  MAT.railPost  = std(0x8b9096, { roughness: 0.6, metalness: 0.4 });
  MAT.lampPole  = std(0x4a4f57, { roughness: 0.55, metalness: 0.5 });
  MAT.lampHead  = std(0xfff2c8, { emissive: 0x000000 });
  MAT.trunk     = std(0x8a6242, { roughness: 1.0 });
  MAT.palmLeaf  = std(0x3f8f4f, { roughness: 0.95 });
  MAT.rock      = std(0x8d8578, { roughness: 1.0 });
  MAT.rockDark  = std(0x6e675c, { roughness: 1.0 });
  MAT.cloud     = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: true });
  MAT.sign      = std(0x2f7ec2, { roughness: 0.6 });
  MAT.signPost  = std(0x9aa0a8, { metalness: 0.5, roughness: 0.5 });
  MAT.gull      = new THREE.MeshBasicMaterial({ color: 0xf8f8f8, fog: true });
  MAT.fish      = std(0x7fb8d8, { roughness: 0.4, metalness: 0.3, emissive: 0x0a2030 });
  MAT.cliff     = std(0x9c7f5e, { roughness: 1.0 });
}

/* 道路中线：距起点 d 处的横向弯曲量（连续正弦叠加） */
function curveX(d) {
  return Math.sin(d * 0.011) * 6.5 + Math.sin(d * 0.0043 + 1.7) * 10.0 + Math.sin(d * 0.027 + 0.5) * 1.6;
}
/* 弯曲的横向速度（用于车身随弯道平移与相机侧移） */
function curveDX(d) {
  return Math.cos(d * 0.011) * 6.5 * 0.011 + Math.cos(d * 0.0043 + 1.7) * 10.0 * 0.0043 + Math.cos(d * 0.027 + 0.5) * 1.6 * 0.027;
}

/* ---------- 路段池 ---------- */
const ROAD = { segs: [], group: null };
function buildRoad(scene) {
  ROAD.group = new THREE.Group();
  scene.add(ROAD.group);
  const geoMain = new THREE.BoxGeometry(CFG.roadWidth, 0.18, CFG.segLen + 0.25);
  const geoEdge = new THREE.BoxGeometry(0.28, 0.20, CFG.segLen + 0.25);
  const geoDash = new THREE.BoxGeometry(0.16, 0.21, 2.2);
  const geoSandL = new THREE.BoxGeometry(18, 0.12, CFG.segLen + 0.25);
  const geoGrassR = new THREE.BoxGeometry(34, 0.12, CFG.segLen + 0.25);
  for (let i = 0; i < CFG.segCount; i++) {
    const g = new THREE.Group();
    const main = new THREE.Mesh(geoMain, MAT.road); main.receiveShadow = true; g.add(main);
    const eL = new THREE.Mesh(geoEdge, MAT.roadEdge); eL.position.x = -CFG.roadWidth / 2 + 0.14; g.add(eL);
    const eR = new THREE.Mesh(geoEdge, MAT.roadEdge); eR.position.x = CFG.roadWidth / 2 - 0.14; g.add(eR);
    for (let k = 0; k < 3; k++) {
      const d = new THREE.Mesh(geoDash, MAT.dash);
      d.position.set(0, 0.005, -CFG.segLen / 2 + (k + 0.5) * CFG.segLen / 3);
      g.add(d);
    }
    const sand = new THREE.Mesh(geoSandL, MAT.sand); sand.position.set(-CFG.roadWidth / 2 - 9, -0.05, 0); sand.receiveShadow = true; g.add(sand);
    const grass = new THREE.Mesh(geoGrassR, MAT.grass); grass.position.set(CFG.roadWidth / 2 + 17, -0.05, 0); grass.receiveShadow = true; g.add(grass);
    ROAD.group.add(g);
    ROAD.segs.push({ g, idx: -999 - i });
  }
}

/* ---------- 护栏（右侧路缘 · 悬崖边） ---------- */
const RAILS = { items: [], group: null, spacing: 5 };
function buildRails(scene) {
  RAILS.group = new THREE.Group(); scene.add(RAILS.group);
  const postGeo = new THREE.BoxGeometry(0.09, 0.62, 0.09);
  const beamGeo = new THREE.BoxGeometry(0.07, 0.16, RAILS.spacing + 0.1);
  const n = Math.ceil((CFG.spawnAhead + CFG.recycleBehind) / RAILS.spacing);
  for (let i = 0; i < n; i++) {
    const it = new THREE.Group();
    const post = new THREE.Mesh(postGeo, MAT.railPost); post.position.y = 0.31; post.castShadow = true; it.add(post);
    const beam = new THREE.Mesh(beamGeo, MAT.rail); beam.position.y = 0.55; beam.castShadow = true; it.add(beam);
    RAILS.group.add(it);
    RAILS.items.push({ g: it, d: -CFG.recycleBehind + i * RAILS.spacing });
  }
}

/* ---------- 路灯（左侧·海边；夜里点亮） ---------- */
const LAMPS = { items: [], spacing: 40, lights: [], glowTex: null };
function makeGlowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, 'rgba(255,220,150,1)');
  grad.addColorStop(0.35, 'rgba(255,190,110,0.45)');
  grad.addColorStop(1, 'rgba(255,180,90,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}
function buildLamps(scene) {
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.10, 4.6, 6);
  const armGeo = new THREE.BoxGeometry(1.1, 0.07, 0.07);
  const headGeo = new THREE.SphereGeometry(0.20, 8, 6);
  const n = Math.ceil((CFG.spawnAhead + CFG.recycleBehind) / LAMPS.spacing);
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(poleGeo, MAT.lampPole); pole.position.y = 2.3; pole.castShadow = true; g.add(pole);
    const arm = new THREE.Mesh(armGeo, MAT.lampPole); arm.position.set(-0.5, 4.55, 0); g.add(arm);
    const headMat = MAT.lampHead.clone();
    const head = new THREE.Mesh(headGeo, headMat); head.position.set(-1.0, 4.42, 0); g.add(head);
    if (!LAMPS.glowTex) LAMPS.glowTex = makeGlowTexture();
    const glowMat = new THREE.SpriteMaterial({ map: LAMPS.glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.set(3.4, 3.4, 1);
    glow.position.set(-1.0, 4.42, 0);
    g.add(glow);
    let pl = null;
    if (i % 3 === 0) { // 只给1/3路灯真实点光，控制开销
      pl = new THREE.PointLight(0xffc866, 0, 16, 2.0);
      pl.position.set(-1.0, 4.3, 0); g.add(pl);
      LAMPS.lights.push(pl);
    }
    scene.add(g);
    LAMPS.items.push({ g, headMat, glowMat, d: -CFG.recycleBehind + i * LAMPS.spacing });
  }
}

/* ---------- 棕榈树（右侧草地 + 少量沙滩） ---------- */
const PALMS = { items: [], spacing: 17 };
function makePalm() {
  const g = new THREE.Group();
  const h = rand(2.6, 4.2);
  const trunkGeo = new THREE.CylinderGeometry(0.09, 0.16, h, 5);
  const trunk = new THREE.Mesh(trunkGeo, MAT.trunk); trunk.position.y = h / 2; trunk.castShadow = true; g.add(trunk);
  const leafGeo = new THREE.ConeGeometry(0.22, 1.9, 4);
  const leaves = new THREE.Group();
  const nl = 6 + ((Math.random() * 3) | 0);
  for (let i = 0; i < nl; i++) {
    const leaf = new THREE.Mesh(leafGeo, MAT.palmLeaf);
    const a = (i / nl) * TAU + rand(-0.2, 0.2);
    leaf.position.set(Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85);
    leaf.rotation.z = PI / 2 + 0.5; leaf.rotation.y = -a;
    leaf.castShadow = true;
    leaves.add(leaf);
  }
  leaves.position.y = h;
  g.add(leaves);
  g.userData.leaves = leaves;
  const nut = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), MAT.trunk);
  nut.position.set(0.15, h - 0.12, 0); g.add(nut);
  return g;
}
function buildPalms(scene) {
  const n = Math.ceil((CFG.spawnAhead + CFG.recycleBehind) / PALMS.spacing);
  for (let i = 0; i < n; i++) {
    const g = makePalm();
    scene.add(g);
    PALMS.items.push({ g, d: -CFG.recycleBehind + i * PALMS.spacing, seed: hash1(i * 7.13) });
  }
}

/* ---------- 草丛/礁石/路牌 ---------- */
const PROPS = { grass: [], rocks: [], signs: [] };
function buildProps(scene) {
  const grassGeo = new THREE.ConeGeometry(0.16, 0.5, 4);
  const ng = 90;
  for (let i = 0; i < ng; i++) {
    const m = new THREE.Mesh(grassGeo, i % 2 ? MAT.grass : MAT.grassDark);
    scene.add(m);
    PROPS.grass.push({ m, d: -CFG.recycleBehind + (i / ng) * (CFG.spawnAhead + CFG.recycleBehind), seed: hash1(i * 3.7) });
  }
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(rockGeo, i % 2 ? MAT.rock : MAT.rockDark);
    m.castShadow = true;
    scene.add(m);
    PROPS.rocks.push({ m, d: -CFG.recycleBehind + (i / 26) * (CFG.spawnAhead + CFG.recycleBehind) + 8, seed: hash1(i * 9.1) });
  }
  const signGeo = new THREE.BoxGeometry(1.3, 0.9, 0.06);
  const postGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6);
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(postGeo, MAT.signPost); post.position.y = 1.1; g.add(post);
    const board = new THREE.Mesh(signGeo, MAT.sign); board.position.y = 2.2; board.castShadow = true; g.add(board);
    scene.add(g);
    PROPS.signs.push({ g, d: -CFG.recycleBehind + 60 + i * 120 });
  }
}

/* ---------- 云 ---------- */
const CLOUDS = { items: [] };
function makeCloud() {
  const g = new THREE.Group();
  const n = 3 + ((Math.random() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(rand(2.2, 4.6), 7, 6), MAT.cloud);
    s.position.set(rand(-4, 4), rand(-0.8, 0.8), rand(-2, 2));
    s.scale.y = 0.55;
    g.add(s);
  }
  return g;
}
function buildClouds(scene) {
  for (let i = 0; i < 10; i++) {
    const g = makeCloud();
    g.position.set(rand(-160, 160), rand(28, 55), rand(-380, 60));
    g.userData.v = rand(0.4, 1.1);
    scene.add(g);
    CLOUDS.items.push(g);
  }
}

/* ---------- 海鸥 ---------- */
const GULLS = { items: [] };
function makeGull() {
  const g = new THREE.Group();
  const bodyGeo = new THREE.ConeGeometry(0.12, 0.55, 4);
  bodyGeo.rotateX(PI / 2);
  const body = new THREE.Mesh(bodyGeo, MAT.gull);
  g.add(body);
  const wingGeo = new THREE.BoxGeometry(0.95, 0.03, 0.22);
  const wl = new THREE.Mesh(wingGeo, MAT.gull); wl.position.x = -0.5; g.add(wl);
  const wr = new THREE.Mesh(wingGeo, MAT.gull); wr.position.x = 0.5; g.add(wr);
  g.userData = { wl, wr, phase: rand(0, TAU) };
  return g;
}
function buildGulls(scene) {
  for (let i = 0; i < 7; i++) {
    const g = makeGull();
    g.position.set(rand(-90, -20), rand(9, 22), rand(-180, 20));
    g.userData.cx = g.position.x; g.userData.cz = g.position.z;
    g.userData.r = rand(8, 26); g.userData.w = rand(0.15, 0.4) * (i % 2 ? 1 : -1);
    scene.add(g);
    GULLS.items.push(g);
  }
}

/* ============================================================
   自行车 · 全程序化（轮胎/轮圈/辐条/车架/曲柄/脚踏/链条/车筐/铃）
   局部坐标：面向 -Z，BB 中轴在原点上方 0.34m
   ============================================================ */
const BIKE = {};
function tubeBetween(p1, p2, r, mat, parent, cast) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r, r, len, 7);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(p1).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  if (cast !== false) m.castShadow = true;
  parent.add(m);
  return m;
}
function buildWheel() {
  const g = new THREE.Group();
  const tireGeo = new THREE.TorusGeometry(CFG.wheelR, 0.038, 8, 26);
  const tire = new THREE.Mesh(tireGeo, new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.95, flatShading: true }));
  tire.rotation.y = PI / 2; tire.castShadow = true; g.add(tire);
  const rimGeo = new THREE.TorusGeometry(CFG.wheelR - 0.045, 0.014, 6, 26);
  const rim = new THREE.Mesh(rimGeo, new THREE.MeshStandardMaterial({ color: 0xd7dde3, roughness: 0.35, metalness: 0.8 }));
  rim.rotation.y = PI / 2; g.add(rim);
  const spokeGeo = new THREE.BoxGeometry(0.008, CFG.wheelR - 0.05, 0.008);
  const spokeMat = new THREE.MeshStandardMaterial({ color: 0xc0c8cf, roughness: 0.4, metalness: 0.7 });
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Group();
    const m = new THREE.Mesh(spokeGeo, spokeMat);
    m.position.y = (CFG.wheelR - 0.05) / 2;
    sp.add(m);
    sp.rotation.x = (i / 8) * TAU;
    g.add(sp);
  }
  const hubGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.09, 8);
  const hub = new THREE.Mesh(hubGeo, spokeMat);
  hub.rotation.z = PI / 2; g.add(hub);
  return g;
}
function buildBicycle(scene) {
  const red = new THREE.MeshStandardMaterial({ color: 0xd23c2e, roughness: 0.42, metalness: 0.25, flatShading: true });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd7dde3, roughness: 0.3, metalness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.9, flatShading: true });
  const brown = new THREE.MeshStandardMaterial({ color: 0x7a4e2d, roughness: 0.95, flatShading: true });
  const wicker = new THREE.MeshStandardMaterial({ color: 0xc89b6a, roughness: 1.0, flatShading: true });

  const bike = new THREE.Group();
  BIKE.root = bike;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const BB = V(0, 0.34, 0);
  const seatTop = V(0, 0.98, 0.30);
  const headTop = V(0, 0.94, -0.36);
  const headBot = V(0, 0.64, -0.42);
  const rearAxle = V(0, CFG.wheelR, 0.46);
  const frontAxle = V(0, CFG.wheelR, -0.47);

  tubeBetween(BB, seatTop, 0.026, red, bike);                 // 座管
  tubeBetween(seatTop, headTop, 0.026, red, bike);            // 上管
  tubeBetween(BB, headBot, 0.028, red, bike);                 // 下管
  tubeBetween(headBot, headTop, 0.024, red, bike);            // 头管
  [-0.045, 0.045].forEach(x => {
    tubeBetween(V(x, CFG.wheelR, 0.46), V(x * 0.6, 0.95, 0.29), 0.014, red, bike); // 后叉上
    tubeBetween(V(x, CFG.wheelR, 0.46), V(x, 0.34, 0.0), 0.014, red, bike);        // 后叉下
    tubeBetween(V(x, 0.63, -0.42), V(x, CFG.wheelR, -0.47), 0.014, red, bike);     // 前叉
  });
  // 座垫
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.24), brown);
  seat.position.set(0, 1.0, 0.31); seat.castShadow = true; bike.add(seat);
  // 把立 + 车把
  tubeBetween(headTop, V(0, 1.06, -0.40), 0.02, chrome, bike);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 7), chrome);
  bar.rotation.z = PI / 2; bar.position.set(0, 1.06, -0.40); bar.castShadow = true; bike.add(bar);
  [-0.19, 0.19].forEach(x => {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 7), dark);
    grip.rotation.z = PI / 2; grip.position.set(x, 1.06, -0.40); bike.add(grip);
  });
  // 车铃
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.3, metalness: 0.7 }));
  bell.position.set(0.09, 1.09, -0.40); bike.add(bell);
  BIKE.bellMesh = bell;
  // 车筐
  const basket = new THREE.Group();
  const bw = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.20, 0.24), new THREE.MeshStandardMaterial({ color: 0xc89b6a, roughness: 1, wireframe: true }));
  const bb2 = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.03, 0.24), wicker);
  bb2.position.y = -0.09;
  basket.add(bw); basket.add(bb2);
  basket.position.set(0, 0.88, -0.55);
  bike.add(basket);
  // 轮
  BIKE.wheelRear = buildWheel(); BIKE.wheelRear.position.copy(rearAxle); bike.add(BIKE.wheelRear);
  BIKE.wheelFront = buildWheel(); BIKE.wheelFront.position.copy(frontAxle); bike.add(BIKE.wheelFront);
  // 曲柄组
  const crank = new THREE.Group(); crank.position.copy(BB); bike.add(crank);
  BIKE.crank = crank;
  const ringGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.012, 16);
  const ring = new THREE.Mesh(ringGeo, chrome); ring.rotation.z = PI / 2; ring.position.x = 0.10; crank.add(ring);
  const armGeo = new THREE.BoxGeometry(0.022, CFG.crankR, 0.016);
  const pedalGeo = new THREE.BoxGeometry(0.09, 0.02, 0.10);
  BIKE.pedals = [];
  [0, PI].forEach((a, idx) => {
    const armG = new THREE.Group();
    const arm = new THREE.Mesh(armGeo, dark); arm.position.y = -CFG.crankR / 2; arm.castShadow = true;
    armG.add(arm);
    const pedal = new THREE.Mesh(pedalGeo, dark);
    pedal.position.set(idx === 0 ? 0.12 : -0.12, -CFG.crankR, 0);
    pedal.castShadow = true;
    armG.add(pedal);
    armG.position.x = idx === 0 ? 0.10 : -0.10;
    armG.rotation.x = a;
    crank.add(armG);
    BIKE.pedals.push(pedal);
  });
  // 链条
  const chainMat = new THREE.MeshStandardMaterial({ color: 0x555b62, roughness: 0.5, metalness: 0.6 });
  tubeBetween(V(0.10, 0.415, 0), V(0.10, 0.375, 0.45), 0.008, chainMat, bike, false);
  tubeBetween(V(0.10, 0.265, 0), V(0.10, 0.305, 0.45), 0.008, chainMat, bike, false);
  // 尾灯
  const tailLight = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff4030, emissive: 0x550000 }));
  tailLight.position.set(0, 0.93, 0.44);
  bike.add(tailLight);
  BIKE.tailLight = tailLight;

  scene.add(bike);
  BIKE.BB = BB;
  return bike;
}

/* ============================================================
   鹈鹕 · 全程序化角色
   头盔 / 墨镜 / 长喙+喉囊 / 翅膀 / 双腿IK踩踏板 / 红围巾(布料模拟)
   ============================================================ */
const PEL = {};
function buildPelican(bike) {
  const white = new THREE.MeshStandardMaterial({ color: 0xfdfbf2, roughness: 0.85, flatShading: true });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf2ecd8, roughness: 0.9, flatShading: true });
  const orange = new THREE.MeshStandardMaterial({ color: 0xff8c42, roughness: 0.7, flatShading: true });
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xffb62e, roughness: 0.55, flatShading: true });
  const pouchMat = new THREE.MeshStandardMaterial({ color: 0xffc862, roughness: 0.75, flatShading: true });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xffc300, roughness: 0.35, flatShading: true });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.4 });
  const scarfMat = new THREE.MeshStandardMaterial({ color: 0xd8382e, roughness: 0.9, side: THREE.DoubleSide, flatShading: true });
  PEL.mats = { white, cream, orange, scarfMat };

  const root = new THREE.Group();            // 挂在自行车上，随车身倾斜
  PEL.root = root;
  bike.add(root);

  const body = new THREE.Group();
  body.position.set(0, 1.28, 0.30);
  root.add(body);
  PEL.body = body;

  // 躯干
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.30, 12, 10), white);
  torso.scale.set(0.82, 0.88, 1.30);
  torso.castShadow = true;
  body.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), cream);
  belly.position.set(0, -0.10, -0.05); belly.scale.set(0.75, 0.8, 1.05);
  body.add(belly);
  // 尾羽
  for (let i = -1; i <= 1; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.30, 4), white);
    f.position.set(i * 0.07, 0.02, 0.40);
    f.rotation.x = PI / 2 + 0.55;
    f.castShadow = true;
    body.add(f);
  }

  // 脖子 + 头
  const neck = new THREE.Group();
  neck.position.set(0, 0.16, -0.22);
  body.add(neck);
  PEL.neck = neck;
  const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.105, 0.30, 8), white);
  neckMesh.position.set(0, 0.09, -0.11); neckMesh.rotation.x = 0.85;
  neckMesh.castShadow = true;
  neck.add(neckMesh);
  const head = new THREE.Group();
  head.position.set(0, 0.22, -0.28);
  neck.add(head);
  PEL.head = head;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 10), white);
  skull.scale.set(0.9, 0.95, 1.05); skull.castShadow = true;
  head.add(skull);
  // 眼睛
  [-1, 1].forEach(s => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    eye.position.set(s * 0.10, 0.045, -0.10);
    head.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), new THREE.MeshBasicMaterial({ color: 0x101418 }));
    pupil.position.set(s * 0.112, 0.045, -0.115);
    head.add(pupil);
    PEL['pupil' + (s < 0 ? 'L' : 'R')] = pupil;
  });
  // 上喙
  const beakUp = new THREE.Mesh(new THREE.ConeGeometry(0.058, 0.54, 6), beakMat);
  beakUp.rotation.x = -PI / 2 + 0.02;
  beakUp.scale.set(0.9, 1, 0.55);
  beakUp.position.set(0, 0.005, -0.30);
  beakUp.castShadow = true;
  head.add(beakUp);
  const hook = new THREE.Mesh(new THREE.SphereGeometry(0.020, 6, 5), beakMat);
  hook.position.set(0, -0.015, -0.565);
  head.add(hook);
  // 下喙 + 喉囊
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.04, -0.03);
  head.add(jaw);
  PEL.jaw = jaw;
  const beakLow = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.46, 6), beakMat);
  beakLow.rotation.x = -PI / 2 + 0.04;
  beakLow.scale.set(0.8, 1, 0.42);
  beakLow.position.set(0, -0.005, -0.26);
  jaw.add(beakLow);
  const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), pouchMat);
  pouch.position.set(0, -0.075, -0.12);
  pouch.scale.set(0.72, 0.62, 1.15);
  pouch.castShadow = true;
  jaw.add(pouch);
  PEL.pouch = pouch;
  // 头盔
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 8, 0, TAU, 0, PI * 0.52), helmetMat);
  helmet.position.set(0, 0.055, 0.01);
  helmet.castShadow = true;
  head.add(helmet);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.162, 0.170, 0.028, 12), helmetMat);
  brim.position.set(0, 0.055, 0.005);
  head.add(brim);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 5, 14), darkMat);
  strap.rotation.x = PI / 2 - 0.35; strap.position.set(0, -0.03, -0.02);
  head.add(strap);
  // 墨镜
  [-1, 1].forEach(s => {
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.048, 8, 6), new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.15, metalness: 0.4 }));
    lens.scale.set(1, 0.75, 0.5);
    lens.position.set(s * 0.085, 0.05, -0.135);
    head.add(lens);
  });
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.012), darkMat);
  bridge.position.set(0, 0.055, -0.145);
  head.add(bridge);

  // 翅膀（肩部枢轴 + 层叠羽毛）
  PEL.wings = [];
  [-1, 1].forEach(s => {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.22, 0.10, -0.02);
    body.add(shoulder);
    const wingInner = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), white);
    wingInner.scale.set(0.5, 0.65, 1.35);
    wingInner.position.set(s * 0.05, -0.06, 0.02);
    wingInner.castShadow = true;
    shoulder.add(wingInner);
    const featherG = new THREE.Group();
    featherG.position.set(s * 0.08, -0.10, 0.10);
    shoulder.add(featherG);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.34 - i * 0.05, 4), i === 0 ? white : cream);
      f.rotation.x = PI / 2 + 0.25;
      f.position.set(s * 0.02, -i * 0.015, 0.10 + i * 0.09);
      f.castShadow = true;
      featherG.add(f);
    }
    shoulder.userData.side = s;
    PEL.wings.push(shoulder);
  });

  // 双腿（IK：大腿+小腿+蹼足）
  PEL.legs = [];
  [-1, 1].forEach(s => {
    const thigh = new THREE.Group();
    root.add(thigh);
    const thighMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 1, 6), orange);
    thighMesh.position.y = -0.5;
    thighMesh.castShadow = true;
    thigh.add(thighMesh);
    const shin = new THREE.Group();
    thigh.add(shin);
    const shinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.032, 1, 6), orange);
    shinMesh.position.y = -0.5;
    shinMesh.castShadow = true;
    shin.add(shinMesh);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 7, 5), orange);
    foot.scale.set(1.2, 0.32, 1.6);
    shin.add(foot);
    PEL.legs.push({ side: s, thigh, thighMesh, shin, shinMesh, foot });
  });
  PEL.hipY = 1.10; PEL.hipZ = 0.30; PEL.hipX = 0.15;
  PEL.L1 = 0.46; PEL.L2 = 0.50;

  // 红围巾 ·  verlet 布料（8节点飘带）
  const N = 9;
  const pts = [];
  for (let i = 0; i < N; i++) pts.push({
    p: new THREE.Vector3(0, 1.62 - i * 0.012, 0.16 + i * 0.095),
    q: new THREE.Vector3(0, 1.62 - i * 0.012, 0.16 + i * 0.095),
  });
  const scarfGeo = new THREE.BufferGeometry();
  const scarfVerts = new Float32Array(N * 2 * 3);
  scarfGeo.setAttribute('position', new THREE.BufferAttribute(scarfVerts, 3));
  const scarfIdx = [];
  for (let i = 0; i < N - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    scarfIdx.push(a, b, c, b, d, c);
  }
  scarfGeo.setIndex(scarfIdx);
  const scarf = new THREE.Mesh(scarfGeo, scarfMat);
  scarf.frustumCulled = false;
  scarf.castShadow = true;
  PEL.scarfScene = new THREE.Group();
  PEL.scarfScene.add(scarf);
  PEL.scarf = { pts, geo: scarfGeo, mesh: scarf, segLen: 0.095, width: 0.075 };
  // 围颈一圈
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.035, 6, 12), scarfMat);
  collar.rotation.x = PI / 2 - 0.4;
  collar.position.set(0, 0.20, -0.05);
  PEL.body.add(collar);

  return root;
}

/* 2骨IK（YZ平面）：把大腿/小腿摆到脚踏目标 */
const _ikT = new THREE.Vector3();
function solveLeg(leg, hip, target) {
  const L1 = PEL.L1, L2 = PEL.L2;
  let dy = target.y - hip.y, dz = target.z - hip.z;
  let d = Math.hypot(dy, dz);
  const maxD = L1 + L2 - 0.001;
  if (d > maxD) { dy *= maxD / d; dz *= maxD / d; d = maxD; }
  d = Math.max(d, 0.05);
  const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const a = Math.acos(cosA);
  const uy = dy / d, uz = dz / d;
  // 两个候选膝盖方向，选更“朝前(-Z)”的
  const ky1 = uy * Math.cos(a) - uz * Math.sin(a), kz1 = uy * Math.sin(a) + uz * Math.cos(a);
  const ky2 = uy * Math.cos(a) + uz * Math.sin(a), kz2 = -uy * Math.sin(a) + uz * Math.cos(a);
  const useFirst = kz1 < kz2;
  const kneeY = hip.y + (useFirst ? ky1 : ky2) * L1;
  const kneeZ = hip.z + (useFirst ? kz1 : kz2) * L1;
  // 大腿
  const tdy = kneeY - hip.y, tdz = kneeZ - hip.z;
  const tl = Math.hypot(tdy, tdz);
  leg.thigh.position.set(hip.x, hip.y, hip.z);
  leg.thigh.rotation.x = Math.atan2(-tdz / tl, -tdy / tl);
  leg.thighMesh.scale.y = tl;
  // 小腿（shin 挂在大腿组内，先放到膝盖）
  const sdy = target.y - kneeY - 0.0, sdz = target.z - kneeZ - 0.0;
  const sl = Math.max(0.05, Math.hypot(sdy, sdz));
  const absShin = Math.atan2(-sdz / sl, -sdy / sl);
  leg.shin.position.set(0, -tl, 0);           // 大腿组局部：膝盖在 -Y * tl
  leg.shin.rotation.x = absShin - leg.thigh.rotation.x;
  leg.shinMesh.scale.y = sl;
  leg.foot.position.set(0, -sl, 0.02);
  leg.foot.rotation.x = -(leg.thigh.rotation.x + leg.shin.rotation.x) + 0.15;
}

/* 围巾布料模拟（世界空间 verlet） */
const _sv = new THREE.Vector3(), _sv2 = new THREE.Vector3(), _sv3 = new THREE.Vector3();
function updateScarf(dt, t) {
  const sc = PEL.scarf;
  if (!sc) return;
  dt = Math.min(dt, 0.045);
  // 锚点：脖子根部世界坐标
  PEL.neck.updateWorldMatrix(true, false);
  _sv.set(0, 0.16, 0.10).applyMatrix4(PEL.neck.matrixWorld);
  const pts = sc.pts;
  if (!sc.inited) {                       // 首帧：全链贴到锚点，避免初始拉伸瞬态
    for (const pt of pts) { pt.p.copy(_sv); pt.q.copy(_sv); }
    sc.inited = true;
  }
  pts[0].p.copy(_sv); pts[0].q.copy(_sv);
  const wind = clamp(S.speed / CFG.maxSpeed, 0, 1);
  for (let i = 1; i < pts.length; i++) {
    const pt = pts[i];
    _sv2.subVectors(pt.p, pt.q).multiplyScalar(0.985); // 阻尼
    pt.q.copy(pt.p);
    pt.p.add(_sv2);
    pt.p.y -= 3.2 * dt * dt;                            // 重力
    pt.p.z += (5.0 + wind * 34) * dt * dt;              // 向后(+Z)风
    pt.p.x += Math.sin(t * 7 + i * 0.8) * wind * 0.6 * dt * dt; // 抖动
    pt.p.y += Math.sin(t * 9 + i * 0.6) * wind * 1.4 * dt * dt;
  }
  // 身体碰撞：把节点推出躯干椭球
  PEL.body.updateWorldMatrix(true, false);
  const bcx = PEL.body.matrixWorld.elements[12], bcy = PEL.body.matrixWorld.elements[13], bcz = PEL.body.matrixWorld.elements[14];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i].p;
    const dx = p.x - bcx, dy = (p.y - bcy) / 0.9, dz = (p.z - bcz) / 1.3;
    const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const R = 0.40;
    if (dd < R && dd > 1e-4) {
      const push = Math.min((R - dd) / dd, 0.25);   // 每帧最多推 25%，防弹射
      p.x += dx * push; p.y += dy * push * 0.9; p.z += dz * push * 1.3;
    }
    if (p.y < 0.3) p.y = 0.3;
  }
  for (let iter = 0; iter < 6; iter++) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      _sv3.subVectors(b.p, a.p);
      const dist = Math.max(1e-5, _sv3.length());
      const diff = (dist - sc.segLen) / dist;
      if (i === 0) b.p.addScaledVector(_sv3, -diff);
      else { a.p.addScaledVector(_sv3, diff * 0.5); b.p.addScaledVector(_sv3, -diff * 0.5); }
    }
  }
  // 写回飘带顶点
  const pos = sc.geo.attributes.position.array;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i].p;
    const w = sc.width * (1 - i / pts.length * 0.55);
    pos[i * 6 + 0] = p.x - w; pos[i * 6 + 1] = p.y; pos[i * 6 + 2] = p.z;
    pos[i * 6 + 3] = p.x + w; pos[i * 6 + 4] = p.y; pos[i * 6 + 5] = p.z;
  }
  sc.geo.attributes.position.needsUpdate = true;
  sc.geo.computeVertexNormals();
}

/* ============================================================
   跳鱼 · 海里跃出抛物线，路过时鹈鹕伸喙可抓
   ============================================================ */
const FISH = { items: [], timer: 3 };
function makeFishMesh() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), MAT.fish);
  body.scale.set(0.6, 0.75, 1.8);
  g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 4), MAT.fish);
  tail.rotation.x = PI / 2; tail.position.z = 0.20;
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 4), MAT.fish);
  fin.position.y = 0.08; fin.rotation.x = -0.3;
  g.add(fin);
  return g;
}
function buildFish(scene) {
  for (let i = 0; i < 4; i++) {
    const m = makeFishMesh();
    m.visible = false;
    scene.add(m);
    FISH.items.push({ m, active: false, t: 0, dur: 1, x0: 0, x1: 0, y0: 0, h: 0, z: 0 });
  }
}
function spawnFish() {
  const f = FISH.items.find(f => !f.active);
  if (!f) return;
  f.active = true; f.t = 0;
  f.dur = rand(1.1, 1.5);
  f.z = -(rand(24, 55));                    // 在自行车前方远处入水点
  f.x0 = -CFG.roadWidth / 2 - rand(4, 9);   // 从海面
  const dir = Math.random() < 0.5 ? 1 : -1;
  f.x1 = f.x0 + dir * rand(3, 6);           // 横向漂移
  f.h = rand(1.2, 2.6);                     // 跳跃高度
  f.y0 = -1.2;
  f.m.visible = true;
}
function updateFish(dt) {
  FISH.timer -= dt * (0.6 + S.speed / CFG.maxSpeed);
  if (FISH.timer <= 0 && S.speed > 2) { spawnFish(); FISH.timer = rand(2.5, 5.5); }
  for (const f of FISH.items) {
    if (!f.active) continue;
    f.t += dt / f.dur;
    f.m.position.z += S.speed * dt;         // 世界向玩家移动
    if (f.t >= 1 || f.m.position.z > 8) {
      if (f.t < 1) {} // 被错过
      f.active = false; f.m.visible = false;
      continue;
    }
    const t = f.t;
    const x = lerp(f.x0, f.x1, t);
    const y = f.y0 + f.h * 4 * t * (1 - t);
    f.m.position.x = x + curveX(S.dist - f.m.position.z); // 跟随路弯
    f.m.position.y = y;
    f.m.rotation.x = -Math.atan2(f.h * 4 * (1 - 2 * t), (f.x1 - f.x0) / Math.max(0.001, f.dur)) * 0.7;
    f.m.rotation.z = t * 9;
    // 抓捕判定：鱼靠近路缘且与鹈鹕同一瞬间
    if (t > 0.35 && t < 0.75 && f.m.position.z > -3.2 && f.m.position.z < 1.2 && y > 0.5 && y < 2.4) {
      f.active = false; f.m.visible = false;
      onCatchFish(f.m.position);
    }
  }
}
function onCatchFish(pos) {
  S.fishCaught++;
  PEL.gulpT = 1.0;
  AudioEngine.catchFish(); AudioEngine.splash();
  FX.splash(pos);
  FX.confetti(pos, 8, 0x7fb8d8);
  HUD.toast(`🐟 抓到第 ${S.fishCaught} 条鱼！`, 'catch');
  ACH.check('fish');
}

/* ============================================================
   粒子系统 · 尘土 / 水花 / 彩带 / 萤火虫(夜) / 速度线
   ============================================================ */
const FX = {
  pool: [], N: 240, geo: null, pts: null,
  fireflies: [], streaks: null, streakData: [],
  init(scene) {
    this.geo = new THREE.BufferGeometry();
    const pos = new Float32Array(this.N * 3);
    const col = new Float32Array(this.N * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
    this.pts = new THREE.Points(this.geo, mat);
    this.pts.frustumCulled = false;
    scene.add(this.pts);
    for (let i = 0; i < this.N; i++) this.pool.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, grav: 1 });
    // 萤火虫
    const ffGeo = new THREE.BufferGeometry();
    const ffPos = new Float32Array(40 * 3);
    ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
    this.ffMat = new THREE.PointsMaterial({ size: 0.09, color: 0xd8ff9a, transparent: true, opacity: 0, depthWrite: false });
    this.ff = new THREE.Points(ffGeo, this.ffMat);
    this.ff.frustumCulled = false;
    scene.add(this.ff);
    for (let i = 0; i < 40; i++) this.fireflies.push({ x: rand(4, 22), y: rand(0.3, 2.5), z: rand(-120, 20), ph: rand(0, TAU) });
    // 速度线
    const stGeo = new THREE.BufferGeometry();
    const stPos = new Float32Array(36 * 6);
    stGeo.setAttribute('position', new THREE.BufferAttribute(stPos, 3));
    this.stMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    this.streaks = new THREE.LineSegments(stGeo, this.stMat);
    this.streaks.frustumCulled = false;
    scene.add(this.streaks);
    for (let i = 0; i < 18; i++) this.streakData.push({ x: rand(-3, 3), y: rand(0.5, 2.8), z: rand(-30, 0) });
  },
  emit(x, y, z, vx, vy, vz, life, color, grav) {
    const p = this.pool.find(p => p.life <= 0);
    if (!p) return;
    p.life = life; p.maxLife = life;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    const c = new THREE.Color(color);
    p.r = c.r; p.g = c.g; p.b = c.b;
    p.grav = grav === undefined ? 1 : grav;
  },
  dust(x, y, z) {
    for (let i = 0; i < 2; i++) this.emit(x + rand(-0.15, 0.15), y + rand(0, 0.1), z + rand(0, 0.4), rand(-0.4, 0.4), rand(0.5, 1.6), rand(1, 3), rand(0.4, 0.9), 0xc9b895, 0.6);
  },
  splash(pos) {
    for (let i = 0; i < 14; i++) this.emit(pos.x, pos.y, pos.z, rand(-2, 2), rand(1, 4.5), rand(-2, 2), rand(0.35, 0.7), 0xbfe6f5, 1.4);
  },
  confetti(pos, n, color) {
    for (let i = 0; i < n; i++) this.emit(pos.x, pos.y + 0.3, pos.z, rand(-1.5, 1.5), rand(1.5, 4), rand(-1.5, 1.5), rand(0.5, 1.0), color || randPick([0xffd166, 0xef476f, 0x06d6a0, 0x118ab2]), 1.2);
  },
  update(dt, night, camQuat) {
    const pos = this.geo.attributes.position.array;
    const col = this.geo.attributes.color.array;
    for (let i = 0; i < this.N; i++) {
      const p = this.pool[i];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= 6 * p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt + S.speed * dt * 0.6;
        const a = clamp(p.life / p.maxLife, 0, 1);
        pos[i * 3] = p.x; pos[i * 3 + 1] = Math.max(0.02, p.y); pos[i * 3 + 2] = p.z;
        col[i * 3] = p.r * a; col[i * 3 + 1] = p.g * a; col[i * 3 + 2] = p.b * a;
      } else {
        pos[i * 3 + 1] = -50;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    // 萤火虫（夜里在右侧草丛）
    this.ffMat.opacity = damp(this.ffMat.opacity, night * 0.9, 2, dt);
    if (this.ffMat.opacity > 0.02) {
      const fp = this.ff.geometry.attributes.position.array;
      const t = performance.now() / 1000;
      for (let i = 0; i < this.fireflies.length; i++) {
        const f = this.fireflies[i];
        f.z += S.speed * dt;
        if (f.z > 20) { f.z = -120; f.x = rand(4, 22); }
        fp[i * 3] = f.x + Math.sin(t * 1.3 + f.ph) * 0.8 + curveX(S.dist - f.z);
        fp[i * 3 + 1] = f.y + Math.sin(t * 2.1 + f.ph * 2) * 0.35;
        fp[i * 3 + 2] = f.z;
      }
      this.ff.geometry.attributes.position.needsUpdate = true;
    }
    // 速度线
    const target = clamp((S.speed - 13) / (CFG.maxSpeed - 13), 0, 1) * 0.35;
    this.stMat.opacity = damp(this.stMat.opacity, S.reducedMotion ? 0 : target, 4, dt);
    if (this.stMat.opacity > 0.01) {
      const sp = this.streaks.geometry.attributes.position.array;
      for (let i = 0; i < this.streakData.length; i++) {
        const s = this.streakData[i];
        s.z += S.speed * dt * 2.4;
        if (s.z > 2) { s.z = rand(-34, -20); s.x = rand(-3.2, 3.2); s.y = rand(0.4, 3.0); }
        const len = 1.2 + S.speed * 0.12;
        sp[i * 6] = s.x; sp[i * 6 + 1] = s.y; sp[i * 6 + 2] = s.z;
        sp[i * 6 + 3] = s.x; sp[i * 6 + 4] = s.y; sp[i * 6 + 5] = s.z - len;
      }
      this.streaks.geometry.attributes.position.needsUpdate = true;
    }
  }
};

/* ============================================================
   相机系统 · 尾随 / 侧面跟拍 / 电影运镜 / 鹈鹕视角
   ============================================================ */
const CAM = {
  modes: ['尾随镜头', '侧面跟拍', '电影运镜', '鹈鹕视角'],
  pos: new THREE.Vector3(2.5, 2.6, 6.5),
  look: new THREE.Vector3(0, 1, 0),
  shakeT: 0,
  update(camera, dt, t, riderPos) {
    const sp = clamp(S.speed / CFG.maxSpeed, 0, 1);
    const curveOff = curveDX(S.dist) * 14;      // 过弯侧移
    let tp = _camT1, tl = _camT2;
    const mode = S.camMode;
    if (mode === 0) {          // 尾随
      const portrait = camera.aspect < 0.85;
      tp.set(portrait ? riderPos.x + 0.4 : riderPos.x * 0.7 + 1.35 + curveOff * 0.4,
        2.5 + sp * 0.35, riderPos.z + (portrait ? 7 : 5.6) - sp * 0.9);
      // 窄屏以骑手为取景中心，不沿用横屏看向前方六米的偏置。
      tl.set(portrait ? riderPos.x : riderPos.x * 0.8, 1.15, riderPos.z - (portrait ? 0.8 : 6));
    } else if (mode === 1) {   // 侧面
      const side = Math.sin(t * 0.12) > 0 ? 1 : -1;
      tp.set(riderPos.x + side * (4.6 - sp * 1.0), 1.65 + Math.sin(t * 0.4) * 0.25, riderPos.z + 0.4);
      tl.set(riderPos.x, 1.15, riderPos.z - 0.4);
    } else if (mode === 2) {   // 电影：慢速环绕+低角度
      const a = t * 0.16;
      tp.set(riderPos.x + Math.cos(a) * 6.2, 1.1 + (Math.sin(t * 0.23) * 0.5 + 0.5) * 2.6, riderPos.z + Math.sin(a) * 6.2);
      tl.set(riderPos.x, 1.2, riderPos.z);
    } else {                   // 鹈鹕视角
      if (PEL.head) {
        PEL.head.updateWorldMatrix(true, false);
        tp.set(0, 0.10, -0.30).applyMatrix4(PEL.head.matrixWorld);
        tl.copy(riderPos).add(_camT3.set(S.steer * 4, 0.4, -18));
      }
    }
    const k = mode === 3 ? 22 : 3.2;
    this.pos.x = damp(this.pos.x, tp.x, k, dt);
    this.pos.y = damp(this.pos.y, tp.y, k, dt);
    this.pos.z = damp(this.pos.z, tp.z, k, dt);
    this.look.x = damp(this.look.x, tl.x, 6, dt);
    this.look.y = damp(this.look.y, tl.y, 6, dt);
    this.look.z = damp(this.look.z, tl.z, 6, dt);
    // 高速微震
    let sx = 0, sy = 0;
    if (!S.reducedMotion && S.speed > 14) {
      const amp = (S.speed - 14) * 0.004;
      sx = noise1(t * 31) * amp; sy = noise1(t * 29 + 9) * amp;
    }
    camera.position.set(this.pos.x + sx, this.pos.y + sy, this.pos.z);
    camera.lookAt(this.look);
    camera.fov = damp(camera.fov, 62 + sp * 14, 3, dt);
    camera.updateProjectionMatrix();
  },
  next() {
    S.camMode = (S.camMode + 1) % 4;
    S.camUserT = 0;
    HUD.toast(`🎥 ${CAM.modes[S.camMode]}`, 'cam');
    ACH.check('camera');
  }
};
const _camT1 = new THREE.Vector3(), _camT2 = new THREE.Vector3(), _camT3 = new THREE.Vector3();

/* ============================================================
   HUD · DOM 覆盖层
   ============================================================ */
const HUD = {
  el: {}, toastQueue: [], toastActive: 0,
  init() {
    ['speed', 'dist', 'fish', 'fps', 'best', 'camName', 'toasts', 'help', 'touchUI', 'startScreen', 'startBtn', 'bar', 'tipBox', 'muteBtn', 'pauseVeil', 'qualityTag', 'loadLabel'].forEach(id => this.el[id] = document.getElementById(id));
    this.el.best.textContent = S.best > 0 ? `最佳 ${(S.best / 1000).toFixed(2)} km` : '';
    this.tips = [
      'W/↑ 加速 · S/↓ 刹车 · A/D 变道',
      '空格 跳一下 · T 抬头展翅炫技',
      'B 按车铃 · C 换镜头 · M 静音',
      '路过跳鱼时保持同侧，鹈鹕会伸喙抓鱼',
      '从黄昏骑到星空，路灯会自动点亮',
      '不操作 20 秒，鹈鹕进入自动驾驶',
    ];
    this.tipIdx = 0;
    setInterval(() => {
      if (S.started) return;
      this.tipIdx = (this.tipIdx + 1) % this.tips.length;
      if (this.el.tipBox) this.el.tipBox.textContent = this.tips[this.tipIdx];
    }, 3200);
    if (this.el.tipBox) this.el.tipBox.textContent = this.tips[0];
  },
  toast(text, kind) {
    this.toastQueue.push({ text, kind });
  },
  _showToast(t) {
    const div = document.createElement('div');
    div.className = 'toast ' + (t.kind || '');
    div.textContent = t.text;
    this.el.toasts.appendChild(div);
    requestAnimationFrame(() => div.classList.add('show'));
    setTimeout(() => { div.classList.remove('show'); setTimeout(() => div.remove(), 400); }, 2600);
  },
  update(dt) {
    this.toastActive -= dt;
    if (this.toastActive <= 0 && this.toastQueue.length) {
      this.toastActive = 0.9;
      this._showToast(this.toastQueue.shift());
    }
    this.el.speed.textContent = Math.round(S.speed * 3.6);
    this.el.dist.textContent = (S.dist / 1000).toFixed(2);
    this.el.fish.textContent = S.fishCaught;
    this.el.camName.textContent = CAM.modes[S.camMode];
    this.el.qualityTag.textContent = ['画质·低', '画质·中', '画质·高'][S.quality];
  }
};

/* ============================================================
   成就系统
   ============================================================ */
const ACH = {
  defs: [
    { id: 'start',   name: '🚴 出发！', desc: '开始骑行' },
    { id: 'fish1',   name: '🐟 第一条鱼', desc: '抓到 1 条鱼' },
    { id: 'fish10',  name: '🎣 捕鱼达人', desc: '抓到 10 条鱼' },
    { id: 'fish25',  name: '🏆 海岸渔夫', desc: '抓到 25 条鱼' },
    { id: 'speed',   name: '💨 风驰电掣', desc: '时速超过 60 km/h' },
    { id: 'jump5',   name: '🐇 蹦蹦跳跳', desc: '跳跃 5 次' },
    { id: 'trick',   name: '🪽 展翅高飞', desc: '完成一次炫技' },
    { id: 'bell5',   name: '🔔 叮铃铃', desc: '按 5 次车铃' },
    { id: 'night',   name: '🌙 夜骑者', desc: '骑进星光月夜' },
    { id: 'day',     name: '☀️ 迎朝阳', desc: '见证一次日出' },
    { id: 'km1',     name: '🛣️ 一公里', desc: '骑行 1 km' },
    { id: 'km5',     name: '🗺️ 五公里', desc: '骑行 5 km' },
    { id: 'auto',    name: '🤖 自动驾驶', desc: '放手骑 200 m' },
    { id: 'cams',    name: '🎥 导演视角', desc: '看过全部镜头' },
    { id: 'minute',  name: '⏱️ 老骑手', desc: '连续骑行 2 分钟' },
  ],
  got: {}, camSeen: { 0: true },
  init() { this.defs.forEach(d => this.got[d.id] = false); },
  unlock(id) {
    if (this.got[id]) return;
    this.got[id] = true;
    const d = this.defs.find(x => x.id === id);
    HUD.toast(`成就解锁 · ${d.name}`, 'ach');
    AudioEngine.achievement();
    if (PEL.root) FX.confetti(_achV.set(0, 2, 0).add(PEL.root.position), 14);
  },
  check(evt) {
    if (evt === 'fish') {
      if (S.fishCaught >= 1) this.unlock('fish1');
      if (S.fishCaught >= 10) this.unlock('fish10');
      if (S.fishCaught >= 25) this.unlock('fish25');
    }
    if (evt === 'camera') {
      this.camSeen[S.camMode] = true;
      if (Object.keys(this.camSeen).length >= 4) this.unlock('cams');
    }
    if (evt === 'trick') this.unlock('trick');
  },
  tick() {
    if (S.speed * 3.6 > 60) this.unlock('speed');
    if (S.jumpCount >= 5) this.unlock('jump5');
    if (S.bellCount >= 5) this.unlock('bell5');
    if (S.dist > 1000) this.unlock('km1');
    if (S.dist > 5000) this.unlock('km5');
    if (S.rideTime > 120) this.unlock('minute');
    if (S.autoDist > 200) this.unlock('auto');
    if (S.dayT > 0.93 || S.dayT < 0.05) this.unlock('night');
    if (S.dayT > 0.22 && S.dayT < 0.30) this.unlock('day');
  }
};
const _achV = new THREE.Vector3();

/* ============================================================
   昼夜循环 · 调色板随太阳高度渐变
   ============================================================ */
const PAL = {
  stops: [
    { e: -0.55, top: 0x070d20, mid: 0x101a33, bot: 0x182542, sun: 0x8fb0e8, fog: 0x101a33, hemi: 0x24304f, ground: 0x0e1420, star: 1.0, glint: 0.15 },
    { e: -0.10, top: 0x1c2a52, mid: 0x8e4a63, bot: 0xd06a4e, sun: 0xff9e66, fog: 0x5a3550, hemi: 0x4a3a58, ground: 0x2a2030, star: 0.35, glint: 0.8 },
    { e:  0.08, top: 0x3a5f9e, mid: 0xe08154, bot: 0xf7b267, sun: 0xffc98a, fog: 0xc08868, hemi: 0x9a7a68, ground: 0x6a5038, star: 0.0, glint: 1.3 },
    { e:  0.35, top: 0x4a90d9, mid: 0x87bfe8, bot: 0xd8ecf7, sun: 0xfff3dc, fog: 0xa8d0e8, hemi: 0xbfd8ea, ground: 0x7a9a6a, star: 0.0, glint: 0.9 },
    { e:  0.90, top: 0x3f88d8, mid: 0x8ec9f0, bot: 0xe2f2fa, sun: 0xffffff, fog: 0xb0d8ee, hemi: 0xcfe4f2, ground: 0x8aa870, star: 0.0, glint: 0.8 },
  ],
  _a: {}, out: {},
  get(elev) {
    const st = this.stops;
    let i = 0;
    while (i < st.length - 2 && elev > st[i + 1].e) i++;
    const a = st[i], b = st[i + 1];
    const t = smoothstep(a.e, b.e, elev);
    const mix = (ka, kb) => new THREE.Color(ka).lerp(new THREE.Color(kb), t);
    const o = this.out;
    o.top = mix(a.top, b.top); o.mid = mix(a.mid, b.mid); o.bot = mix(a.bot, b.bot);
    o.sun = mix(a.sun, b.sun); o.fog = mix(a.fog, b.fog);
    o.hemi = mix(a.hemi, b.hemi); o.ground = mix(a.ground, b.ground);
    o.star = lerp(a.star, b.star, t); o.glint = lerp(a.glint, b.glint, t);
    return o;
  }
};

/* ============================================================
   主程序
   ============================================================ */
let renderer, scene, camera, sunLight, moonLight, hemiLight, skyMesh, oceanMesh;
let lastT = 0, gullCryT = 8, fpsWindow = 0, fpsFrames = 0;

function updateDayCycle(dt) {
  S.dayT = mod(S.dayT + dt / CFG.dayLength, 1);
  const sunAngle = (S.dayT - 0.25) * TAU;
  const elev = Math.sin(sunAngle);
  const pal = PAL.get(elev);
  // 太阳/月亮方向（太阳从海面落下 = -X）
  const sx = Math.cos(sunAngle), sy = elev, sz = -0.38;
  _sv.set(sx, sy, sz).normalize();
  SKY_UNI.sunDir.value.copy(_sv);
  SKY_UNI.topColor.value.copy(pal.top);
  SKY_UNI.midColor.value.copy(pal.mid);
  SKY_UNI.botColor.value.copy(pal.bot);
  SKY_UNI.starAlpha.value = pal.star;
  const dayness = smoothstep(-0.06, 0.25, elev);
  const duskness = (1 - Math.abs(clamp(elev, -0.1, 0.3) / 0.3)) * dayness;
  SKY_UNI.sunColor.value.copy(pal.sun);
  SKY_UNI.sunIntensity.value = elev > -0.06 ? (0.5 + duskness * 0.9) : 0.0;
  // 平行光（太阳）
  sunLight.position.copy(_sv).multiplyScalar(80).add(_sv2.set(0, 0, 0));
  sunLight.target.position.set(0, 0, 0);
  sunLight.color.copy(pal.sun);
  sunLight.intensity = smoothstep(-0.04, 0.12, elev) * 0.75 + Math.max(0, elev) * 2.1;
  sunLight.visible = elev > -0.02;
  // 月光
  moonLight.intensity = clamp(-elev, 0, 1) * 0.20;
  moonLight.visible = elev < 0.02;
  // 半球光
  hemiLight.color.copy(pal.hemi);
  hemiLight.groundColor.copy(pal.ground);
  hemiLight.intensity = 0.48 + dayness * 0.55;
  // 雾
  scene.fog.color.copy(pal.fog);
  scene.fog.near = 55; scene.fog.far = lerp(230, 420, dayness);
  if (renderer) renderer.setClearColor(pal.fog);
  // 海洋
  OCEAN_UNI.uSunDir.value.copy(_sv);
  OCEAN_UNI.uSunColor.value.copy(pal.sun);
  OCEAN_UNI.uSkyColor.value.copy(pal.mid).lerp(pal.bot, 0.5);
  OCEAN_UNI.uSunGlint.value = pal.glint * (elev > -0.06 ? 1 : 0.25);
  OCEAN_UNI.fogColor.value.copy(pal.fog);
  OCEAN_UNI.fogNear.value = 60; OCEAN_UNI.fogFar.value = lerp(230, 420, dayness);
  // 云颜色
  MAT.cloud.color.copy(pal.bot).lerp(new THREE.Color(0xffffff), 0.12 + 0.72 * dayness);
  MAT.cloud.opacity = 0.55 + dayness * 0.37;
  // 路灯（天黑点亮）
  const night = smoothstep(0.10, -0.08, elev);
  for (const it of LAMPS.items) {
    it.headMat.emissive.setRGB(night * 1.0, night * 0.78, night * 0.38);
    if (it.glowMat) it.glowMat.opacity = night * 1.0;
  }
  for (const pl of LAMPS.lights) pl.intensity = night * 1.4;
  BIKE.tailLight.material.emissive.setRGB(0.35 + night * 0.65, 0.02, 0.02);
  return { elev, pal, night };
}

/* ---------- 世界滚动与回收 ---------- */
function scrollWorld(dt) {
  const dist = S.dist;
  // 路段
  const segLen = CFG.segLen, count = CFG.segCount;
  const base = Math.floor(dist / segLen);
  for (let i = 0; i < count; i++) {
    const idx = base - 2 + i;
    const z = -(idx * segLen - dist);
    const g = ROAD.segs[i].g;
    const d = dist - z;
    g.position.set(curveX(d), 0, z);
    g.rotation.y = Math.atan(curveDX(d));
  }
  const spanAll = CFG.spawnAhead + CFG.recycleBehind;
  // 护栏（右侧悬崖边）
  for (const it of RAILS.items) {
    let z = -(it.d - dist);
    if (z > CFG.recycleBehind) { it.d += spanAll; z = -(it.d - dist); }
    it.g.position.set(curveX(it.d) + CFG.roadWidth / 2 + 0.55, 0, z);
    it.g.rotation.y = Math.atan(curveDX(it.d));
  }
  // 路灯（左侧）
  for (const it of LAMPS.items) {
    let z = -(it.d - dist);
    if (z > CFG.recycleBehind) { it.d += spanAll; z = -(it.d - dist); }
    it.g.position.set(curveX(it.d) - CFG.roadWidth / 2 - 1.2, 0, z);
    it.g.rotation.y = Math.atan(curveDX(it.d));
  }
  // 棕榈
  for (const it of PALMS.items) {
    let z = -(it.d - dist);
    if (z > CFG.recycleBehind) { it.d += spanAll; it.seed = hash1(it.d * 0.37); z = -(it.d - dist); }
    const side = it.seed > 0.72 ? -1 : 1;
    const off = side > 0 ? CFG.roadWidth / 2 + 2.5 + it.seed * 9 : -CFG.roadWidth / 2 - 3 - it.seed * 4;
    it.g.position.set(curveX(it.d) + off, 0, z);
    it.g.rotation.y = it.seed * TAU;
    it.g.userData.leaves.rotation.y = performance.now() / 1000 * 0.15 + it.seed * 3;
  }
  // 草
  for (const it of PROPS.grass) {
    let z = -(it.d - dist);
    if (z > CFG.recycleBehind) { it.d += spanAll; it.seed = hash1(it.d * 1.7); z = -(it.d - dist); }
    const side = it.seed > 0.85 ? -1 : 1;
    const off = side > 0 ? CFG.roadWidth / 2 + 1.5 + it.seed * 12 : -CFG.roadWidth / 2 - 1.2 - it.seed * 3;
    it.m.position.set(curveX(it.d) + off, 0.1, z);
    it.m.rotation.y = it.seed * TAU;
    const s = 0.7 + it.seed * 0.9;
    it.m.scale.set(s, s, s);
    it.m.rotation.z = Math.sin(performance.now() / 900 + it.seed * 9) * 0.12 * clamp(S.speed / 8, 0.3, 1);
  }
  // 礁石（沙滩上+海里近岸）
  for (const it of PROPS.rocks) {
    let z = -(it.d - dist);
    if (z > CFG.recycleBehind) { it.d += spanAll; it.seed = hash1(it.d * 2.3); z = -(it.d - dist); }
    const inSea = it.seed > 0.6;
    const off = inSea ? -CFG.roadWidth / 2 - 16 - it.seed * 14 : -CFG.roadWidth / 2 - 3.5 - it.seed * 6;
    it.m.position.set(curveX(it.d) + off, inSea ? -1.3 + it.seed * 0.6 : -0.15, z);
    it.m.rotation.set(it.seed * 3, it.seed * 7, it.seed * 5);
    const s = 0.5 + it.seed * 1.8;
    it.m.scale.set(s, s * (0.6 + it.seed * 0.5), s);
  }
  // 路牌
  for (const it of PROPS.signs) {
    let z = -(it.d - dist);
    if (z > CFG.recycleBehind) { it.d += spanAll * 2; z = -(it.d - dist); }
    it.g.position.set(curveX(it.d) + CFG.roadWidth / 2 + 1.6, 0, z);
    it.g.rotation.y = Math.atan(curveDX(it.d)) + PI;
  }
  // 云
  for (const c of CLOUDS.items) {
    c.position.x += c.userData.v * dt;
    c.position.z += S.speed * dt * 0.04;
    if (c.position.x > 190) c.position.x = -190;
    if (c.position.z > 80) c.position.z = -420;
  }
  // 海鸥
  const t = performance.now() / 1000;
  for (const g of GULLS.items) {
    const u = g.userData;
    u.cz += S.speed * dt * 0.25;
    if (u.cz > 60) u.cz = -260;
    const a = t * u.w + u.phase;
    g.position.set(u.cx + Math.cos(a) * u.r + curveX(dist - u.cz) * 0.4, 9 + Math.sin(t * 0.7 + u.phase) * 2.5 + u.r * 0.4, u.cz + Math.sin(a) * u.r);
    g.rotation.y = -a - (u.w > 0 ? 0 : PI);
    const flap = Math.sin(t * 9 + u.phase) * 0.55;
    u.wl.rotation.z = flap; u.wr.rotation.z = -flap;
  }
}

/* ---------- 鹈鹕姿态 ---------- */
function updatePelican(dt, t) {
  const crank = S.crankAngle;
  const bob = Math.sin(crank * 2) * 0.018 * S.pedaling;
  PEL.body.position.y = 1.28 + bob;
  // 身体随转弯倾斜由 root 承担；身体反向补偿一点点更自然
  PEL.body.rotation.z = -S.lean * 0.15;
  PEL.body.rotation.x = S.pedaling * 0.06 + (S.trickT > 0 ? -0.18 : 0);
  // 头部：正常看路，偶尔回头看镜头；转弯时提前看向弯内
  let lookY = Math.sin(t * 0.45) * 0.28 - S.steer * 0.55;
  const cycleT = mod(t, 17);
  if (cycleT > 14.2 && cycleT < 16.0) lookY = 2.4 + Math.sin((cycleT - 14.2) / 1.8 * PI) * 0.5;
  PEL.head.rotation.y = damp(PEL.head.rotation.y, lookY, 4, dt);
  PEL.head.rotation.x = Math.sin(t * 0.8) * 0.05 + (S.trickT > 0 ? -0.25 : 0.08);
  PEL.neck.rotation.x = Math.sin(crank * 2 + 1) * 0.02 * S.pedaling;
  // 喉囊：抓到鱼时鼓动
  PEL.gulpT = Math.max(0, (PEL.gulpT || 0) - dt * 1.4);
  const gulp = PEL.gulpT > 0 ? Math.sin(PEL.gulpT * PI) : 0;
  PEL.pouch.scale.set(0.72 * (1 + gulp * 0.6), 0.62 * (1 + gulp * 1.0), 1.15 * (1 + gulp * 0.5));
  PEL.jaw.rotation.x = gulp * 0.35 + Math.max(0, Math.sin(crank - 0.6)) * 0.03;
  // 翅膀：平时收拢微动；跳跃/炫技时张开扇动
  const spread = (S.trickT > 0 || !S.grounded) ? 1 : 0;
  for (const w of PEL.wings) {
    const s = w.userData.side;
    const flap = Math.sin(t * 16) * 0.35 * spread;
    const target = spread * (s * (1.05 + flap)) + (1 - spread) * (s * 0.10 + Math.sin(t * 2.1 + s) * 0.035);
    w.rotation.z = damp(w.rotation.z, target, 10, dt);
    w.rotation.x = damp(w.rotation.x, spread * -0.25, 8, dt);
  }
  // 双腿IK → 脚踏
  const a = S.crankAngle;
  for (const leg of PEL.legs) {
    const phase = a + (leg.side > 0 ? 0 : PI);
    const px = leg.side * 0.12;
    const py = 0.34 + Math.cos(phase) * CFG.crankR + 0.02;
    const pz = Math.sin(phase) * CFG.crankR;
    solveLeg(leg, _sv3.set(leg.side * PEL.hipX, PEL.hipY, PEL.hipZ), _ikT.set(px, py, pz));
  }
  // 围巾
  PEL.scarfScene.position.set(0, 0, 0);
  updateScarf(dt, t);
}

/* ---------- 玩法 ---------- */
function updateGameplay(dt, t) {
  refreshInput();
  // 自动驾驶判定
  S.idleT += dt;
  if (!S.autoPilot && S.idleT > 20 && S.speed > 2) {
    S.autoPilot = true;
    HUD.toast('🤖 自动驾驶中 · 按任意键接管', 'auto');
  }
  if (S.autoPilot) S.autoDist += S.speed * dt;
  // 速度
  if (INPUT.up) { S.speed += CFG.accel * dt; }
  else if (INPUT.down) { S.speed -= CFG.brake * dt; }
  else {
    const cruise = S.autoPilot ? CFG.cruiseSpeed : S.targetCruise;
    S.speed += clamp(cruise - S.speed, -CFG.drag * 8 * dt, CFG.drag * 8 * dt);
  }
  S.speed = clamp(S.speed, 0, CFG.maxSpeed);
  S.dist += S.speed * dt;
  S.rideTime += dt;
  if (S.dist > S.best) { S.best = S.dist; HUD.el.best.textContent = `最佳 ${(S.best / 1000).toFixed(2)} km`; }
  // 转向/变道
  // 车道 +X 是骑手右侧；键盘和触屏共用这个方向约定。
  const steerIn = (INPUT.right ? 1 : 0) - (INPUT.left ? 1 : 0);
  S.steer = damp(S.steer, S.autoPilot ? 0 : steerIn, 8, dt);
  S.lane = clamp(S.lane + S.steer * CFG.steerSpeed * dt * clamp(S.speed / 6, 0.35, 1), -CFG.laneLimit, CFG.laneLimit);
  if (S.autoPilot) S.lane = damp(S.lane, 1.3, 1.2, dt);
  S.lean = damp(S.lean, S.steer * clamp(S.speed / 10, 0, 1), 6, dt);
  // 跳跃物理
  if (!S.grounded) {
    S.vy -= CFG.gravity * dt;
    S.airY += S.vy * dt;
    if (S.airY <= 0) {
      S.airY = 0; S.grounded = true; S.vy = 0;
      AudioEngine.land();
      FX.dust(BIKE.root.position.x, 0.1, BIKE.root.position.z);
    }
  }
  // 炫技计时
  if (S.trickT > 0) S.trickT -= dt;
  // 踩踏
  S.pedaling = damp(S.pedaling, INPUT.down ? 0.15 : (S.speed > 0.4 ? 1 : 0), 4, dt);
  const wheelAng = S.speed / CFG.wheelR;
  S.crankAngle += wheelAng / CFG.gearRatio * dt * S.pedaling;
  // 自行车姿态
  const rootX = curveX(S.dist) + S.lane;
  BIKE.root.position.set(rootX, S.airY, 0);
  BIKE.root.rotation.z = -S.lean * 0.32;
  BIKE.root.rotation.y = Math.atan(curveDX(S.dist)) - S.steer * 0.12;
  BIKE.root.rotation.x = S.trickT > 0 ? Math.sin(Math.min(1, (1.2 - S.trickT)) * PI) * 0.38 : 0;
  // 车轮/曲柄/链条
  BIKE.wheelRear.rotation.x += wheelAng * dt;
  BIKE.wheelFront.rotation.x += wheelAng * dt;
  BIKE.crank.rotation.x = S.crankAngle;
  BIKE.bellMesh.scale.setScalar(S.bellT > 0 ? 1 + Math.sin(S.bellT * 40) * 0.15 : 1);
  S.bellT = Math.max(0, S.bellT - dt);
  // 高速扬尘
  if (S.grounded && S.speed > 6 && Math.random() < dt * S.speed * 0.8) {
    FX.dust(rootX - 0.1, 0.06, 0.6);
  }
  // 刷新最佳成绩存储
  if (((S.dist | 0) % 500) < 2) localStorage.setItem('pelican_best', S.best.toFixed(1));
}

/* ---------- 主循环 ---------- */
function tick(now) {
  requestAnimationFrame(tick);
  const t = now / 1000;
  let dt = Math.min(0.05, t - (lastT || t));
  lastT = t;
  if (S.paused || !S.started) { renderer.render(scene, camera); return; }
  // FPS 统计与自适应画质
  fpsFrames++; fpsWindow += dt;
  if (fpsWindow > 2.5) {
    const fps = fpsFrames / fpsWindow;
    S.fpsAvg = S.fpsAvg * 0.5 + fps * 0.5;
    fpsFrames = 0; fpsWindow = 0;
    HUD.el.fps.textContent = Math.round(S.fpsAvg);
    if (S.fpsAvg < 42 && S.quality > 0) setQuality(S.quality - 1);
    else if (S.fpsAvg > 57 && S.quality < 2) setQuality(S.quality + 1);
  }
  const { elev, night } = updateDayCycle(dt);
  updateGameplay(dt, t);
  scrollWorld(dt);
  updateFish(dt);
  updatePelican(dt, t);
  const riderPos = BIKE.root.position;
  CAM.update(camera, dt, t, riderPos);
  FX.update(dt, night, camera.quaternion);
  skyMesh.position.copy(camera.position);
  oceanMesh.position.z = camera.position.z - 240;
  SKY_UNI.uTime.value = t;
  OCEAN_UNI.uTime.value = t;
  AudioEngine.update();
  ACH.tick();
  HUD.update(dt);
  // 海鸥叫声
  gullCryT -= dt;
  if (gullCryT < 0) { gullCryT = rand(9, 22); if (Math.random() < 0.7) AudioEngine.gull(); }
  renderer.render(scene, camera);
}

function setQuality(q) {
  S.quality = q;
  const pr = [0.75, 1.0, Math.min(window.devicePixelRatio || 1, 2)][q];
  renderer.setPixelRatio(pr);
  renderer.shadowMap.enabled = q > 0;
  if (sunLight.shadow) {
    sunLight.shadow.mapSize.set(q === 2 ? 2048 : 1024, q === 2 ? 2048 : 1024);
    if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
  }
}

/* ---------- 输入绑定 ---------- */
function bindInput() {
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') e.preventDefault();
    if (e.repeat || KEYS[e.code]) return;
    KEYS[e.code] = true;
    if (!S.started) return;
    if (e.code === 'Space' && S.grounded && !S.paused) {
      S.grounded = false; S.vy = CFG.jumpVel * (0.75 + 0.5 * clamp(S.speed / CFG.maxSpeed, 0, 1));
      S.jumpCount++;
      AudioEngine.jump();
    }
    if (e.code === 'KeyT' && S.trickT <= 0 && S.speed > 3) {
      S.trickT = 1.2;
      AudioEngine.trick();
      ACH.check('trick');
    }
    if (e.code === 'KeyB') { S.bellT = 0.3; S.bellCount++; AudioEngine.bell(); }
    if (e.code === 'KeyC') CAM.next();
    if (e.code === 'KeyM') { AudioEngine.setMuted(!S.muted); HUD.el.muteBtn.textContent = S.muted ? '🔇' : '🔊'; }
    if (e.code === 'KeyH') { HUD.el.help.classList.toggle('hide'); }
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    S.idleT = 0; if (S.autoPilot) { S.autoPilot = false; S.autoDist = 0; }
  });
  window.addEventListener('keyup', e => { KEYS[e.code] = false; });
  const releaseAndPause = () => {
    clearHeldInput();
    if (S.started && !S.paused) togglePause(true);
  };
  window.addEventListener('blur', releaseAndPause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAndPause(); });
  // 触屏
  const bindBtn = (id, key) => {
    const el = document.getElementById(id);
    if (!el) return;
    const on = (e) => { e.preventDefault(); TOUCH[key] = 1; S.idleT = 0; if (S.autoPilot) { S.autoPilot = false; S.autoDist = 0; } };
    const off = (e) => { e.preventDefault(); TOUCH[key] = 0; };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
    el.addEventListener('mousedown', on); el.addEventListener('mouseup', off); el.addEventListener('mouseleave', off);
  };
  bindBtn('tUp', 'up'); bindBtn('tDown', 'down'); bindBtn('tLeft', 'left'); bindBtn('tRight', 'right');
  // bindInput 先于 HUD.init 执行，直接取已经存在的 DOM，不能检查尚未填充的 HUD.el。
  document.getElementById('muteBtn').addEventListener('click', () => { AudioEngine.setMuted(!S.muted); HUD.el.muteBtn.textContent = S.muted ? '🔇' : '🔊'; });
  document.getElementById('qualityTag').addEventListener('click', () => setQuality((S.quality + 2) % 3));
  const tapBtn = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('touchstart', (e) => { e.preventDefault(); fn(); }, { passive: false });
    if (el) el.addEventListener('mousedown', (e) => { e.preventDefault(); fn(); });
  };
  tapBtn('tJump', () => { if (S.grounded) { S.grounded = false; S.vy = CFG.jumpVel; S.jumpCount++; AudioEngine.jump(); } });
  tapBtn('tBell', () => { S.bellT = 0.3; S.bellCount++; AudioEngine.bell(); });
  tapBtn('tCam', () => CAM.next());
  tapBtn('tTrick', () => { if (S.trickT <= 0 && S.speed > 3) { S.trickT = 1.2; AudioEngine.trick(); ACH.check('trick'); } });
  document.getElementById('resumeBtn').addEventListener('click', () => {
    if (S.paused) togglePause();
  });
}

function clearHeldInput() {
  for (const key of Object.keys(KEYS)) delete KEYS[key];
  for (const action of Object.keys(TOUCH)) TOUCH[action] = 0;
  for (const action of Object.keys(INPUT)) INPUT[action] = 0;
  S.steer = 0;
}

function togglePause(force) {
  S.paused = force === true ? true : !S.paused;
  if (S.paused) clearHeldInput();
  HUD.el.pauseVeil.classList.toggle('show', S.paused);
}

/* ---------- 启动 ---------- */
function boot() {
  HUD.init();
  ACH.init();
  const steps = [
    ['搭建海岸公路…', () => { buildMaterials(); buildRoad(scene); buildRails(scene); }],
    ['种下棕榈与路灯…', () => { buildLamps(scene); buildPalms(scene); buildProps(scene); }],
    ['铺开大海与天空…', () => { skyMesh = buildSky(scene); oceanMesh = buildOcean(scene); buildClouds(scene); buildGulls(scene); }],
    ['组装自行车…', () => { buildBicycle(scene); }],
    ['叫醒鹈鹕…', () => { buildPelican(BIKE.root); scene.add(PEL.scarfScene); }],
    ['撒一把鱼群与星光…', () => { buildFish(scene); FX.init(scene); }],
  ];
  let i = 0;
  const runStep = () => {
    if (i < steps.length) {
      const [label, fn] = steps[i];
      HUD.el.bar.style.width = `${(i + 1) / steps.length * 88}%`;
      HUD.el.loadLabel.textContent = label;
      try { fn(); } catch (err) { console.error('[boot]', label, err); }
      i++;
      setTimeout(runStep, 30);
    } else {
      HUD.el.bar.style.width = '100%';
      HUD.el.loadLabel.textContent = '准备就绪';
      HUD.el.startBtn.classList.add('ready');
      HUD.el.startBtn.textContent = '🚴 开始骑行';
    }
  };
  HUD.el.startBtn.addEventListener('click', () => {
    if (!HUD.el.startBtn.classList.contains('ready')) return;
    AudioEngine.init();
    S.started = true; S.running = true;
    HUD.el.startScreen.classList.add('gone');
    setTimeout(() => HUD.el.startScreen.remove(), 900);
    HUD.toast('🌅 黄昏出发，一路骑向星空！', 'start');
    ACH.unlock('start');
    if (S.touch) HUD.el.touchUI.classList.add('show');
  });
  runStep();
}

function init() {
  const canvas = document.getElementById('gl');
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    document.getElementById('nogl').style.display = 'flex';
    return;
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xc08868, 55, 380);
  camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(2.5, 2.6, 6.5);

  hemiLight = new THREE.HemisphereLight(0x9a7a68, 0x6a5038, 0.9);
  scene.add(hemiLight);
  sunLight = new THREE.DirectionalLight(0xffc98a, 2.0);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 1; sunLight.shadow.camera.far = 220;
  const sc = 26;
  sunLight.shadow.camera.left = -sc; sunLight.shadow.camera.right = sc;
  sunLight.shadow.camera.top = sc; sunLight.shadow.camera.bottom = -sc;
  sunLight.shadow.bias = -0.0018;
  scene.add(sunLight); scene.add(sunLight.target);
  moonLight = new THREE.DirectionalLight(0x8fb0e8, 0);
  moonLight.position.set(40, 60, 30);
  scene.add(moonLight);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  bindInput();
  boot();
  requestAnimationFrame(tick);
}

window.addEventListener('load', init);
/* 自动化测试钩子（不影响玩法） */
window.__PELICAN__ = { S, CFG, ACH, CAM, AudioEngine, PEL, BIKE, FISH, FX, spawnFish };
})();

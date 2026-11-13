// =============================================================
//  AudioSystem — todos os sons são SINTETIZADOS na hora (WebAudio):
//  nada de arquivo de áudio, funciona offline no APK e pesa 0 KB.
//
//  game.sfx(nome, posição?, opções?)  → toca um som (3D se tiver posição)
//  Sons: tiro de cada arma, recarga, sem bala, soco, impacto, hitmarker,
//  explosão, foguete, patinho, quiz (ding/buzina), caixa registradora,
//  plateia (murmúrio contínuo + vibra/vaia/"óóóh"), buzina de abertura,
//  motor e buzina dos carros, barra giratória.
// =============================================================

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

/** Receita de cada tiro: estalo (ruído filtrado) + "soco" grave + cauda. */
const GUN = {
  pistol:      { crack: 2600, body: 900,  thump: 140, dur: 0.16, tail: 0.25, gain: 0.55 },
  revolver:    { crack: 2200, body: 700,  thump: 110, dur: 0.22, tail: 0.45, gain: 0.75 },
  deagle:      { crack: 1900, body: 600,  thump: 90,  dur: 0.26, tail: 0.55, gain: 0.85 },
  smg:         { crack: 3200, body: 1100, thump: 160, dur: 0.09, tail: 0.14, gain: 0.42 },
  smg_heavy:   { crack: 2600, body: 900,  thump: 130, dur: 0.11, tail: 0.18, gain: 0.48 },
  rifle:       { crack: 2900, body: 800,  thump: 100, dur: 0.14, tail: 0.32, gain: 0.6 },
  ak:          { crack: 2300, body: 650,  thump: 85,  dur: 0.16, tail: 0.38, gain: 0.68 },
  shotgun:     { crack: 1500, body: 450,  thump: 70,  dur: 0.3,  tail: 0.6,  gain: 0.9 },
  shotgun_big: { crack: 1300, body: 400,  thump: 60,  dur: 0.34, tail: 0.7,  gain: 1 },
  minigun:     { crack: 3400, body: 1200, thump: 170, dur: 0.06, tail: 0.08, gain: 0.3 },
};

export class AudioSystem {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.volume = 0.8;
    this.crowdVolume = 0.6;
    this.listenerPos = { x: 0, y: 1.6, z: 0 };
    this.loops = new Map(); // motores dos carros, minigun girando…
    this.excitement = 0;    // plateia mais animada depois de lances bons
    this._lastHorn = 0;
    // o navegador só libera áudio depois de um toque/clique
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('touchstart', unlock, { capture: true, passive: true });
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.volume;
      // compressor: tiroteio + explosão juntos não estouram o alto-falante do celular
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.ratio.value = 6;
      this.master.connect(this.comp).connect(c.destination);
      this.sfxBus = c.createGain();
      this.sfxBus.connect(this.master);
      this.crowdBus = c.createGain();
      this.crowdBus.gain.value = this.crowdVolume;
      this.crowdBus.connect(this.master);
      this.noise = this._noiseBuffer(2);
      this._startCrowd();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(sfx, crowd) {
    this.volume = sfx;
    this.crowdVolume = crowd;
    if (this.master) this.master.gain.value = sfx;
    if (this.crowdBus) this.crowdBus.gain.value = crowd;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // ---------------------------------------------------------------- 3D
  /** Câmera do jogador local: posição e direção do "ouvido". */
  setListener(camera) {
    if (!this.ctx || !camera) return;
    const l = this.ctx.listener;
    const p = camera.position;
    this.listenerPos = { x: p.x, y: p.y, z: p.z };
    const f = { x: 0, y: 0, z: -1 };
    const e = camera.matrixWorld.elements;
    f.x = -e[8]; f.y = -e[9]; f.z = -e[10];
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setTargetAtTime(p.x, t, 0.02); l.positionY.setTargetAtTime(p.y, t, 0.02); l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02); l.forwardY.setTargetAtTime(f.y, t, 0.02); l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
  }

  /** Saída do som: com posição vira 3D (panner), sem posição toca "na cabeça". */
  _out(at, { gain = 1, ref = 4, bus } = {}) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = gain;
    if (at) {
      const pn = c.createPanner();
      pn.panningModel = 'equalpower'; // HRTF pesa demais no celular
      pn.distanceModel = 'inverse';
      pn.refDistance = ref;
      pn.maxDistance = 120;
      pn.rolloffFactor = 1.1;
      if (pn.positionX) { pn.positionX.value = at.x; pn.positionY.value = at.y; pn.positionZ.value = at.z; }
      else pn.setPosition(at.x, at.y, at.z);
      g.connect(pn).connect(bus ?? this.sfxBus);
      g._panner = pn;
    } else {
      g.connect(bus ?? this.sfxBus);
    }
    return g;
  }

  _noiseBuffer(sec) {
    const c = this.ctx;
    const b = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  _noise(dest, t, dur, { type = 'bandpass', freq = 1000, q = 0.8, gain = 1, attack = 0.002, sweepTo = null, rate = 1 } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = rate;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return g;
  }

  _tone(dest, t, dur, { type = 'sine', freq = 440, to = null, gain = 0.5, attack = 0.005, detune = 0 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    o.detune.value = detune;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  // ---------------------------------------------------------------- tocar
  /**
   * @param name  ver lista no topo do arquivo
   * @param at    {x,y,z} (opcional) — som 3D
   * @param o     opções específicas (ex.: { sound: 'ak' } para 'shot')
   */
  play(name, at = null, o = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime + 0.005;
    const fn = this[`_s_${name}`];
    if (fn) fn.call(this, t, at, o);
  }

  _s_shot(t, at, { sound = 'pistol', local = false }) {
    if (sound === 'rpg') return this._s_rocket(t, at);
    if (sound === 'slingshot') return this._s_slingshot(t, at);
    if (sound === 'duck') return this._s_throw(t, at);
    const r = GUN[sound] ?? GUN.pistol;
    // o próprio tiro (local) toca sem 3D e um pouco mais baixo pra não cansar
    const out = this._out(local ? null : at, { gain: r.gain * (local ? 0.8 : 1), ref: 6 });
    const v = rand(0.93, 1.07);
    this._noise(out, t, r.dur * 0.5, { type: 'highpass', freq: r.crack * v, q: 0.7, gain: 0.9 });
    this._noise(out, t, r.dur, { type: 'bandpass', freq: r.body * v, q: 0.9, gain: 1, sweepTo: r.body * 0.4 });
    this._tone(out, t, r.dur * 1.2, { freq: r.thump * 2 * v, to: r.thump * 0.5, gain: 0.9 });
    // cauda: eco do estúdio
    this._noise(out, t + 0.02, r.tail, { type: 'lowpass', freq: r.body * 0.9, q: 0.5, gain: 0.25, attack: 0.03, sweepTo: 200 });
  }

  _s_rocket(t, at) {
    const out = this._out(at, { gain: 0.9, ref: 6 });
    this._noise(out, t, 0.18, { type: 'bandpass', freq: 600, q: 0.7, gain: 1 });
    this._noise(out, t + 0.05, 0.9, { type: 'bandpass', freq: 1800, q: 1.5, gain: 0.5, attack: 0.08, sweepTo: 500 });
    this._tone(out, t, 0.3, { freq: 120, to: 40, gain: 0.8 });
  }

  _s_slingshot(t, at) {
    const out = this._out(at, { gain: 0.6 });
    this._tone(out, t, 0.12, { type: 'triangle', freq: 180, to: 520, gain: 0.5 });
    this._noise(out, t, 0.08, { type: 'highpass', freq: 3000, gain: 0.3 });
  }

  _s_throw(t, at) {
    const out = this._out(at, { gain: 0.5 });
    this._noise(out, t, 0.25, { type: 'bandpass', freq: 900, q: 2, gain: 0.6, attack: 0.05, sweepTo: 2500 });
    this._s_duck(t + 0.05, at);
  }

  /** Patinho de borracha: "qüé" (sobe e desce com vibrato). */
  _s_duck(t, at) {
    const out = this._out(at, { gain: 0.5 });
    const c = this.ctx;
    const o = this._tone(out, t, 0.28, { type: 'square', freq: 900, gain: 0.25, attack: 0.01 });
    o.frequency.setValueAtTime(900, t);
    o.frequency.linearRampToValueAtTime(1400, t + 0.08);
    o.frequency.linearRampToValueAtTime(700, t + 0.28);
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 28; lg.gain.value = 60;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t); lfo.stop(t + 0.3);
  }

  _s_reload(t, at, { local = false }) {
    const out = this._out(local ? null : at, { gain: 0.45, ref: 2 });
    [0, 0.35, 0.62].forEach((dt, i) => {
      this._noise(out, t + dt, 0.05, { type: 'bandpass', freq: [2200, 1500, 3200][i], q: 4, gain: 0.8 });
      this._tone(out, t + dt, 0.04, { type: 'square', freq: [800, 500, 1100][i], gain: 0.12 });
    });
  }

  _s_empty(t, at, { local = false }) {
    const out = this._out(local ? null : at, { gain: 0.4, ref: 2 });
    this._noise(out, t, 0.03, { type: 'bandpass', freq: 3500, q: 6, gain: 0.9 });
  }

  _s_swing(t, at) {
    const out = this._out(at, { gain: 0.35, ref: 2 });
    this._noise(out, t, 0.18, { type: 'bandpass', freq: 500, q: 1.5, gain: 0.7, attack: 0.04, sweepTo: 1500 });
  }

  _s_punch(t, at) {
    const out = this._out(at, { gain: 0.8, ref: 3 });
    this._tone(out, t, 0.14, { freq: 160, to: 50, gain: 0.9 });
    this._noise(out, t, 0.08, { type: 'lowpass', freq: 1200, gain: 0.7 });
  }

  /** Bala pegando no corpo de alguém (3D) */
  _s_flesh(t, at, { headshot = false }) {
    const out = this._out(at, { gain: 0.5, ref: 3 });
    this._noise(out, t, 0.07, { type: 'lowpass', freq: 900, gain: 0.8 });
    if (headshot) this._tone(out, t, 0.25, { type: 'triangle', freq: 2400, to: 2000, gain: 0.25 });
  }

  /** Hitmarker: só pra quem acertou (sem 3D) */
  _s_hitmark(t, _at, { headshot = false, killed = false }) {
    const out = this._out(null, { gain: 0.35 });
    this._tone(out, t, 0.06, { type: 'square', freq: headshot ? 1800 : 1200, gain: 0.3 });
    if (killed) this._tone(out, t + 0.07, 0.18, { type: 'triangle', freq: 660, to: 990, gain: 0.35 });
  }

  _s_ricochet(t, at) {
    if (Math.random() < 0.5) return; // nem toda bala zune
    const out = this._out(at, { gain: 0.22, ref: 3 });
    this._noise(out, t, 0.05, { type: 'bandpass', freq: rand(1500, 3000), q: 3, gain: 0.8 });
    if (Math.random() < 0.3) this._tone(out, t, 0.25, { type: 'sine', freq: rand(2400, 3400), to: rand(900, 1400), gain: 0.12 });
  }

  _s_explosion(t, at, { small = false }) {
    const k = small ? 0.65 : 1;
    const out = this._out(at, { gain: 1.1 * k, ref: 8 });
    this._noise(out, t, 0.25, { type: 'lowpass', freq: 3000, gain: 1 });
    this._noise(out, t, 1.6 * k, { type: 'lowpass', freq: 900, q: 0.7, gain: 1, sweepTo: 80 });
    this._tone(out, t, 1.0 * k, { freq: 90, to: 28, gain: 1 });
    this._noise(out, t + 0.25, 1.2 * k, { type: 'bandpass', freq: 400, q: 0.6, gain: 0.25, attack: 0.1, sweepTo: 120 });
    this.react('oooh', 0.4);
  }

  _s_bounce(t, at) {
    const out = this._out(at, { gain: 0.5, ref: 3 });
    this._tone(out, t, 0.12, { freq: 110, to: 70, gain: 0.8 });
  }

  _s_swish(t, at) {
    const out = this._out(at, { gain: 0.6, ref: 4 });
    this._noise(out, t, 0.35, { type: 'highpass', freq: 2500, gain: 0.5, attack: 0.04 });
  }

  _s_launch(t, at) { // arremessado pro teto: "boing"
    const out = this._out(at, { gain: 0.6, ref: 5 });
    const o = this._tone(out, t, 0.6, { type: 'triangle', freq: 120, to: 700, gain: 0.5 });
    const c = this.ctx;
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 14; lg.gain.value = 40;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t); lfo.stop(t + 0.6);
  }

  // ---------------------------------------------------------------- programa de auditório
  _s_ding(t) {
    const out = this._out(null, { gain: 0.5 });
    this._tone(out, t, 0.5, { type: 'sine', freq: 1318, gain: 0.5 });
    this._tone(out, t + 0.09, 0.7, { type: 'sine', freq: 1760, gain: 0.45 });
  }

  _s_buzzer(t) {
    const out = this._out(null, { gain: 0.4 });
    this._tone(out, t, 0.55, { type: 'square', freq: 110, gain: 0.4, attack: 0.01 });
    this._tone(out, t, 0.55, { type: 'sawtooth', freq: 116, gain: 0.25, attack: 0.01 });
  }

  _s_tick(t) {
    const out = this._out(null, { gain: 0.3 });
    this._tone(out, t, 0.04, { type: 'square', freq: 1500, gain: 0.3 });
  }

  _s_cash(t) {
    const out = this._out(null, { gain: 0.45 });
    this._noise(out, t, 0.06, { type: 'bandpass', freq: 3000, q: 3, gain: 0.7 });
    this._tone(out, t + 0.05, 0.4, { type: 'triangle', freq: 2093, gain: 0.35 });
    this._tone(out, t + 0.12, 0.5, { type: 'triangle', freq: 2637, gain: 0.35 });
  }

  _s_denied(t) {
    const out = this._out(null, { gain: 0.3 });
    this._tone(out, t, 0.15, { type: 'square', freq: 300, gain: 0.3 });
    this._tone(out, t + 0.16, 0.2, { type: 'square', freq: 220, gain: 0.3 });
  }

  /** Buzina de abertura (round/partida): acorde de "corneta" */
  _s_horn(t) {
    if (t - this._lastHorn < 0.5) return;
    this._lastHorn = t;
    const out = this._out(null, { gain: 0.35 });
    [392, 494, 587].forEach((f) => this._tone(out, t, 0.7, { type: 'sawtooth', freq: f, gain: 0.25, attack: 0.03 }));
    this.react('cheer', 0.5);
  }

  _s_drumroll(t) {
    const out = this._out(null, { gain: 0.35 });
    for (let i = 0; i < 14; i++) this._noise(out, t + i * 0.045, 0.05, { type: 'bandpass', freq: 220, q: 1.2, gain: 0.4 + i * 0.03 });
  }

  _s_cheer(t, _a, { amount = 1 }) { this.react('cheer', amount); }
  _s_boo(t, _a, { amount = 1 }) { this.react('boo', amount); }
  _s_oooh(t, _a, { amount = 1 }) { this.react('oooh', amount); }
  _s_laugh(t, _a, { amount = 1 }) { this.react('laugh', amount); }

  _s_carhorn(t, at) {
    const out = this._out(at, { gain: 0.6, ref: 6 });
    this._tone(out, t, 0.35, { type: 'square', freq: 415, gain: 0.25, attack: 0.01 });
    this._tone(out, t, 0.35, { type: 'square', freq: 523, gain: 0.2, attack: 0.01 });
  }

  // ---------------------------------------------------------------- plateia
  _startCrowd() {
    const c = this.ctx;
    // murmúrio: ruído em banda de voz com "ondas" lentas de volume
    const src = c.createBufferSource();
    src.buffer = this._noiseBuffer(4);
    src.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2200;
    this.murmur = c.createGain();
    this.murmur.gain.value = 0.05;
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = 0.23; lg.gain.value = 0.015;
    lfo.connect(lg).connect(this.murmur.gain);
    src.connect(bp).connect(lp).connect(this.murmur).connect(this.crowdBus);
    src.start(); lfo.start();
  }

  /** Reação da plateia: 'cheer' (vibra) · 'boo' (vaia) · 'oooh' · 'laugh' */
  react(kind, amount = 1) {
    if (!this.ready) return;
    const c = this.ctx;
    const t = c.currentTime + 0.02;
    const a = clamp(amount, 0.1, 1.5);
    const out = this._out(null, { gain: 1, bus: this.crowdBus });
    if (kind === 'cheer') {
      // muitas vozes + palmas
      const dur = 1.6 + a;
      this._noise(out, t, dur, { type: 'bandpass', freq: 1400, q: 0.5, gain: 0.35 * a, attack: 0.25, sweepTo: 900 });
      this._noise(out, t, dur * 0.8, { type: 'bandpass', freq: 2600, q: 0.8, gain: 0.18 * a, attack: 0.2 });
      for (let i = 0; i < 26 * a; i++) {
        this._noise(out, t + rand(0, dur * 0.9), 0.03, { type: 'bandpass', freq: rand(1400, 2600), q: 1.5, gain: rand(0.1, 0.25) * a });
      }
      for (let i = 0; i < 4; i++) this._tone(out, t + rand(0, 0.4), rand(0.4, 0.9), { type: 'sawtooth', freq: rand(380, 650), to: rand(700, 1000), gain: 0.03 * a, attack: 0.05 });
    } else if (kind === 'boo') {
      for (let i = 0; i < 6; i++) {
        const f = rand(110, 190);
        this._tone(out, t + rand(0, 0.25), 1.3 + a * 0.4, { type: 'sawtooth', freq: f, to: f * 0.8, gain: 0.04 * a, attack: 0.15 });
      }
      this._noise(out, t, 1.5, { type: 'lowpass', freq: 500, gain: 0.15 * a, attack: 0.2 });
    } else if (kind === 'oooh') {
      for (let i = 0; i < 6; i++) {
        const f = rand(220, 330);
        const o = this._tone(out, t + rand(0, 0.1), 1.0, { type: 'sawtooth', freq: f * 1.2, to: f * 0.8, gain: 0.035 * a, attack: 0.12 });
        o.detune.value = rand(-30, 30);
      }
      this._noise(out, t, 0.9, { type: 'bandpass', freq: 500, q: 2, gain: 0.12 * a, attack: 0.15 });
    } else if (kind === 'laugh') {
      for (let i = 0; i < 9; i++) {
        const st = t + i * 0.13 + rand(-0.03, 0.03);
        this._noise(out, st, 0.09, { type: 'bandpass', freq: rand(800, 1300), q: 2, gain: 0.22 * a });
      }
    }
    this.excitement = Math.min(1, this.excitement + 0.3 * a);
  }

  // ---------------------------------------------------------------- sons contínuos
  /** Liga/atualiza um som em loop (id único). params: { kind, at, level, pitch } */
  loop(id, p) {
    if (!this.ready) return;
    let l = this.loops.get(id);
    const c = this.ctx;
    if (!l) {
      l = { kind: p.kind, seen: true };
      l.out = this._out(p.at ?? null, { gain: 0, ref: p.kind === 'engine' ? 5 : 3 });
      if (p.kind === 'engine') {
        l.osc = c.createOscillator(); l.osc.type = 'sawtooth'; l.osc.frequency.value = 55;
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
        l.osc.connect(f).connect(l.out);
        l.osc.start();
      } else if (p.kind === 'spin') { // minigun girando / barra giratória
        l.osc = c.createOscillator(); l.osc.type = 'square'; l.osc.frequency.value = 40;
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1;
        l.osc.connect(f).connect(l.out);
        l.osc.start();
      }
      this.loops.set(id, l);
    }
    l.seen = true;
    const t = c.currentTime;
    l.out.gain.setTargetAtTime(p.level ?? 0.2, t, 0.05);
    if (p.pitch && l.osc) l.osc.frequency.setTargetAtTime(p.pitch, t, 0.05);
    if (p.at) {
      // o panner é o nó depois do ganho; atualiza a posição
      const pn = l.out._panner;
      if (pn?.positionX) { pn.positionX.setTargetAtTime(p.at.x, t, 0.03); pn.positionY.setTargetAtTime(p.at.y, t, 0.03); pn.positionZ.setTargetAtTime(p.at.z, t, 0.03); }
    }
  }

  /** Chamar a cada frame: apaga loops que não foram atualizados. */
  endFrame() {
    for (const [id, l] of this.loops) {
      if (!l.seen) {
        l.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
        try { l.osc?.stop(this.ctx.currentTime + 0.3); } catch { /* já parou */ }
        this.loops.delete(id);
      }
      l.seen = false;
    }
  }

  /** Por frame: ouvido na câmera, plateia, carros, minigun. */
  update(dt, game, camera) {
    if (!this.ready) return;
    this.setListener(camera);
    // plateia: mais alta no PvP e quando acabou de rolar lance bom
    this.excitement = Math.max(0, this.excitement - dt * 0.15);
    const fighting = game._fighting?.();
    const base = (fighting ? 0.07 : 0.05) + this.excitement * 0.06;
    this.murmur.gain.setTargetAtTime(base, this.ctx.currentTime, 0.4);

    if (!game.paused) {
      for (const [k, m] of (game.arena.movers ?? []).entries()) {
        const b = m.body.position;
        if (m.kind === 'car') {
          this.loop(`car${k}`, { kind: 'engine', at: b, level: 0.25, pitch: 50 + Math.abs(m.speed) * 3 });
          // buzina quando passa perto de alguém
          const near = game.players.some((p) => !p.dead && Math.hypot(p.controller.position.x - b.x, p.controller.position.z - b.z) < 5);
          m._hornCd = (m._hornCd ?? 0) - dt;
          if (near && m._hornCd <= 0) { this.play('carhorn', b); m._hornCd = 4; }
        } else if (m.kind === 'spin') {
          this.loop(`spin${k}`, { kind: 'spin', at: b, level: 0.06, pitch: 30 + Math.abs(m.speed) * 20 });
        }
      }
      for (const p of game.players) {
        const w = p.weapon;
        if (w?.def.spinUp && w.spin > 0.02) this.loop(`mg${p.index}`, { kind: 'spin', at: p.controller.position, level: 0.12 * w.spin, pitch: 30 + w.spin * 90 });
      }
    }
    this.endFrame();
  }
}

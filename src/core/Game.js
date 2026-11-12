// Orquestrador: monta os módulos e roda o loop na ordem certa.
//   input/bot → estado → pré-física → física → pós-física → câmeras → render
// Com { headless: true } roda sem navegador (testes: partida inteira bot × bot).

import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { Arena } from '../world/Arena.js';
import { Character } from '../entities/Character.js';
import { Weapon } from '../entities/Weapon.js';
import { ProjectileSystem } from '../entities/ProjectileSystem.js';
import { DamageSystem } from '../systems/DamageSystem.js';
import { KeyboardMouseScheme, KeyboardGamepadScheme, P1_BINDINGS, P2_BINDINGS, blankIntent } from './Controls.js';
import { BotController, applyBotPreset } from '../ai/BotController.js';
import { StateMachine, GameStates } from './StateMachine.js';
import { MatchFlow } from './MatchFlow.js';
import { QuizState } from '../states/QuizState.js';
import { TiebreakState } from '../states/TiebreakState.js';
import { BuyState } from '../states/BuyState.js';
import { RoundState } from '../states/RoundState.js';
import { RoundEndState, MatchEndState } from '../states/EndStates.js';
import { RpsState } from '../states/RpsState.js';
import { BasketballState } from '../states/BasketballState.js';
import { Grenades } from '../systems/Grenades.js';
import { shotKnockback } from '../physics/ChaosForces.js';
import { PlayerCamera } from '../camera/PlayerCamera.js';
import { SplitScreenRenderer } from '../camera/SplitScreenRenderer.js';
import { Input } from './Input.js';
import { HUD, NullHUD } from '../ui/HUD.js';
import { createDebugGUI } from './DebugGUI.js';
import { TouchControls, isTouchDevice } from './TouchControls.js';
import { Settings } from './Settings.js';
import { Menu } from '../ui/Menu.js';
import { LayoutEditor } from '../ui/LayoutEditor.js';

const PLAYER_DEFS = [
  { name: 'RÁDIO', color: 0xff8a3d, variant: 'radio' },
  { name: 'FONE', color: 0x3dd6c6, variant: 'fone' },
];

const HELP = {
  vsBot: 'WASD + mouse · clique atira · botão direito/V soca · 1/2 responde · 1–6 compra, Enter pronto &nbsp;|&nbsp; G: painel',
  splitscreen: 'P1: WASD + mouse · clique atira · direito/V soca · 1/2 responde · 1–6 compra &nbsp;|&nbsp; '
    + 'P2: setas + IJKL · Enter atira · Shift dir. soca · 9/0 responde · compra clicando (ou gamepad) &nbsp;|&nbsp; G: painel',
};

const NULL_INPUT = { locked: false, releaseLock() {}, requestLock() {}, endFrame() {} };
const NULL_SCHEME = { read: () => blankIntent() };

export class Game {
  /**
   * @param opts.headless  sem render/DOM (testes)
   * @param opts.bots      índices controlados por bot (headless: [0,1] = bot × bot)
   */
  constructor(container, hudRoot, { headless = false, bots = null } = {}) {
    this.headless = headless;
    this.mode = CONFIG.game.mode === 'splitscreen' ? 'splitscreen' : 'vsBot';
    const botSet = new Set(bots ?? (this.mode === 'vsBot' ? [1] : []));
    if (botSet.size) applyBotPreset();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x15121c);
    this.combatActive = false; // dano vale?
    this.meleeOnly = false;    // desempate: só soco
    this.time = 0;

    // Física e mundo
    this.physics = new PhysicsWorld();
    this.arena = new Arena(this.scene, this.physics);
    this.projectiles = new ProjectileSystem(this.scene, this.physics);
    this.damage = new DamageSystem(this);
    this.grenades = new Grenades(this);
    this.basketball = null;  // criado pelo BasketballState
    this.weaponLabel = null; // estados podem trocar o texto da arma no HUD

    // Jogadores (o bot usa o MESMO Character que você)
    this.players = PLAYER_DEFS.map((def, index) => {
      const p = new Character({ ...def, index, scene: this.scene, physics: this.physics, arena: this.arena });
      p.spawn = this.arena.spawns[index];
      p.weapon = new Weapon(p, this.projectiles);
      p.isBot = botSet.has(index);
      p.teleport(p.spawn.position, p.spawn.yaw);
      return p;
    });
    this.humans = this.players.filter((p) => !p.isBot).map((p) => p.index);
    if (headless) this.humans = [];

    this.flow = new MatchFlow(this);
    this.sm = new StateMachine(this)
      .register(GameStates.QUIZ, new QuizState())
      .register(GameStates.TIEBREAK, new TiebreakState())
      .register(GameStates.BUY, new BuyState())
      .register(GameStates.ROUND, new RoundState())
      .register(GameStates.ROUND_END, new RoundEndState())
      .register(GameStates.MATCH_END, new MatchEndState())
      .register(GameStates.RPS, new RpsState())
      .register(GameStates.BASKETBALL, new BasketballState());

    // Controles: humano, bot ou nada — mesma interface read(dt)
    this.schemes = this.players.map((p, i) => {
      if (p.isBot) return new BotController(this, p);
      if (headless) return NULL_SCHEME;
      return null; // humano: preenchido em _setupBrowser (precisa do Input)
    });
    this.intents = this.players.map(blankIntent);

    if (headless) {
      this.input = NULL_INPUT;
      this.views = [];
      this.hud = new NullHUD();
      return;
    }
    this._setupBrowser(container, hudRoot);
  }

  _setupBrowser(container, hudRoot) {
    this.isTouch = isTouchDevice();
    document.body.classList.toggle('touch', this.isTouch);
    this.views = this.humans.map((i) => new PlayerCamera(i, this.players[i], this.arena, this.scene, this.players.length));
    this.renderer = new SplitScreenRenderer(container, { lowPower: this.isTouch });
    this.input = new Input(this.renderer.domElement);
    this.touch = this.isTouch ? new TouchControls(document.body) : null;
    this.schemes = this.schemes.map((s, i) => s ?? (i === 0
      ? new KeyboardMouseScheme(this.input, P1_BINDINGS, this.touch)
      : new KeyboardGamepadScheme(this.input, P2_BINDINGS)));

    this.hud = new HUD(hudRoot, this.players, [P1_BINDINGS.hints, P2_BINDINGS.hints], this.humans,
      this.isTouch ? '' : HELP[this.mode], { touch: this.isTouch });
    if (!this.isTouch) this.hud.onUserGesture = () => this.input.requestLock(); // celular não usa trava de mouse
    this.damage.onHit = (ctx) => this.hud.hit(ctx);

    this.renderer.domElement.addEventListener('click', () => {
      const fighting = this.sm.is(GameStates.ROUND) || this.sm.is(GameStates.TIEBREAK) || this.sm.is(GameStates.BASKETBALL);
      if (fighting && !this.paused && !this.input.locked && !this.isTouch) this.input.requestLock();
    });

    this.gui = createDebugGUI(this);
    this.timer = new THREE.Timer();
    this.timer.connect(document); // pausa o dt quando a aba fica oculta

    // menu, pausa, configurações e editor de HUD
    this.inMenu = true;
    this.paused = true;
    this.settings = new Settings({ touch: this.isTouch });
    this.layout = new LayoutEditor({
      onOpen: () => {
        document.body.classList.remove('in-menu');
        if (this.touch) { this.touch.enabled = false; this.touch.setVisible(true); }
      },
      onClose: () => {
        if (this.touch) { this.touch.enabled = true; this.touch._resetAll(); }
        if (this.inMenu) document.body.classList.add('in-menu');
      },
    });
    this.layout.register(this.hud.editables());
    if (this.touch) this.layout.register(this.touch.editables());
    this.menu = new Menu(this, this.settings);
    this.hud.onPause = () => this.pause();
    this.input.onLockLost = () => { if (this._fighting()) this.pause(); };
    window.addEventListener('keydown', (e) => {
      if (this.inMenu || this.layout.isOpen) return;
      if (e.code === 'Escape' || e.code === 'KeyP') this.paused ? this.resume() : this.pause();
    });
    this.settings.apply(this);
  }

  _fighting() {
    return this.sm.is(GameStates.ROUND) || this.sm.is(GameStates.TIEBREAK) || this.sm.is(GameStates.BASKETBALL);
  }

  /** Gráficos: leve (celular fraco) · médio · bonito. */
  setQuality(q) {
    if (!this.renderer) return;
    const r = this.renderer.renderer;
    const dpr = window.devicePixelRatio || 1;
    r.setPixelRatio(q === 'baixa' ? 1 : q === 'media' ? Math.min(dpr, 1.25) : Math.min(dpr, 2));
    r.setSize(window.innerWidth, window.innerHeight);
    this.arena.shadows = q !== 'baixa';
    if (this.arena.keyLight) this.arena.keyLight.castShadow = this.arena.shadows;
  }

  start() {
    this.renderer?.renderer.setAnimationLoop((t) => this.tick(t));
    this.showMainMenu();
  }

  showMainMenu() {
    this.inMenu = true;
    this.paused = true;
    document.body.classList.add('in-menu');
    this.input.releaseLock();
    this.menu.show('main');
  }

  startMatch() {
    this.playFrom(Number(this.settings.data.startStage) || 0);
  }

  /** Começa (ou recomeça) a partida a partir da etapa N, saindo do menu. */
  playFrom(stage = 0) {
    this.sm.current?.exit();
    this.sm.current = null;
    this.sm.currentName = null;
    this.inMenu = false;
    this.paused = false;
    document.body.classList.remove('in-menu');
    this.menu.hide();
    this.settings.apply(this);
    if (stage > 0) this.flow.jumpTo(stage);
    else this.flow.newMatch();
  }

  pause() {
    if (this.inMenu || this.paused) return;
    this.paused = true;
    this.input.releaseLock();
    this.menu.show('pause');
  }

  resume() {
    if (this.inMenu) return;
    this.paused = false;
    this.menu.hide();
  }

  quitToMenu() {
    this.sm.current?.exit();
    this.sm.current = null;
    this.sm.currentName = null;
    this.projectiles.clear();
    this.grenades.clear();
    this.flow.match = null;
    this.flow.stageIndex = -1;
    this.arena.setMap('estudio');
    this.players.forEach((p) => {
      p.revive(false);
      p.spawn = this.arena.spawnFor(p.index);
      p.teleport(p.spawn.position, p.spawn.yaw);
      p.frozen = true;
    });
    this.showMainMenu();
  }

  tick(timestamp) {
    this.timer.update(timestamp);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    if (!this.paused) this.step(dt);
    else this.lastDt = 0;
    if (!this.layout.isOpen) this.touch?.setVisible(!this.paused && this._fighting());
    this.views.forEach((v) => v.update(this.lastDt));
    if (this.inMenu) { // câmera passeando pelo estúdio atrás do menu
      this._menuT = (this._menuT ?? 0) + dt;
      const cam = this.views[0]?.camera;
      if (cam) {
        cam.position.set(Math.sin(this._menuT * 0.12) * 13, 5.5, Math.cos(this._menuT * 0.12) * 13);
        cam.lookAt(0, 1.4, 0);
        cam.layers.enable(1);
      }
    }
    this.renderer.render(this.scene, this.views.map((v) => v.camera));
    this.hud.update(this);
    this.input.endFrame();
  }

  /** Um passo de simulação (usado pelo navegador e pelos testes). */
  step(dt) {
    this.lastDt = dt;
    this.time += dt;
    this.intents = this.schemes.map((s) => s.read(dt));
    this.sm.update(dt);

    this.players.forEach((p, i) => {
      p.weapon.update(dt);
      p.preStep(dt, this.intents[i]);
    });
    this.arena.update(dt); // obstáculos móveis
    this.physics.step(dt);
    this.players.forEach((p) => p.postStep(dt));
    // carro / barra giratória / parede: derruba sem dano
    this.arena.drainKnocks((k) => shotKnockback(k.character, k.direction, k.scale));
    this.projectiles.update(dt);
    this.basketball?.update(dt);
    this.grenades.update(dt);
    this.physics.sync();
  }
}

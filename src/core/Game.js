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
import { Ballistics } from '../systems/Ballistics.js';
import { Effects } from '../systems/Effects.js';
import { GunModels } from '../entities/GunModels.js';
import { AudioSystem } from '../systems/AudioSystem.js';
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
import { NetHost } from '../net/NetHost.js';
import { NetGuest } from '../net/NetGuest.js';
import { NetSession } from '../net/NetSession.js';

const PLAYER_DEFS = [
  { name: 'RÁDIO', color: 0xff8a3d, variant: 'radio' },
  { name: 'FONE', color: 0x3dd6c6, variant: 'fone' },
];

const HELP = {
  vsBot: 'WASD + mouse · clique atira · botão direito/Z mira · R recarrega · V soca · loja: Q/E aba, 1–4 compra, Enter pronto &nbsp;|&nbsp; G: painel',
  splitscreen: 'P1: WASD + mouse · clique atira · direito/V soca · 1/2 responde · 1–6 compra &nbsp;|&nbsp; '
    + 'P2: setas + IJKL · Enter atira · / mira · - recarrega · Shift dir. soca · 9/0 responde · compra clicando &nbsp;|&nbsp; G: painel',
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
    this.effects = new Effects(this.scene);
    this.ballistics = new Ballistics(this);
    this.projectiles.onExplode = (at, def, owner) => this.ballistics.explode(at, def, owner);
    this.sfx = () => {}; // trocado pelo AudioSystem no navegador
    this.grenades = new Grenades(this);
    this.basketball = null;  // criado pelo BasketballState
    this.weaponLabel = null; // estados podem trocar o texto da arma no HUD

    // Jogadores (o bot usa o MESMO Character que você)
    this.players = PLAYER_DEFS.map((def, index) => {
      const p = new Character({ ...def, index, scene: this.scene, physics: this.physics, arena: this.arena });
      p.spawn = this.arena.spawns[index];
      p.weapon = new Weapon(p, this.projectiles);
      p.weapon.ballistics = this.ballistics;
      p.weapon.sfx = (name, o = {}) => this.sfx(name, p.centerPosition(new THREE.Vector3()), { ...o, who: p.index });
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
    this.audio = new AudioSystem(this);
    // who: de quem é o som (o próprio tiro toca "na cabeça") · forWho: só pra esse jogador
    this.sfx = (name, at = null, o = {}) => {
      if (o.forWho !== undefined && !this.isLocal(this.players[o.forWho])) return;
      const local = o.who !== undefined && this.isLocal(this.players[o.who]);
      this.audio.play(name, at, local === o.local ? o : { ...o, local });
    };
    this.isTouch = isTouchDevice();
    document.body.classList.toggle('touch', this.isTouch);
    this.views = this.humans.map((i) => new PlayerCamera(i, this.players[i], this.arena, this.scene, this.players.length));
    this.renderer = new SplitScreenRenderer(container, { lowPower: this.isTouch });
    this.input = new Input(this.renderer.domElement);
    this.touch = this.isTouch ? new TouchControls(document.body) : null;
    this.schemes = this.schemes.map((s, i) => s ?? (i === 0
      ? new KeyboardMouseScheme(this.input, P1_BINDINGS, this.touch)
      : new KeyboardGamepadScheme(this.input, P2_BINDINGS)));

    this.hudRoot = hudRoot;
    this.kbScheme = this.schemes.find((s) => s instanceof KeyboardMouseScheme);
    this._buildHud();
    this.damage.onHit = (ctx) => this.hud.hit(ctx);
    this.role = 'local'; // 'local' (bot/tela dividida) · 'host' · 'guest'
    this.net = null;

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
    this.input.onLockLost = () => { if (this._fighting()) this.pause(); };
    window.addEventListener('keydown', (e) => {
      if (this.inMenu || this.layout.isOpen) return;
      if (e.code === 'Escape' || e.code === 'KeyP') this.paused ? this.resume() : this.pause();
    });
    this.settings.apply(this);

    // modelos 3D das armas (carregam em segundo plano; até lá aparece uma caixa)
    GunModels.load().then(() => {
      this.players.forEach((p) => p.setWeaponLook(p.weapon.def));
      this.views.forEach((v) => v.refresh());
    }).catch((e) => console.warn('Modelos de arma não carregaram:', e));
  }

  _buildHud() {
    const hints = this.humans.length === 1 ? [P1_BINDINGS.hints, P1_BINDINGS.hints] : [P1_BINDINGS.hints, P2_BINDINGS.hints];
    this.hud = new HUD(this.hudRoot, this.players, hints, this.humans,
      this.isTouch ? '' : HELP[this.role === 'local' ? this.mode : 'vsBot'] ?? '', { touch: this.isTouch });
    if (!this.isTouch) this.hud.onUserGesture = () => this.input.requestLock(); // celular não usa trava de mouse
    this.hud.onPause = () => this.pause();
    this.layout?.register(this.hud.editables());
  }

  // ---------------------------------------------------------------- rede (LAN)
  /**
   * Troca quem joga neste aparelho.
   * @param role 'local' (contra o bot) · 'host' (criou a sala) · 'guest' (entrou)
   */
  configureSession(role, session = null) {
    this.net?.unhook?.();
    this.net?.dispose?.();
    this.net = null;
    if (this.netSession && this.netSession !== session) this.netSession.close();
    this.netSession = session;
    this.role = role;
    const local = role === 'guest' ? 1 : 0;
    const remote = role === 'local' ? null : 1 - local;
    this.players.forEach((p) => { p.isBot = role === 'local' && this.mode === 'vsBot' && p.index !== local; });
    this.humans = this.mode === 'splitscreen' && role === 'local' ? [0, 1] : [local];

    // câmeras
    this.views.forEach((v) => this.scene.remove(v.camera));
    this.views = this.humans.map((i) => new PlayerCamera(i, this.players[i], this.arena, this.scene, this.players.length));
    // controles: teclado/toque no jogador local; o outro é bot, rede ou P2
    this.schemes = this.players.map((p, i) => {
      if (i === local) return this.kbScheme;
      if (role === 'local') return p.isBot ? new BotController(this, p) : new KeyboardGamepadScheme(this.input, P2_BINDINGS);
      return { read: () => blankIntent() }; // substituído pelo RemoteScheme no host
    });
    this._buildHud();

    if (role === 'host') {
      this.net = new NetHost(this, session, remote);
      this.schemes[remote] = this.net.scheme;
    } else if (role === 'guest') {
      this.net = new NetGuest(this, session, local);
    }
    if (session) session.onClose = (reason) => this._netLost(reason);
  }

  /** Menu → "Criar sala". Resolve com o código; a partida começa quando o outro entrar. */
  async hostRoom() {
    this.cancelRoom();
    const s = new NetSession();
    this.pendingSession = s;
    s.onClose = () => { if (this.pendingSession === s) this.pendingSession = null; };
    const code = await s.host(this.settings.data.lanServer);
    s.onOpen = () => {
      if (this.pendingSession !== s) return;
      this.pendingSession = null;
      this.configureSession('host', s);
      this.startMatch();
    };
    return code;
  }

  /** Menu → "Entrar" com o código da sala. */
  async joinRoom(code) {
    this.cancelRoom();
    const s = new NetSession();
    this.pendingSession = s;
    await s.join(code, this.settings.data.lanServer);
    if (this.pendingSession !== s) { s.close(); return; }
    this.pendingSession = null;
    this.configureSession('guest', s);
    this.inMenu = false;
    this.paused = false;
    document.body.classList.remove('in-menu');
    this.menu.hide();
    this.hud.setPhase('CONECTADO · ESPERANDO O HOST');
  }

  cancelRoom() {
    this.pendingSession?.close();
    this.pendingSession = null;
  }

  _netLost(reason) {
    if (this.role === 'local') return;
    this.hud.flash(null, reason.toUpperCase(), 'bad');
    setTimeout(() => { if (this.role !== 'local') this.quitToMenu(reason); }, 1800);
  }

  /** Jogador com tela neste aparelho (sons "na cabeça", hitmarker). */
  isLocal(p) {
    return this.humans.includes(p.index);
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
    if (this.headless) return;
    document.body.classList.add('in-menu');
    this.input.releaseLock();
    this.menu.show('main');
  }

  startMatch() {
    this.playFrom(Number(this.settings.data.startStage) || 0);
  }

  /** Começa (ou recomeça) a partida a partir da etapa N, saindo do menu. */
  playFrom(stage = 0) {
    if (this.role === 'guest') return; // quem manda na partida é o host
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

  /** Volta ao menu. Em rede: fecha a sala e o outro aparelho também volta. */
  quitToMenu(reason = null) {
    if (this.role !== 'local' && !this.headless) {
      this.net?.flush?.(); // manda as últimas telas antes do "tchau"
      this.netSession?.close();
      this.configureSession('local');
      this.menu.netStatus(reason ?? 'Sala fechada');
    }
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
    if (this.role === 'guest') {
      this.lastDt = dt;
      this.net.update(dt); // convidado: só mostra o que o host manda
    } else if (!this.paused || (this.role === 'host' && !this.inMenu)) {
      this.step(dt); // em rede a pausa só abre o menu: o jogo continua pro outro
      this.net?.flush();
    } else {
      this.lastDt = 0;
    }
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
    this.audio.update(dt, this, this.views[0]?.camera);
    this.renderer.render(this.scene, this.views.map((v) => v.camera));
    this.hud.update(this);
    this.input.endFrame();
  }

  /** Um passo de simulação (usado pelo navegador e pelos testes). */
  step(dt) {
    this.lastDt = dt;
    this.time += dt;
    this.intents = this.schemes.map((s, i) => (this.paused && this.isLocal(this.players[i]) ? (s.read(dt), blankIntent()) : s.read(dt)));
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
    this.effects.update(dt);
    this.physics.sync();
  }
}

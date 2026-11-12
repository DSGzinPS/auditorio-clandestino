// =============================================================
//  CONFIG — todos os "botões do caos" ficam aqui.
//  Os valores são lidos a cada uso, então mudar em tempo real
//  (pelo painel lil-gui, tecla G) já afeta o próximo impulso.
// =============================================================

export const CONFIG = {
  game: {
    // 'vsBot'       → tela cheia, você (P1) contra um bot offline (P2)
    // 'splitscreen' → 1v1 local na mesma máquina, tela dividida
    mode: 'vsBot',
  },

  // ---------------- BOT (o "jogador do outro PC") ----------------
  // difficulty: 'facil' | 'normal' | 'dificil' aplica um preset por cima dos
  // valores abaixo ao iniciar. Use 'custom' para valer exatamente o que está aqui.
  bot: {
    difficulty: 'normal',
    quizAccuracy: 0.7,       // chance de acertar a conta
    quizDelayMin: 1.5,       // segundos "pensando" antes de responder
    quizDelayMax: 6,
    turnSpeed: 3.5,          // rad/s girando a mira (limita o "aimbot")
    aimError: 0.05,          // erro de mira em radianos (muda a cada ~0,6 s)
    reactionTime: 0.35,      // tempo vendo você antes do primeiro tiro
    fireConeDeg: 5,          // só atira se a mira estiver a menos disso do alvo
    leadSkill: 0.8,          // 0 = mira onde você está · 1 = compensa queda e movimento
    rangeMin: 5,             // recua se você chegar mais perto que isso
    rangeMax: 13,            // avança se estiver mais longe que isso
    strafeMin: 0.8,          // troca de lado a cada N segundos (aleatório entre min e max)
    strafeMax: 2.4,
    maxFireRange: 30,
    shootRagdolls: true,     // continua atirando em quem já está voando (malabarismo)
  },

  physics: {
    gravity: -9.82,          // m/s² (padrão da Terra)
    fixedTimeStep: 1 / 120,  // passo fixo alto = menos projétil atravessando bracinho fino
    maxSubSteps: 10,
    solverIterations: 15,
    ragdollBounciness: 0.35, // restituição ragdoll x cenário (1.0 = bola de borracha)
    maxRagdollSpeed: 45,     // trava de segurança contra tunelamento nas paredes (m/s)
    maxAngularSpeed: 40,     // trava de segurança contra "explosão" do solver (rad/s)
  },

  arena: {
    width: 26,
    depth: 30,
    height: 9,               // altura do teto — alvo da punição
    wallThickness: 2,        // paredes grossas também evitam tunelamento
  },

  // ---------------- FORÇA DO CAOS ----------------
  // Impulsos em N·s. A massa total do boneco é ~8,2 kg,
  // então Δv ≈ impulso / 8,2  (ex.: 200 → ~24 m/s).
  chaos: {
    master: 1.0,             // multiplicador global de tudo abaixo
    punishImpulse: 200,      // errou o quiz → foguete vertical rumo ao teto
    punishSpin: 18,          // rotação aleatória extra na punição (rad/s)
    shotImpulse: 130,        // tiro → empurrão na direção do projétil
    shotLift: 45,            // tiro → componente para cima (deixa o voo mais "cartoon")
    shotSpin: 22,
    limbSpinMultiplier: 1.8, // bracinhos/perninhas giram mais que o tronco
    offCenterJitter: 0.1,    // impulso fora do centro do tronco (gera cambalhota)
    jointLooseness: 1.0,     // abre os limites das juntas (aplicado na criação; recarregue)
    deathMultiplier: 1.6,    // a kill arremessa mais forte que um acerto normal
    flinchScale: 0.08,       // "tranco" de armas que não derrubam (m/s por ponto de knockback)
  },

  character: {
    moveSpeed: 7,
    mouseSensitivity: 0.0022,
    touchLookSensitivity: 0.0065, // celular: rad por pixel arrastado
    keyLookSpeed: 2.6,       // rad/s mirando pelo teclado (P2)
    padLookSpeed: 3.2,       // rad/s no analógico direito (P2)
    recoverTime: 2.5,        // segundos mínimos no chão antes de levantar
    recoverMaxTime: 5,       // levanta de qualquer jeito depois disso
    recoverSpeedThreshold: 1.5,
    ragdollCamera: 'chase',  // 'chase' (vê o próprio voo) | 'head' (câmera presa no tronco)
  },

  weapon: {
    projectileSpeed: 38,
    projectileRadius: 0.18,
    projectileMass: 0.6,
    fireCooldown: 0.22,
    maxProjectiles: 40,
    projectileLifetime: 4,
    minHitSpeed: 6,          // bola rolando devagar não derruba ninguém
  },

  quiz: {
    timeLimit: 10,           // sem resposta = errou = teto
    revealTime: 3,           // mostra a resposta (e o voo) antes da próxima pergunta
  },

  // ---------------- ROTEIRO DA PARTIDA ----------------
  // As próximas etapas entram nesta lista quando forem feitas:
  //   { type: 'rps' }, { type: 'pvp', rounds: 4, map: 'mapa2' },
  //   { type: 'basketball' }, { type: 'pvp', rounds: 4, map: 'sapo' }
  match: {
    // Cada minigame define quem fica restrito no PvP seguinte (quem fez menos pontos).
    stages: [
      { type: 'quiz', questions: 3, map: 'estudio', label: 'QUIZ' },
      { type: 'pvp', rounds: 4, map: 'estudio', label: 'PVP NO ESTÚDIO' },
      { type: 'rps', bestOf: 3, map: 'estudio', label: 'PEDRA, PAPEL E TESOURA' },
      { type: 'pvp', rounds: 4, map: 'bastidores', label: 'PVP NOS BASTIDORES' },
      { type: 'basketball', bestOf: 3, map: 'quadra', label: 'BASQUETE COM GRANADAS' },
      { type: 'pvp', rounds: 4, map: 'rua', label: 'PVP FINAL NA RUA' },
    ],
    buyTime: 15,             // segundos de loja antes de cada round
    roundTimeLimit: 90,      // estourou: vence o time com mais HP somado
    roundEndTime: 5,
    tiebreakTime: 30,        // desempate do quiz "na mão"
    matchEndTime: 12,
  },

  // ---------------- DINHEIRO ----------------
  economy: {
    startMoney: 0,
    quizCorrect: 300,        // por pergunta certa (errar só deixa de ganhar)
    rpsWin: 300,             // por rodada ganha no pedra-papel-tesoura
    basketPoints: 400,       // por cesta (para quem arremessou)
    roundWin: 500,           // para cada jogador do time que venceu o round
    killReward: 300,         // base por kill, multiplicada abaixo
    headshotMult: 2,
    meleeMult: 3,            // kill no soco
    duckKillMult: 5,         // kill com o patinho (humilhação)
    doubleKillMult: 1.5,     // 2ª kill dentro da janela (vale mais com 8 jogadores)
    multiKillWindow: 6,      // segundos
  },

  rps: {
    timeLimit: 6,            // segundos para escolher (não escolheu = perde)
    maxThrows: 12,           // trava contra empates infinitos
  },

  basketball: {
    timeLimit: 150,          // estourou: vence quem tiver mais cestas
    ballRadius: 0.3,
    throwSpeed: 10.5,        // m/s do arremesso (mire pra cima!)
    kickoffPause: 1.6,       // pausa antes de cada "bola ao alto"
  },

  grenade: {
    cooldown: 3,
    fuse: 1.3,
    speed: 13,
    radius: 4.5,
    knock: 1.4,              // força do arremesso (1 = tiro cheio)
    ballPush: 12,
  },

  player: {
    maxHp: 100,
    maxArmor: 50,
  },
};

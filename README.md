# Programa de Auditório Clandestino — Greybox (Fase 3: as 6 etapas)

FPS 1v1 com Three.js + cannon-es. Quiz de matemática → erra e vai pro teto → tiroteio com ragdoll.

Por padrão você joga em **tela cheia contra um bot offline** (o P2, "FONE"), que se comporta como um jogador em outro PC. Para voltar ao 1v1 local de tela dividida: `CONFIG.game.mode = 'splitscreen'` em `src/config.js`.

## Rodar

```bash
npm install
npm run dev              # http://localhost:5173
npm test                 # física + bot + PARTIDA INTEIRA bot × bot (regras das etapas 1 e 2)
npm run build:standalone # gera dist-standalone/index.html (abre com dois cliques, sem servidor)
```

## Celular / APK

No celular aparecem controles de toque: joystick à esquerda (aparece onde o dedo encostar), arrastar à direita para mirar, **ATIRAR** (dá para arrastar e mirar enquanto atira) e **SOCO**. Quiz e loja são tocados direto nos botões.

O APK é gerado no GitHub (`.github/workflows/android-apk.yml`): a cada push na `main`, o GitHub Actions compila e publica o `auditorio-clandestino.apk` em **Releases**. No celular, abra a página de Releases do repositório, baixe o APK e instale (o Android vai pedir para permitir "instalar apps desconhecidos" do navegador). O projeto Android é a pasta `android/` (Capacitor). Para atualizar localmente: `npm run android:sync`.

## Como a partida funciona (6 etapas)

| # | Etapa | Mapa | Dinheiro | Perdeu? |
|---|---|---|---|---|
| 1 | **Quiz** (3 perguntas) | Estúdio | +$300 por acerto | errou → teto |
| 2 | **PvP**, 4 rounds, loja de 15 s | Estúdio | round +$500 · kill +$300 × multiplicadores | — |
| 3 | **Pedra, papel e tesoura** (melhor de 3) | Estúdio | +$300 por rodada ganha | perdeu a rodada → teto |
| 4 | **PvP**, 4 rounds | **Bastidores**: corredores, barra giratória no centro e paredes deslizantes que derrubam | idem | — |
| 5 | **Basquete com granadas** (melhor de 3) | **Quadra** | +$400 por cesta | ninguém morre: soco empurra, granada arremessa e quem cai solta a bola |
| 6 | **PvP final**, 4 rounds | **Rua** ("sapo atravessando"): carros só derrubam, quem mata é tiro | idem | — |

- **Cada minigame (1, 3 e 5) pune quem fez menos pontos no PvP seguinte:** com 0 pontos fica com o **patinho**, com 1 ou mais fica com o **estilingue**, e em nenhum dos casos pode comprar nada nos 4 rounds. Se todos empatarem, **"saem na mão"**: desempate só no soco.
- **Vencedor da partida:** o time com mais rounds ganhos nos 3 PvPs (12 rounds).
- **Basquete:** encoste na bola para pegar. ATIRAR arremessa a bola (mire para cima!) e, sem a bola, joga uma granada (3 s de recarga). SOCO empurra. A cesta do outro lado é a sua.
- Para testar uma etapa direto: painel **G** → Testes → "Pular para etapa".

Os mapas ficam em `src/world/maps.js` e o roteiro em `CONFIG.match.stages`.

### Armas (`src/data/catalog.js`)

| Arma | Preço | Dano | Observação |
|---|---|---|---|
| Patinho de Borracha | só para quem errou tudo | 5 | arremessa e precisa buscar de volta |
| Estilingue de Feira | grátis (padrão) | 12 | a mais fraca |
| Pistola de Bolinha | $300 | 20 | headshot ×2,5 |
| Escopeta de Confete | $650 | 14 × 7 | derruba |
| Metralhadora de Quermesse | $900 | 11 | rápida |
| Canhão de Melancia | $1300 | 75 | derruba, lenta |
| Colete de Isopor / Colchão | $250 / $450 | +25 / +50 | — |
| Soco (todos) | — | 34 | botão direito ou V, derruba |

Armas com "derruba" ativam o ragdoll a cada acerto. As outras dão só um tranco. A kill sempre arremessa forte.

## Controles

Contra o bot: WASD + mouse (clique na tela para travar), clique atira, **botão direito/V soca**, 1/2 responde o quiz, 1/2/3 = pedra/papel/tesoura, 1–6 compra, Enter pronto.

Em tela dividida (`CONFIG.game.mode = 'splitscreen'`):

| | P1 (esquerda) | P2 (direita) |
|---|---|---|
| Andar | WASD | Setas · analógico esquerdo |
| Mirar | Mouse (clique na tela p/ travar) | IJKL / Numpad 8-4-5-6 · analógico direito |
| Atirar | Clique esquerdo · F | Enter / Numpad 0 · RT |
| Socar | Botão direito · V | Shift direito · RB |
| Responder | 1 / 2 | 9 / 0 · X / B |
| Comprar | 1–6 · clique | clique |

**G** abre o painel: força do caos, bot, dinheiro e botões de teste ("Pular direto pro PvP", "+$1000 pra mim", "Matar bot"). No console: `game`.

## Estrutura

```
src/
  config.js                 ← TODOS os valores ajustáveis (CONFIG.chaos = força do caos)
  ai/BotController.js       bot offline (mesma interface dos controles): quiz, loja, tiro, soco, patinho
  data/catalog.js           armas, coletes e soco (dados puros)
  systems/DamageSystem.js   dano, colete, headshot, tranco/ragdoll, kill
  systems/Basketball.js     bola: pegar, carregar, arremessar, cesta
  systems/Grenades.js       granadas que arremessam sem dano
  core/
    Match.js                estado da partida: dinheiro, restrições, rounds, kills, recompensas
    MatchFlow.js            roteiro: percorre CONFIG.match.stages e decide o próximo estado
    Game.js                 orquestra o loop: input → estado → física → câmeras → render
    StateMachine.js         máquina de estados genérica + GameStates
    Input.js                teclado/mouse brutos (pointer lock)
    Controls.js             esquemas de controle → "intenção" neutra (teclado, mouse, gamepad)
    DebugGUI.js             painel lil-gui
  states/
    QuizState.js            etapa 1: 3 perguntas, dinheiro, teto
    TiebreakState.js        empate no quiz → só soco
    BuyState.js             15 s de loja
    RoundState.js           PvP valendo, kills e fim de round
    RpsState.js             etapa 3: pedra, papel e tesoura
    BasketballState.js      etapa 5: basquete com granadas
    EndStates.js            resumo do round (recompensas) e fim de partida
  physics/
    PhysicsWorld.js         mundo cannon-es, materiais, grupos de colisão, sync corpo→malha
    ChaosForces.js          punishLaunch() e shotKnockback() — as duas forças do jogo
  entities/
    Character.js            proxy de controle + ragdoll com juntas
    Weapon.js               cadência e disparo
    ProjectileSystem.js     esferas físicas, detecção de acerto (fila fora do passo físico)
  camera/
    PlayerCamera.js         1ª pessoa / chase cam no ragdoll / layers
    SplitScreenRenderer.js  viewport por jogador
  world/Arena.js            gerenciador de mapas, obstáculos móveis (derrubam sem dano)
  world/maps.js             Estúdio, Bastidores, Quadra e Rua
  quiz/QuestionGenerator.js
  ui/HUD.js + style.css
```

Fluxo: `QUIZ → PvP ×4 → RPS → PvP ×4 (Bastidores) → BASQUETE → PvP ×4 (Rua) → MATCH_END → nova partida` (com TIEBREAK depois de qualquer minigame empatado).

## Como o ragdoll funciona

Cada boneco tem dois "corpos":

1. **Controller** — dinâmico, invisível, duas esferas empilhadas, rotação travada e sem atrito. É o que anda e segura o boneco de pé.
2. **Peças** — tronco (cilindro), 2 braços, 2 antebraços, 2 pernas e a arma. Enquanto o jogador controla, são **kinemáticas**: seguem o controller numa pose fixa a cada passo. Já recebem tiro, mas a gravidade não age nelas.

Ao errar ou levar tiro, `goRagdoll()` desliga o controller (máscara de colisão = 0), troca as peças para **dinâmicas** herdando a velocidade, e as juntas assumem:

| Junta | Tipo cannon-es | Comportamento |
|---|---|---|
| Ombro (tronco↔braço) | `ConeTwistConstraint` | gira num cone de ~108° em volta do eixo "para baixo", torção limitada |
| Cotovelo (braço↔antebraço) | `HingeConstraint` (eixo X) | **sem limite** de ângulo: dobra pros dois lados (bizarro de propósito) |
| Quadril (tronco↔perna) | `ConeTwistConstraint` | cone mais fechado (~72°) |
| Arma (tronco↔arma) | `LockConstraint` | presa rígida ao corpo, voa junto |

O impulso é **distribuído por massa** entre as peças (o boneco inteiro voa junto, sem esticar as juntas). Por cima disso entra um giro aleatório (`punishSpin`/`shotSpin`, membros multiplicados por `limbSpinMultiplier`) e um leve impulso fora do centro do tronco, que gera a cambalhota. `recover()` levanta o boneco onde o tronco parou, depois de `recoverTime`.

Autocolisão: peças do mesmo boneco não colidem entre si (cada jogador tem seu bit de grupo). Isso evita que o solver "exploda" e também faz o projétil ignorar o dono.

## Ajustando o caos

Tudo em `src/config.js → CONFIG.chaos`. A massa total do boneco é ~8,2 kg, então Δv ≈ impulso ÷ 8,2.
`punishImpulse: 200` ≈ 24 m/s para cima (bate no teto a 9 m). `master` multiplica tudo.
`jointLooseness` só vale na criação (recarregue a página). As travas `maxRagdollSpeed`/`maxAngularSpeed` impedem tunelamento e NaN mesmo com `master = 5` (coberto pelo teste).

## Limitações conhecidas (greybox)

- Levantar é instantâneo (teleporte para a pose em pé). Um blend animado vem depois.
- Cotovelos não têm limite (cannon-es não limita hinge). Se quiser menos bizarro, troque por `ConeTwistConstraint` com cone pequeno.
- Projéteis sofrem gravidade (arco). Para tiro reto, compense com força anti-gravidade no `ProjectileSystem`.
- Bot sem navegação de verdade (sem navmesh): contorna obstáculos trocando de lado quando trava.
- No modo tela dividida, 2 jogadores no mesmo teclado é apertado: para o P2, use gamepad.

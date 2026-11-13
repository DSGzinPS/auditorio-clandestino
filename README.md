# Programa de Auditório Clandestino — Greybox (Fase 4: armas reais, rede e som)

FPS 1v1 com Three.js + cannon-es. Quiz de matemática → erra e vai pro teto → tiroteio com ragdoll.

Por padrão você joga em **tela cheia contra um bot offline** (o P2, "FONE"), que se comporta como um jogador em outro PC — ou **em rede** com outro aparelho (PC ↔ celular, celular ↔ celular). Para o 1v1 local de tela dividida: `CONFIG.game.mode = 'splitscreen'` em `src/config.js`.

## Baixar a alpha (sem instalar nada)

- **Jogar no navegador:** https://dsgzinps.github.io/auditorio-clandestino/
- **PC:** em [Releases](https://github.com/DSGzinPS/auditorio-clandestino/releases/latest), baixe `auditorio-clandestino-jogavel.html` e abra com dois cliques (Chrome/Edge).
- **Celular:** na mesma página, baixe `auditorio-clandestino.apk` e instale.

Tudo é gerado sozinho a cada atualização na `main`.

## Rodar (para programar)

```bash
npm install
npm run dev              # http://localhost:5173
npm test                 # física + bot + balística + PARTIDA INTEIRA bot × bot
npm run build:standalone # gera dist-standalone/index.html (abre com dois cliques, sem servidor)
npm run lan-server       # servidor de rede local (jogar em rede SEM internet)
npm run dev:lan          # abre o jogo pra rede: o celular acessa http://IP-DO-PC:5173
```

## Menu, pausa e HUD

- **Menu principal:** Jogar, dificuldade do bot, "Começar em" (pula para qualquer etapa), Configurações (sensibilidade da mira, gráficos Leve/Médio/Bonito, força do caos, painel de teste), Ajustar HUD e Como jogar. Tudo fica salvo no aparelho.
- **Pausa:** ESC ou P no PC, botão ⏸ na tela (no celular também). Tem Continuar, Ajustar HUD, Configurações, Reiniciar e Sair para o menu.
- **Ajustar HUD:** arraste os botões (Atirar, Soco, Pular, Agachar, Correr), a pausa, o placar, a vida e a arma/dinheiro. Toque num item para mudar o tamanho. "Padrão" desfaz tudo.
- **Movimento:** PC: Espaço pula, Shift corre, C agacha. Celular: botão PULAR; AGACHAR e CORRER ligam/desligam (o joystick no talo também corre). Agachado você anda mais devagar, o olho desce e o hitbox fica menor (a cabeça baixa junto).
- **Quiz e pedra-papel-tesoura:** quando alguém vai pro teto, o cartão some para todo mundo assistir ao voo. Quem ainda não respondeu fica com um cartão mini no rodapé.

## Jogar em rede (LAN)

Menu → **JOGAR EM REDE (LAN)**. Um aparelho toca em **CRIAR SALA** e aparece um código de 4 letras; o outro digita o código e toca em **ENTRAR**. A partida começa sozinha quando os dois estão conectados. Funciona PC ↔ celular (APK ou navegador) e celular ↔ celular.

- **Com internet (padrão):** o servidor público do PeerJS só "apresenta" os dois aparelhos; depois o jogo vai **direto pela sua rede** (WebRTC).
- **Sem internet:** no PC rode `npm run lan-server`. Ele mostra o IP do PC (ex.: `192.168.0.10`). Nos **dois** aparelhos, em "Sem internet? Servidor no PC", digite esse IP. Se o Windows perguntar, libere o firewall para redes privadas.
- Quem cria a sala é o **host**: a física e as regras rodam nele, e ele manda a cena ~60×/s. O convidado mira localmente (sem atraso no mouse/dedo) e manda os comandos. Pra teste interno no mesmo Wi-Fi isso fica liso.
- Pausar em rede só abre o menu — o jogo continua para o outro. "Sair da sala" (ou desconectar) leva os dois de volta ao menu.

## Celular / APK

No celular aparecem controles de toque: joystick à esquerda (aparece onde o dedo encostar), arrastar à direita para mirar, **ATIRAR** (dá para arrastar e mirar enquanto atira) e **SOCO**. Quiz e loja são tocados direto nos botões.

O APK é gerado no GitHub (`.github/workflows/android-apk.yml`): a cada push na `main`, o GitHub Actions compila e publica o `auditorio-clandestino.apk` em **Releases**. No celular, abra a página de Releases do repositório, baixe o APK e instale (o Android vai pedir para permitir "instalar apps desconhecidos" do navegador). O projeto Android é a pasta `android/` (Capacitor). Para atualizar localmente: `npm run android:sync`.

## Como a partida funciona (6 etapas)

| # | Etapa | Mapa | Dinheiro | Perdeu? |
|---|---|---|---|---|
| 1 | **Quiz** (3 perguntas) | Estúdio | +$400 por acerto | errou → teto |
| 2 | **PvP**, 4 rounds, loja de 15 s | Estúdio | round +$800 · kill +$400 × multiplicadores | — |
| 3 | **Pedra, papel e tesoura** (melhor de 3) | Estúdio | +$400 por rodada ganha | perdeu a rodada → teto |
| 4 | **PvP**, 4 rounds | **Bastidores**: corredores, barra giratória no centro e paredes deslizantes que derrubam | idem | — |
| 5 | **Basquete com bola-bomba** (melhor de 3) | **Quadra** | +$500 por cesta | ninguém morre: no chão ou num jogador a bola explode e arremessa; quem voa levanta com outra bola |
| 6 | **PvP final**, 4 rounds | **Rua** ("sapo atravessando"): carros só derrubam, quem mata é tiro | idem | — |

- **Cada minigame (1, 3 e 5) pune quem fez menos pontos no PvP seguinte:** com 0 pontos fica com o **patinho**, com 1 ou mais fica com o **estilingue**, sem loja — **só no 1º round** (`CONFIG.match.punishRounds`). Do 2º round em diante todo mundo compra. A punição que sobra é ter menos dinheiro.
- **Bônus de derrota (estilo CS):** quem perde o round ganha $600, +$300 a cada derrota seguida (máx. $1500). Evita a bola de neve de quem já começou atrás. Se todos empatarem, **"saem na mão"**: desempate só no soco.
- **Vencedor da partida:** o time com mais rounds ganhos nos 3 PvPs (12 rounds).
- **Fim de partida:** não recomeça sozinho. Cada um escolhe **PEDIR REVANCHE** ou **SAIR DA SALA**. A revanche só começa quando **todos aceitam**; se alguém sair, volta pro menu. (O bot sempre topa.)
- **Basquete:** cada jogador tem a própria bola-bomba (outra aparece na mão 0,9 s depois de arremessar). Na cesta é ponto. No chão ou num jogador ela explode e arremessa quem estiver perto, sem dano. SOCO empurra. A cesta do outro lado é a sua.
- Para testar uma etapa direto: painel **G** → Testes → "Pular para etapa".

Os mapas ficam em `src/world/maps.js` e o roteiro em `CONFIG.match.stages`.

### Armas e balística (`src/data/catalog.js`)

Modelos 3D: **Ultimate Gun Pack, de Quaternius (CC0, domínio público)** — RPG, minigun e estilingue são feitos em código.

| Categoria | Arma | Preço | Dano (cabeça) | Cadência | Pente |
|---|---|---|---|---|---|
| — | Estilingue (padrão) | grátis | 18 (36) | semi | 8 / ∞ |
| Pistolas | Glock · USP · Revólver .38 · Desert Eagle | $200 · $300 · $350 · $700 | 22 · 30 · 42 · 58 (×2,4–2,6) | semi | 17 · 12 · 6 · 7 |
| Submetralhadoras | MP7 · MP5 · UMP-45 | $1000 · $1100 · $1200 | 18 · 21 · 27 (×2,2) | 950 · 800 · 600 rpm | 40 · 30 · 25 |
| Fuzis | AK-47 · M4 · HK416 | $1900 · $2100 · $2300 | 36 · 31 · 32 (×3,5: AK mata com 1 na cabeça) | 600 · 800 · 760 rpm | 30 |
| Escopetas | Cano Serrado · Pump · Semiautomática | $700 · $900 · $1500 | 14×10 · 15×8 · 12×7 chumbos | 2 tiros · bomba · semi | 2 · 6 · 7 |
| Pesadas | RPG-7 · Minigun | $3200 · $4000 | explosão 130 (raio 4,5 m) · 13 | — · 2000 rpm (gira 0,7 s antes) | 1+4 · 200 |
| Colete | Leve · Pesado | $400 · $700 | +25 · +50 (absorve **metade** do dano) | | |
| Soco (todos) | | | 34, derruba | | |

Como no CS/Valorant: **bala instantânea** (raio, sem projétil), **headshot** pelo ponto de impacto, **dano cai com a distância** (SMG e escopeta perdem muito de longe), **pente + reserva + recarga** (automática quando esvazia, ou R), **recuo** que sobe a mira a cada tiro e volta quando você solta, **dispersão** que abre andando/pulando/em rajada e fecha parado, agachado ou **mirando (zoom)**. Armas pesadas deixam você mais lento. Escopetas e RPG derrubam (ragdoll). Ajuste fino no painel **G**: dano ×, recuo ×, dispersão ×.

## Sons

Tudo sintetizado na hora (WebAudio, sem arquivos): tiro diferente por arma, recarga, sem bala, soco, bala pegando, ricochete, hitmarker, explosão, foguete, minigun girando, patinho, "boing" de quem vai pro teto, ding/buzina do quiz, caixa registradora da loja, buzina de abertura, **plateia** (murmúrio contínuo + vibra na kill, "óóóh" no headshot, risada quando alguém erra) e **cenário** (motor e buzina dos carros na Rua, barra giratória). Sons em 3D (vem do lado certo). Volume de efeitos e da plateia em Configurações.

## Controles

Contra o bot / em rede: WASD + mouse (clique na tela para travar), clique atira, **botão direito/Z mira (zoom)**, **R recarrega**, **V / botão do meio soca**, 1/2 responde o quiz, 1/2/3 = pedra/papel/tesoura, loja: **Q/E troca de aba**, 1–4 compra, Enter pronto.
Celular: botões ATIRAR, SOCO, PULAR, **RECARREGAR** e **MIRA** (liga/desliga), além de AGACHAR e CORRER.

Em tela dividida (`CONFIG.game.mode = 'splitscreen'`):

| | P1 (esquerda) | P2 (direita) |
|---|---|---|
| Andar | WASD | Setas · analógico esquerdo |
| Mirar | Mouse (clique na tela p/ travar) | IJKL / Numpad 8-4-5-6 · analógico direito |
| Atirar | Clique esquerdo · F | Enter / Numpad 0 · RT |
| Socar | V · botão do meio | Shift direito · RB |
| Mirar / recarregar | Botão direito · Z / R | Numpad / e - · LT / X |
| Responder | 1 / 2 | 9 / 0 · X / B |
| Comprar | 1–6 · clique | clique |

**G** abre o painel: força do caos, bot, dinheiro e botões de teste ("Pular direto pro PvP", "+$1000 pra mim", "Matar bot"). No console: `game`.

## Estrutura

```
src/
  config.js                 ← TODOS os valores ajustáveis (CONFIG.chaos = força do caos)
  ai/BotController.js       bot offline (mesma interface dos controles): quiz, loja, tiro, soco, patinho
  data/catalog.js           armas (balística de cada uma), coletes, soco e abas da loja
  assets/guns/*.glb         modelos 3D das armas (Quaternius, CC0)
  net/                      jogo em rede: NetSession (PeerJS/WebRTC), NetHost (snapshots + HUD remoto), NetGuest
  systems/Ballistics.js     tiro hitscan: dispersão, queda de dano, headshot, explosão do RPG
  systems/Effects.js        traçante, impacto, clarão de explosão
  systems/AudioSystem.js    todos os sons (sintetizados, 3D) e a plateia
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
    Weapon.js               gatilho semi/auto, pente, recarga, mira (ADS), recuo, minigun
    GunModels.js            carrega e normaliza os modelos 3D (+ RPG/minigun/estilingue em código)
    ProjectileSystem.js     esferas físicas, detecção de acerto (fila fora do passo físico)
  camera/
    PlayerCamera.js         1ª pessoa / chase cam no ragdoll / layers
    SplitScreenRenderer.js  viewport por jogador
  world/Arena.js            gerenciador de mapas, obstáculos móveis (derrubam sem dano)
  world/maps.js             Estúdio, Bastidores, Quadra e Rua
  quiz/QuestionGenerator.js
  ui/HUD.js + style.css
```

Fluxo: `QUIZ → PvP ×4 → RPS → PvP ×4 (Bastidores) → BASQUETE → PvP ×4 (Rua) → MATCH_END → (revanche aceita por todos) nova partida` (com TIEBREAK depois de qualquer minigame empatado).

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
- Estilingue e patinho continuam sendo projéteis físicos (com arco); as armas de fogo são instantâneas.
- Rede: o convidado vê o próprio boneco com o atraso da rede (sem previsão de movimento). No mesmo Wi-Fi é imperceptível; pela internet longe pode "escorregar". Por enquanto 2 jogadores por sala.
- Bot sem navegação de verdade (sem navmesh): contorna obstáculos trocando de lado quando trava.
- No modo tela dividida, 2 jogadores no mesmo teclado é apertado: para o P2, use gamepad.

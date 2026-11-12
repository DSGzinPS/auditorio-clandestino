// 15 s de loja antes de cada round. Travados no spawn, olhando em volta.
// Perdedor do quiz: não compra nada (estilingue ou patinho).

import { State, GameStates } from '../core/StateMachine.js';
import { CONFIG } from '../config.js';
import { SHOP_ORDER, shopItem } from '../data/catalog.js';

export class BuyState extends State {
  enter() {
    const g = this.context;
    const m = g.flow.match;
    g.combatActive = false;
    g.projectiles.clear();
    m.prepareRound();

    const slots = {};
    g.players.forEach((p) => {
      const slot = (slots[p.team] = (slots[p.team] ?? -1) + 1);
      const s = g.arena.pvpSpawn(p, slot);
      p.teleport(s.position, s.yaw);
      p.frozen = true;
      p.canLook = true;
    });

    this.timer = CONFIG.match.buyTime;
    this.ready = new Set();
    const total = g.flow.stage.rounds;
    g.hud.setPhase(`LOJA · ROUND ${m.roundInStage + 1}/${total}`);
    g.hud.setCrosshairs(false);
    g.hud.setLockHint(false);
    g.hud.showShop(m, SHOP_ORDER.map(shopItem));
    g.hud.onBuy = (pi, id) => this.buy(pi, id);
    g.hud.onReady = (pi) => this.ready.add(pi);
    g.input.releaseLock();
    g.schemes.forEach((s) => s.onBuyPhase?.());
  }

  buy(pi, id) {
    const g = this.context;
    const r = g.flow.match.buy(pi, id);
    const item = shopItem(id);
    g.hud.shopFeedback(pi, r.ok ? `Comprou: ${item.name}` : r.reason, r.ok);
    return r;
  }

  update(dt) {
    const g = this.context;
    g.intents.forEach((it, i) => {
      if (it.buy !== null && SHOP_ORDER[it.buy]) this.buy(i, SHOP_ORDER[it.buy]);
      if (it.ready) this.ready.add(i);
    });
    this.timer -= dt;
    g.hud.updateShop(g.flow.match, Math.max(0, this.timer), this.ready);
    if (this.timer <= 0 || this.ready.size === g.players.length) g.sm.change(GameStates.ROUND);
  }

  exit() {
    const g = this.context;
    g.hud.hideShop();
    g.hud.onBuy = null;
    g.hud.onReady = null;
    g.players.forEach((p) => { p.canLook = false; });
  }
}

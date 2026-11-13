// 15 s de loja antes de cada round. Travados no spawn, olhando em volta.
// Castigado do minigame: não compra (estilingue ou patinho) até eliminar alguém.
// Loja em abas (Q/E trocam, 1–9 compram dentro da aba).

import { State, GameStates } from '../core/StateMachine.js';
import { CONFIG } from '../config.js';
import { SHOP_TABS, SHOP_ORDER, shopItem } from '../data/catalog.js';

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
    this.tabs = g.players.map(() => 0);
    const total = g.flow.stage.rounds;
    g.hud.setPhase(`LOJA · ROUND ${m.roundInStage + 1}/${total}`);
    g.hud.setCrosshairs(false);
    g.hud.setLockHint(false);
    g.hud.showShop(m, SHOP_TABS.map((t) => ({ ...t, items: t.items.map(shopItem) })));
    g.hud.onTab = (pi, tab) => { this.tabs[pi] = tab; g.hud.setShopTab(pi, tab); };
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
    g.sfx(r.ok ? 'cash' : 'denied', null, { forWho: pi });
    return r;
  }

  update(dt) {
    const g = this.context;
    g.intents.forEach((it, i) => {
      if (it.setTab !== null && it.setTab !== undefined && SHOP_TABS[it.setTab]) {
        this.tabs[i] = it.setTab;
        g.hud.setShopTab(i, it.setTab);
      }
      if (it.tab) {
        this.tabs[i] = (this.tabs[i] + it.tab + SHOP_TABS.length) % SHOP_TABS.length;
        g.hud.setShopTab(i, this.tabs[i]);
      }
      const tabItems = SHOP_TABS[this.tabs[i]].items;
      if (it.buy !== null && tabItems[it.buy]) this.buy(i, tabItems[it.buy]);
      if (it.buyId && SHOP_ORDER.includes(it.buyId)) this.buy(i, it.buyId);
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
    g.hud.onTab = null;
    g.players.forEach((p) => { p.canLook = false; });
  }
}

// =============================================================
//  Conexão entre dois aparelhos (PC ↔ celular, celular ↔ celular).
//  WebRTC via PeerJS: o "servidor" só apresenta os dois aparelhos
//  (sinalização); depois os dados vão DIRETO pela rede local.
//
//  Sinalização:
//    • padrão: servidor público do PeerJS (precisa de internet só pra conectar)
//    • LAN pura: rode `npm run lan-server` no PC e digite o IP dele no jogo
// =============================================================

const PREFIX = 'auditorio-clandestino-v1-';
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sem 0/O, 1/I/L

export function randomCode(n = 4) {
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

/** "192.168.0.10" ou "192.168.0.10:9000" → opções do PeerJS. */
export function peerOptions(server) {
  const s = (server ?? '').trim();
  const base = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] } };
  if (!s) return base;
  const [host, port] = s.replace(/^\w+:\/\//, '').split(':');
  return { ...base, host, port: Number(port) || 9000, path: '/', secure: false, config: { iceServers: [] } };
}

/**
 * Host: aceita até `maxGuests` convidados (cada um é um "peer").
 * Convidado: uma conexão só, com o host.
 * Mensagens: onMessage(obj, peer) — no convidado, peer é sempre o host.
 */
export class NetSession {
  constructor() {
    this.peer = null;
    this.role = null; // 'host' | 'guest'
    this.code = null;
    this.peers = [];       // conexões abertas: { id, conn, alive, info }
    this.maxGuests = 3;
    this.locked = false;   // partida começou: não entra mais ninguém
    this.onMessage = null; // (obj, peer)
    this.onJoin = null;    // host: (peer) chegou alguém
    this.onLeave = null;   // host: (peer, motivo) alguém saiu
    this.onClose = null;   // (motivo) a sala acabou pra mim
    this.onStatus = null;
    this.closed = false;
    this._nextId = 1;
  }

  async _peer(id, server) {
    const { Peer } = await import('peerjs');
    return new Promise((resolve, reject) => {
      const peer = new Peer(id, peerOptions(server));
      const fail = (e) => reject(e);
      peer.once('open', () => { peer.off('error', fail); resolve(peer); });
      peer.once('error', fail);
    });
  }

  /** Cria a sala. Resolve com o código; onJoin dispara a cada convidado que entra. */
  async host(server) {
    this.role = 'host';
    for (let tries = 0; tries < 4; tries++) {
      this.code = randomCode();
      try {
        this.peer = await this._peer(PREFIX + this.code, server);
        break;
      } catch (e) {
        if (e?.type !== 'unavailable-id' || tries === 3) throw e;
      }
    }
    this.peer.on('connection', (conn) => {
      if (this.locked || this.peers.length >= this.maxGuests) {
        conn.on('open', () => { conn.send({ t: this.locked ? 'started' : 'full' }); setTimeout(() => conn.close(), 300); });
        return;
      }
      this._bind(conn);
    });
    this.peer.on('error', (e) => this.onStatus?.(`Erro de rede: ${e.type ?? e.message}`));
    this.peer.on('disconnected', () => { if (!this.closed) this.peer.reconnect(); });
    this._watch = setInterval(() => this._checkAlive(), 1000);
    return this.code;
  }

  /** Entra na sala de outro aparelho. */
  async join(code, server) {
    this.role = 'guest';
    this.code = code.trim().toUpperCase();
    this.peer = await this._peer(undefined, server);
    this._watch = setInterval(() => this._checkAlive(), 1000);
    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
      const timer = setTimeout(() => reject(new Error('Sala não encontrada (confira o código)')), 12000);
      this.peer.once('error', (e) => { clearTimeout(timer); reject(e.type === 'peer-unavailable' ? new Error('Sala não encontrada (confira o código)') : e); });
      conn.once('open', () => { clearTimeout(timer); resolve(); });
      this._bind(conn);
    });
  }

  _bind(conn) {
    const peer = { id: this._nextId++, conn, alive: performance.now(), info: {} };
    conn.on('open', () => {
      peer.alive = performance.now();
      this.peers.push(peer);
      if (this.role === 'host') this.onJoin?.(peer);
    });
    conn.on('data', (d) => {
      peer.alive = performance.now();
      if (d?.t === 'bye') return this._drop(peer, this.role === 'host' ? 'saiu da sala' : 'O host fechou a sala');
      if (d?.t === 'full') return this._drop(peer, 'A sala já está cheia (máx. 4)');
      if (d?.t === 'started') return this._drop(peer, 'A partida dessa sala já começou');
      this.onMessage?.(d, peer);
    });
    conn.on('close', () => this._drop(peer, this.role === 'host' ? 'desconectou' : 'O host desconectou'));
    conn.on('error', () => this._drop(peer, 'a conexão caiu'));
  }

  /** WebRTC às vezes "some" sem fechar: sem nada por 12 s = caiu. */
  _checkAlive() {
    const now = performance.now();
    for (const p of [...this.peers]) if (now - p.alive > 12000) this._drop(p, 'sem resposta');
  }

  _drop(peer, reason) {
    if (this.closed || !this.peers.includes(peer)) return;
    this.peers = this.peers.filter((x) => x !== peer);
    try { peer.conn.close(); } catch { /* ok */ }
    if (this.role === 'host') this.onLeave?.(peer, reason);
    else this._lost(reason);
  }

  _lost(reason) {
    if (this.closed) return;
    this.close();
    this.onClose?.(reason);
  }

  get connected() {
    return !this.closed && this.peers.some((p) => p.conn.open);
  }

  /** Mensagens acumulando (rede lenta): pula snapshots. */
  get congested() {
    return this.peers.some((p) => (p.conn.dataChannel?.bufferedAmount ?? 0) > 256 * 1024);
  }

  /** Manda pra todo mundo (host) ou pro host (convidado). */
  send(obj) {
    for (const p of this.peers) this.sendTo(p, obj);
  }

  sendTo(peer, obj) {
    if (this.closed || !peer.conn.open) return;
    try { peer.conn.send(obj); } catch { /* canal fechando */ }
  }

  /** Host tira alguém da sala (ou o convidado sai). */
  kick(peer) {
    this.sendTo(peer, { t: 'bye' });
    setTimeout(() => this._drop(peer, 'saiu'), 100);
  }

  close() {
    if (this.closed) return;
    this.send({ t: 'bye' });
    this.closed = true;
    clearInterval(this._watch);
    setTimeout(() => { try { this.peers.forEach((p) => p.conn.close()); this.peer?.destroy(); } catch { /* ok */ } }, 150);
  }
}

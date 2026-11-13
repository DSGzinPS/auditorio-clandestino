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

export class NetSession {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.role = null; // 'host' | 'guest'
    this.code = null;
    this.onMessage = null; // (obj) → void
    this.onOpen = null;    // () → conectados
    this.onClose = null;   // (motivo) → caiu
    this.onStatus = null;  // (texto) → menu
    this.closed = false;
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

  /** Cria a sala. Resolve com o código; onOpen dispara quando o outro entrar. */
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
      if (this.conn) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); }); return; }
      this._bind(conn);
    });
    this.peer.on('error', (e) => this.onStatus?.(`Erro de rede: ${e.type ?? e.message}`));
    this.peer.on('disconnected', () => { if (!this.closed && !this.conn) this.peer.reconnect(); });
    return this.code;
  }

  /** Entra na sala de outro aparelho. */
  async join(code, server) {
    this.role = 'guest';
    this.code = code.trim().toUpperCase();
    this.peer = await this._peer(undefined, server);
    return new Promise((resolve, reject) => {
      const conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
      const timer = setTimeout(() => reject(new Error('Sala não encontrada (confira o código)')), 12000);
      this.peer.once('error', (e) => { clearTimeout(timer); reject(e.type === 'peer-unavailable' ? new Error('Sala não encontrada (confira o código)') : e); });
      conn.once('open', () => { clearTimeout(timer); resolve(); });
      this._bind(conn);
    });
  }

  _bind(conn) {
    this.conn = conn;
    conn.on('open', () => this.onOpen?.());
    conn.on('data', (d) => this.onMessage?.(d));
    conn.on('close', () => this._lost('O outro jogador desconectou'));
    conn.on('error', () => this._lost('Conexão caiu'));
    // WebRTC às vezes "some" sem fechar: sem nada por 12 s = caiu
    this._alive = performance.now();
    this._watch = setInterval(() => {
      if (performance.now() - this._alive > 12000) this._lost('Sem resposta do outro aparelho');
    }, 1000);
  }

  _lost(reason) {
    if (this.closed) return;
    this.close();
    this.onClose?.(reason);
  }

  get connected() {
    return !!this.conn?.open && !this.closed;
  }

  /** Mensagens grandes demais acumulando (rede lenta): pula snapshots. */
  get congested() {
    const dc = this.conn?.dataChannel;
    return dc ? dc.bufferedAmount > 256 * 1024 : false;
  }

  send(obj) {
    if (!this.connected) return;
    try { this.conn.send(obj); } catch { /* canal fechando */ }
  }

  touch() {
    this._alive = performance.now();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this._watch);
    try { this.conn?.send({ t: 'bye' }); } catch { /* ok */ }
    setTimeout(() => { try { this.conn?.close(); this.peer?.destroy(); } catch { /* ok */ } }, 150);
  }
}

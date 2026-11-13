// Converte os argumentos das chamadas do HUD (e eventos) em JSON e de volta.
// Personagens, a partida e Sets viram "fichas" que o outro aparelho troca pelos
// objetos dele. Funções somem; Vec3/Vector3 viram {x,y,z}.

const R = (n) => (Number.isFinite(n) ? Math.round(n * 1000) / 1000 : n);

export function encode(v, game, depth = 0) {
  if (v === null || v === undefined) return v ?? null;
  if (typeof v === 'number') return Number.isFinite(v) ? R(v) : { $num: String(v) };
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'function') return undefined;
  if (depth > 5) return null;
  if (game.players.includes(v)) return { $p: v.index };
  if (v === game.flow?.match) return { $m: 1 };
  if (v instanceof Set) return { $set: [...v].map((x) => encode(x, game, depth + 1)) };
  if (Array.isArray(v)) return v.map((x) => encode(x, game, depth + 1));
  if (typeof v === 'object') {
    // vetor do cannon/three: só x,y,z
    if ('x' in v && 'y' in v && 'z' in v && typeof v.x === 'number' && Object.keys(v).length <= 4) {
      return { x: R(v.x), y: R(v.y), z: R(v.z) };
    }
    const out = {};
    for (const k of Object.keys(v)) {
      const e = encode(v[k], game, depth + 1);
      if (e !== undefined) out[k] = e;
    }
    return out;
  }
  return null;
}

export function decode(v, game) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => decode(x, game));
  if ('$p' in v) return game.players[v.$p];
  if ('$m' in v) return game.flow.match;
  if ('$set' in v) return new Set(v.$set.map((x) => decode(x, game)));
  if ('$num' in v) return Number(v.$num);
  const out = {};
  for (const k of Object.keys(v)) out[k] = decode(v[k], game);
  return out;
}

/** Arredonda um vetor/quaternion para mandar na rede. */
export const pack3 = (p) => [R(p.x), R(p.y), R(p.z)];
export const pack7 = (p, q) => [R(p.x), R(p.y), R(p.z), R(q.x), R(q.y), R(q.z), R(q.w)];

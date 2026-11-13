// URLs dos modelos .glb (resolvidas pelo Vite). Só é importado no navegador.
// Modelos: "Ultimate Gun Pack" por Quaternius — CC0 (domínio público).
export const GUN_URLS = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/guns/*.glb', { eager: true, query: '?url', import: 'default' }))
    .map(([path, url]) => [path.split('/').pop().replace('.glb', ''), url]),
);

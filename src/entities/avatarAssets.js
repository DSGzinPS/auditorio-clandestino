// URLs das texturas dos personagens (só no navegador; os testes não carregam imagens).
export const AVATAR_URLS = Object.fromEntries(Object.entries(import.meta.glob('../assets/avatars/*.png', { eager: true, query: '?url', import: 'default' })).map(([path, url]) => [path.split('/').pop().replace('.png', ''), url]));

// Servidor de sinalização pra jogar em rede SEM internet (só Wi-Fi local).
// Uso no PC:  npm run lan-server   → digite o IP mostrado no menu "Jogar em rede".
import os from 'node:os';
import http from 'node:http';
import express from 'express';
import { ExpressPeerServer } from 'peer';

const PORT = Number(process.env.PORT) || 9000;
const app = express();
const server = http.createServer(app);
app.use('/', ExpressPeerServer(server, { path: '/', allow_discovery: false }));
server.listen(PORT, '0.0.0.0'); // IPv4: é o que os celulares usam na rede de casa

const ips = Object.values(os.networkInterfaces()).flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n.address);
console.log(`\nServidor da LAN rodando na porta ${PORT}.`);
console.log('No menu "JOGAR EM REDE" → "Sem internet?", digite nos DOIS aparelhos:');
for (const ip of ips) console.log(`   ${ip}${PORT === 9000 ? '' : ':' + PORT}`);
console.log('\n(O Windows pode pedir permissão de firewall: libere para "Redes privadas".)\n');

import './style.css';
import { Game } from './core/Game.js';

const game = new Game(document.getElementById('app'), document.getElementById('hud'));
game.start();
window.game = game; // console: game.flow.match, game.players[0], game.flow.skipToPvp(), etc.

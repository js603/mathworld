/**
 * MathWorld 웹 버전 - 진입점
 * 
 * CLI와 동일한 게임 로직을 웹 UI로 래핑합니다.
 */

import { GameCore } from '../../src/game/GameCore';
import { WebIO } from './WebIO';
import { WebSaveSystem } from './WebSaveSystem';
import './styles.css';

// 게임 시작
async function startGame() {
    const io = new WebIO();
    const saveSystem = new WebSaveSystem();
    const game = new GameCore(io, saveSystem);

    try {
        await game.run();
    } catch (error) {
        console.error('게임 오류:', error);
        io.print(`\n⚠️ 오류 발생: ${error}`);
    }
}

// DOM 로드 후 실행
document.addEventListener('DOMContentLoaded', () => {
    const startBtn = document.getElementById('start-button');
    const startScreen = document.getElementById('start-screen');
    const gameScreen = document.getElementById('game-screen');

    if (startBtn) {
        startBtn.addEventListener('click', () => {
            if (startScreen) startScreen.classList.add('hidden');
            if (gameScreen) gameScreen.classList.remove('hidden');
            startGame();
        });
    }
});

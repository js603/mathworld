/**
 * MathWorld - 인터랙티브 CLI 게임
 * 
 * GameCore와 CliIO를 사용하여 실제 플레이 가능한 텍스트 RPG를 실행합니다.
 * 모든 게임 로직은 GameCore에 있으며, 이 파일은 진입점 역할만 합니다.
 */

import { GameCore } from './game/GameCore';
import { CliIO } from './game/CliIO';
import { SaveSystem } from './game/SaveSystem';

async function main() {
    const io = new CliIO();
    const saveSystem = new SaveSystem();
    const game = new GameCore(io, saveSystem);

    try {
        await game.run();
    } catch (error) {
        console.error('게임 오류:', error);
    } finally {
        io.close();
    }
}

// 실행
main().catch(console.error);

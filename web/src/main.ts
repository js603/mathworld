import { createGame } from '../../src/index';
// @ts-ignore
import { ChoiceGenerator } from '../../src/core/ChoiceGenerator';
import { GameLoop } from '../../src/game/GameLoop';
import { GameRenderer } from './GameRenderer';
import { MultiplayerManager, PlayerInfo } from './MultiplayerManager';
import { DemoRunner } from './DemoRunner'; // 추가
import { WorldState } from '../../src/core/WorldState';
import { LevelSystem } from '../../src/game/LevelSystem';

// @ts-ignore
import locationsData from '../../data/locations.json';
// @ts-ignore
import enemiesData from '../../data/enemies.json';

// Fallback 적 데이터 (JSON 로딩 실패 시 사용)
const ENEMIES_FALLBACK = [
    { id: 'slime', name: '슬라임', level: 1, hp: 20, attack: 5, defense: 0, exp: 5 },
    { id: 'wolf', name: '늑대', level: 2, hp: 40, attack: 10, defense: 2, exp: 15 },
    { id: 'bandit', name: '산적', level: 3, hp: 60, attack: 15, defense: 5, exp: 30 }
];

export class GameApp {
    private renderer: GameRenderer;
    private multiplayer: MultiplayerManager;
    private game: any;
    private isMultiplayer: boolean = false;

    constructor() {
        this.renderer = new GameRenderer();
        const playerName = `플레이어${Math.floor(Math.random() * 1000)}`;
        this.multiplayer = new MultiplayerManager(playerName);

        this.setupEventListeners();
        this.renderer.print(`MathWorld 웹 버전에 오신 것을 환영합니다!`, 'system');
        this.renderer.print(`당신의 ID는 ${playerName}입니다.`, 'system');
    }

    private setupEventListeners() {
        document.getElementById('btn-single')!.onclick = () => this.startSinglePlayer();

        document.getElementById('btn-host')!.onclick = () => {
            this.renderer.print('방 생성 중...', 'system');
            this.multiplayer.createRoom((roomId) => {
                this.renderer.print(`방이 생성되었습니다! 코드: ${roomId}`, 'system');
                this.renderer.print('친구에게 코드를 공유하세요.', 'system');
                this.startMultiPlayer(true);
            });
        };

        document.getElementById('btn-join')!.onclick = () => {
            document.getElementById('room-input')!.classList.remove('hidden');
        };

        document.getElementById('btn-connect')!.onclick = () => {
            const roomId = (document.getElementById('room-code') as HTMLInputElement).value;
            if (roomId) {
                this.renderer.print(`${roomId} 방에 접속 시도 중...`, 'system');
                this.multiplayer.joinRoom(roomId);
                this.startMultiPlayer(false);
            }
        };

        this.multiplayer.setPlayerListCallback((players: PlayerInfo[]) => {
            this.renderer.updatePlayerList(players);
        });

        this.multiplayer.setConnectCallback((roomId) => {
            document.getElementById('connection-status')!.textContent = `🟢 연결됨 (${roomId})`;
        });

        // 데모 버튼 연결
        document.getElementById('btn-demo')!.onclick = () => {
            const demo = new DemoRunner(this.renderer);
            demo.runScenarioDemo();
        };

        document.getElementById('btn-analysis')!.onclick = () => {
            const demo = new DemoRunner(this.renderer);
            demo.runAnalysisDemo();
        };
    }

    private startSinglePlayer() {
        this.isMultiplayer = false;
        this.startGame();
    }

    private startMultiPlayer(isHost: boolean) {
        this.isMultiplayer = true;
        this.startGame();
    }

    private startGame() {
        this.renderer.showScreen('game-screen');

        // 게임 초기화
        this.game = createGame();

        // 1. 장소 데이터 확장
        // 1. 장소 데이터 확장 (강제 덮어쓰기로 데이터 동기화)
        (locationsData as any[]).forEach(loc => {
            this.game.world.addLocation(loc);
        });

        // 2. 플레이어 전투 스탯 초기화 (필수)
        LevelSystem.initializePlayerStats(this.game.player);

        // 초기 출력
        this.updateGameDisplay();
        this.showMainOptions();
    }

    private updateGameDisplay() {
        this.renderer.updateStatus(this.game.world, this.game.player);
    }

    private showMainOptions() {
        const options = [
            { text: '주변 이동', action: () => this.showMoveOptions() },
            { text: '탐색하기 (전투)', action: () => this.handleExplore() },
            { text: '상태 보기', action: () => this.showStatus() },
            { text: '대기하기', action: () => this.handleWait() },
        ];

        this.renderer.renderChoices(options);
    }

    private showMoveOptions() {
        const currentLoc = this.game.world.getLocation(this.game.player.location);
        if (!currentLoc) {
            this.renderer.print('오류: 현재 위치 정보를 찾을 수 없습니다.');
            this.showMainOptions();
            return;
        }

        const choices: any[] = [];

        if (currentLoc.connectedTo) {
            currentLoc.connectedTo.forEach((locId: string) => {
                const loc = this.game.world.getLocation(locId);
                if (loc) {
                    choices.push({
                        text: `${loc.name} (이동)`,
                        action: () => {
                            this.game.player.location = locId;
                            this.renderer.print(`${loc.name}(으)로 이동했습니다.`);
                            this.processTurn();
                        }
                    });
                }
            });
        }

        choices.push({ text: '돌아가기', action: () => this.showMainOptions() });
        this.renderer.renderChoices(choices);
    }

    private showStatus() {
        const p = this.game.player;
        this.renderer.print(`
[상태 정보]
이름: ${p.name}
레벨: ${p.level || 1} (EXP: ${p.experience}/${p.expToNextLevel})
HP: ${p.stats?.currentHp}/${p.stats?.maxHp}
MP: ${p.stats?.currentMp}/${p.stats?.maxMp}
공격력: ${p.stats?.attack} | 방어력: ${p.stats?.defense}
자원: ${p.resources}
        `, 'system');
        this.showMainOptions();
    }

    private async handleExplore() {
        this.renderer.print('주변을 탐색합니다...', 'combat');

        const currentLoc = this.game.world.getLocation(this.game.player.location);
        const dangerLevel = (currentLoc as any)?.dangerLevel || 0;

        // 디버그 정보 출력 (문제 해결용)
        this.renderer.print(`(DEBUG) 🔍 위치: ${currentLoc.name}, 위험도: ${dangerLevel}`, 'system');

        // 안전지대 처리
        if (dangerLevel <= 0) {
            this.renderer.print('🕊️ 이곳은 너무 평화롭습니다. 사냥을 하려면 마을 밖(황야 등)으로 이동하세요.', 'novel');
            this.processTurn();
            return;
        }

        // CLI 로직 동기화: 70% 확률로 전투 발생 (이중 조건 제거)
        if (Math.random() < 0.7) {
            await this.runCombat(dangerLevel);
        } else {
            this.renderer.print('아무것도 발견하지 못했습니다.');
            this.processTurn();
        }
    }

    private async runCombat(dangerLevel: number) {
        try {
            const maxLevel = Math.floor(dangerLevel * 10) + 1;

            // 적 데이터 로딩 및 검증
            let availableEnemies: any[] = [];
            if (Array.isArray(enemiesData) && enemiesData.length > 0) {
                availableEnemies = enemiesData.filter((e: any) => e.level <= maxLevel);
            }

            // 실패 시 Fallback 사용
            if (availableEnemies.length === 0) {
                this.renderer.print('(DEBUG) 적 데이터 로딩 실패. 기본 데이터를 사용합니다.', 'system');
                availableEnemies = ENEMIES_FALLBACK.filter(e => e.level <= maxLevel);
                if (availableEnemies.length === 0) availableEnemies = [ENEMIES_FALLBACK[0]];
            }

            const enemyData = availableEnemies[Math.floor(Math.random() * availableEnemies.length)];

            this.renderer.print(`(DEBUG) 전투 시작: ${enemyData.name} (Lv.${enemyData.level})`, 'system');

            // 적 객체 생성 (깊은 복사)
            const enemy = JSON.parse(JSON.stringify(enemyData));
            enemy.maxHp = enemy.hp || enemy.stats?.maxHp || 20; // 데이터 구조 호환성 처리
            enemy.hp = enemy.maxHp;
            enemy.attack = enemy.attack || enemy.stats?.attack || 5;
            enemy.defense = enemy.defense || enemy.stats?.defense || 0;
            enemy.exp = enemy.exp || enemy.expReward || 5;

            this.renderer.print(`⚔️ ${enemy.name}이(가) 나타났다!`, 'combat');

            while (enemy.hp > 0 && this.game.player.stats.currentHp > 0) {
                // 상세 정보 렌더링
                this.renderer.renderCombatScreen(enemy);

                const choice = await this.promptChoice([
                    { text: '⚔️ 공격', value: 'attack' },
                    { text: '🛡️ 방어', value: 'defend' },
                    { text: '🏃 도망', value: 'flee' }
                ]);

                if (choice === 'attack') {
                    const damage = Math.max(1, (this.game.player.stats.attack || 10) - (enemy.defense || 0));
                    const isCrit = Math.random() < (this.game.player.stats.critRate || 0.05);
                    const finalDamage = isCrit ? Math.floor(damage * 1.5) : damage;
                    enemy.hp = Math.max(0, enemy.hp - finalDamage);
                    this.renderer.print(`⚔️ ${this.game.player.name}의 공격! ${finalDamage} 피해${isCrit ? '(치명타!)' : ''}`, 'combat');
                } else if (choice === 'defend') {
                    this.renderer.print(`🛡️ 방어 태세를 취했습니다.`, 'combat');
                } else if (choice === 'flee') {
                    if (Math.random() < 0.5) {
                        this.renderer.print('🏃 도망쳤습니다!', 'combat');
                        this.processTurn();
                        return;
                    }
                    this.renderer.print('❌ 도망에 실패했습니다!', 'combat');
                }

                if (enemy.hp <= 0) break;

                // 적 턴 (딜레이)
                await new Promise(r => setTimeout(r, 600));

                const isDefending = choice === 'defend';
                const enemyDmg = Math.max(1, (enemy.attack || 5) - (this.game.player.stats.defense * (isDefending ? 2 : 1)));
                this.game.player.stats.currentHp = Math.max(0, this.game.player.stats.currentHp - enemyDmg);
                this.renderer.print(`💥 ${enemy.name}의 공격! ${enemyDmg} 피해`, 'combat');

                if (this.game.player.stats.currentHp <= 0) {
                    this.renderer.print('💀 패배했습니다...', 'combat');
                    // 부활 패널티
                    this.game.player.stats.currentHp = Math.floor(this.game.player.stats.maxHp * 0.3);
                    this.game.player.location = 'village1';
                    this.renderer.print('...마을에서 깨어났습니다.', 'system');
                    break;
                }

                this.updateGameDisplay();
            }

            if (enemy.hp <= 0) {
                this.renderer.print(`🎉 승리! ${enemy.name}을(를) 처치했습니다.`, 'combat');
                const exp = enemy.exp || 10;
                this.renderer.print(`💰 ${exp} 경험치 획득`, 'combat');
                await this.handleLevelUp(exp);
            }

            this.processTurn();
        } catch (error) {
            console.error(error);
            this.renderer.print(`⚠️ 전투 중 오류 발생: ${error}`, 'system');
            this.processTurn();
        }
    }

    private async handleLevelUp(exp: number) {
        const levelUp = LevelSystem.addExperience(this.game.player, exp);
        if (levelUp) {
            this.renderer.renderLevelUp(levelUp.level, levelUp.statPoints);

            while (this.game.player.statPoints > 0) {
                this.renderer.print(`남은 포인트: ${this.game.player.statPoints}. 스탯을 선택하세요.`, 'system');
                const stat = await this.promptChoice([
                    { text: '공격력 (+2)', value: 'attack' },
                    { text: '방어력 (+2)', value: 'defense' },
                    { text: '최대 HP (+10)', value: 'maxHp' },
                    { text: '최대 MP (+5)', value: 'maxMp' },
                    { text: '완료', value: 'done' }
                ]);

                if (stat === 'done') break;

                LevelSystem.distributeStat(this.game.player, stat as any);
                this.renderer.print(`${stat} 증가!`, 'system');
                this.updateGameDisplay();
            }
        }
    }

    private promptChoice(options: { text: string, value: any }[]): Promise<any> {
        return new Promise((resolve) => {
            this.renderer.renderChoices(options.map(o => ({
                text: o.text,
                action: () => resolve(o.value)
            })));
        });
    }

    private handleWait() {
        this.renderer.print('시간을 보냅니다...');
        this.processTurn();
    }

    private processTurn() {
        this.game.world.advanceTime();
        this.updateGameDisplay();
        this.showMainOptions();
    }
}

new GameApp();

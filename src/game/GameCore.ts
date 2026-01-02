/**
 * GameCore - 순수 게임 로직
 * 
 * game_cli.ts에서 I/O를 분리한 핵심 게임 엔진입니다.
 * CLI와 Web 모두에서 동일하게 사용됩니다.
 */

import { createGame } from '../index';
import {
    ChoiceGenerator,
    CharacterUtils,
    Character,
    Choice,
} from '../core';
import {
    FeedbackLoop,
    EventGenerator,
    BeliefSystem,
    TextRenderer,
} from '../narrative';
import {
    Economy,
    EcosystemSimulation,
    Weather,
    Disease,
} from '../simulation';
import { LevelSystem } from './LevelSystem';
import { Combat, CombatAction } from './Combat';
import { GameIO, GameSaveSystem } from './GameIO';

// 적 데이터 (웹 호환을 위해 하드코딩)
const ENEMIES = [
    { id: 'slime', name: '슬라임', level: 1, hp: 20, attack: 5, defense: 0, exp: 5 },
    { id: 'wolf', name: '늑대', level: 2, hp: 40, attack: 10, defense: 2, exp: 15 },
    { id: 'bandit', name: '산적', level: 3, hp: 60, attack: 15, defense: 5, exp: 30 },
    { id: 'goblin', name: '고블린', level: 1, hp: 25, attack: 8, defense: 1, exp: 8 },
    { id: 'skeleton', name: '스켈레톤', level: 4, hp: 50, attack: 12, defense: 3, exp: 25 },
];

export class GameCore {
    // 게임 상태
    private world: any;
    private player: any;
    private king: any;
    private merchant: any;

    private feedbackLoop!: FeedbackLoop;
    private eventGenerator!: EventGenerator;
    private beliefSystem!: BeliefSystem;
    private textRenderer!: TextRenderer;
    private choiceGen!: ChoiceGenerator;
    private economy!: Economy;
    private ecosystem!: EcosystemSimulation;
    private weather!: Weather;
    private disease!: Disease;

    private currentTarget: Character | null = null;
    private turnCount = 0;
    private gameRunning = true;
    private inCombat = false;
    private currentCombat: Combat | null = null;

    // I/O 및 저장 시스템 (주입받음)
    private io: GameIO;
    private saveSystem: GameSaveSystem;

    constructor(io: GameIO, saveSystem: GameSaveSystem) {
        this.io = io;
        this.saveSystem = saveSystem;

        const game = createGame();
        this.world = game.world;
        this.player = game.player;
        this.king = game.king;
        this.merchant = game.merchant;
    }

    // ============ 초기화 ============
    initGame() {
        const game = createGame();
        this.world = game.world;
        this.player = game.player;
        this.king = game.king;
        this.merchant = game.merchant;

        // 추가 장소
        this.world.addLocation({
            id: 'wilderness',
            name: '황야',
            type: 'wilderness',
            resources: 100,
            population: 0,
            stability: 0.3,
            connectedTo: ['village1'],
            dangerLevel: 0.6,
        });

        // 시스템 초기화
        this.feedbackLoop = new FeedbackLoop(this.world);
        this.eventGenerator = new EventGenerator(this.world);
        this.beliefSystem = new BeliefSystem(this.world);
        this.textRenderer = new TextRenderer(this.world);
        this.choiceGen = new ChoiceGenerator(this.world);
        this.economy = new Economy(this.world);
        this.ecosystem = new EcosystemSimulation(this.world);
        this.weather = new Weather(this.world);
        this.disease = new Disease(this.world);

        // 초기 관계
        this.world.relations.updateRelation(this.player.id, this.merchant.id, { trust: 0.3 });
        this.world.relations.updateRelation(this.merchant.id, this.player.id, { trust: 0.2 });
        this.world.relations.updateRelation(this.king.id, this.merchant.id, { trust: 0.4 });

        // 플레이어 전투/성장 시스템 초기화
        LevelSystem.initializePlayerStats(this.player);

        this.turnCount = 0;
        this.currentTarget = null;
        this.inCombat = false;
        this.currentCombat = null;
    }

    // ============ 감정 이름 ============
    private getEmotionName(emotion: string): string {
        const names: Record<string, string> = {
            trust: '신뢰',
            fear: '공포',
            anger: '분노',
            joy: '기쁨',
            despair: '절망',
        };
        return names[emotion] || emotion;
    }

    // ============ 화면 렌더링 ============
    renderGameScreen() {
        this.io.clear();
        this.io.printHeader(`MathWorld - 턴 ${this.turnCount}`);

        // 시간/날씨
        const weatherDesc = this.weather.describe(this.player.location);
        this.io.print(`\n${this.textRenderer.renderWorldState('novel')}`);
        this.io.print(weatherDesc);

        // 현재 장소
        const location = this.world.getLocation(this.player.location);
        this.io.print(`\n📍 현재 위치: ${location?.name || '알 수 없음'}`);

        // 주변 인물
        const nearbyChars = this.world.getCharactersAt(this.player.location)
            .filter((c: Character) => c.id !== this.player.id);

        if (nearbyChars.length > 0) {
            this.io.printSection('주변 인물');
            nearbyChars.forEach((c: Character, i: number) => {
                const relation = this.world.relations.getRelation(this.player.id, c.id);
                const trustIcon = relation.trust > 0.3 ? '😊' : relation.trust < -0.3 ? '😠' : '😐';
                this.io.print(`  ${i + 1}. ${c.title || ''} ${c.name} ${trustIcon}`);
            });
        }

        // 플레이어 상태
        this.io.printSection('나의 상태');
        const dominant = CharacterUtils.getDominantEmotion(this.player);
        this.io.print(`  권력: ${this.player.power} | 자원: ${this.player.resources}`);
        this.io.print(`  주요 감정: ${this.getEmotionName(dominant)} (${(this.player.emotion[dominant] * 100).toFixed(0)}%)`);

        // HP/MP 표시
        if (this.player.stats) {
            this.io.print(`  HP: ${this.player.stats.currentHp}/${this.player.stats.maxHp} | MP: ${this.player.stats.currentMp}/${this.player.stats.maxMp}`);
            this.io.print(`  레벨: ${this.player.level || 1} (EXP: ${this.player.experience || 0}/${this.player.expToNextLevel || 100})`);
        }

        // 최근 소식
        const recentEvents = this.world.getRecentEvents(3);
        if (recentEvents.length > 0) {
            this.io.printSection('최근 소식');
            recentEvents.forEach((e: any) => {
                if (e.isPublic) {
                    this.io.print(`  • ${this.textRenderer.describeEvent(e, 'novel')}`);
                }
            });
        }
    }

    // ============ 메뉴 생성 ============
    getMainMenuOptions(): { text: string; action: string }[] {
        const options: { text: string; action: string }[] = [];

        // 주변 인물과 상호작용
        const nearbyChars = this.world.getCharactersAt(this.player.location)
            .filter((c: Character) => c.id !== this.player.id);

        nearbyChars.forEach((c: Character) => {
            options.push({ text: `${c.name}에게 말 걸기`, action: `talk:${c.id}` });
        });

        // 장소 이동
        const location = this.world.getLocation(this.player.location);
        if (location && location.connectedTo.length > 0) {
            location.connectedTo.forEach((locId: string) => {
                const loc = this.world.getLocation(locId);
                if (loc) {
                    options.push({ text: `${loc.name}(으)로 이동`, action: `move:${locId}` });
                }
            });
        }

        // 기타 행동
        options.push({ text: '주변 관찰하기', action: 'observe' });

        // 위험한 장소에서 탐색(전투) 가능
        const currentLocation = this.world.getLocation(this.player.location);
        const dangerLevel = (currentLocation as any)?.dangerLevel || 0;
        if (dangerLevel > 0 || currentLocation?.type === 'wilderness' || currentLocation?.type === 'dungeon') {
            options.push({ text: '탐색하기 ⚔️', action: 'explore' });
        }

        options.push({ text: '상세 상태 보기', action: 'status' });
        options.push({ text: '저장하기', action: 'save' });
        options.push({ text: '불러오기', action: 'load' });
        options.push({ text: '시간 보내기', action: 'wait' });
        options.push({ text: '게임 종료', action: 'quit' });

        return options;
    }

    getInteractionChoices(target: Character): Choice[] {
        const choices = this.choiceGen.generateChoices(this.player, target.id);
        choices.push(this.choiceGen.getObserveChoice());
        choices.push(this.choiceGen.getSilenceChoice());
        return choices;
    }

    // ============ 게임 로직 ============
    processTurn() {
        this.turnCount++;

        // 시간 진행
        this.world.advanceTime();

        // 시스템 업데이트
        this.economy.update();
        this.ecosystem.update();
        this.weather.update();
        this.disease.update();

        // NPC 행동
        this.eventGenerator.generateNPCActions();

        // 사건 생성
        const events = this.eventGenerator.generateEvents();
        events.forEach((e: any) => {
            if (e.isPublic) {
                this.io.print(`\n📢 ${this.textRenderer.describeEvent(e, 'novel')}`);
            }
        });

        // 임계값 체크
        const thresholdEvents = this.feedbackLoop.checkThresholds();
        thresholdEvents.forEach((e: any) => {
            this.io.print(`\n⚠️ [중대 사건] ${this.textRenderer.describeEvent(e, 'novel')}`);
        });
    }

    // ============ 행동 처리 ============
    async handleMainAction(action: string): Promise<boolean> {
        const [type, id] = action.split(':');

        switch (type) {
            case 'talk':
                const target = this.world.getCharacter(id);
                if (target) {
                    this.currentTarget = target;
                }
                return false; // 턴 소비 안 함

            case 'move':
                const loc = this.world.getLocation(id);
                if (loc) {
                    this.player.location = id;
                    this.io.print(`\n🚶 ${loc.name}(으)로 이동했다.`);
                    this.processTurn();
                }
                return true;

            case 'observe':
                this.io.print('\n👁️ 주변을 살펴본다...');
                const weatherInfo = this.weather.getWeather(this.player.location);
                this.io.print(`  기온: ${weatherInfo.temperature.toFixed(1)}°C`);
                this.io.print(`  습도: ${(weatherInfo.humidity * 100).toFixed(0)}%`);
                this.io.print(`  바람: ${weatherInfo.windSpeed.toFixed(0)}km/h`);

                const ecoInfo = this.ecosystem.getEcosystemInfo(this.player.location);
                if (ecoInfo) {
                    this.io.print('\n  [생태계]');
                    ecoInfo.species.forEach((s: any) => {
                        this.io.print(`    ${s.name}: ${s.population}마리`);
                    });
                }
                return false;

            case 'explore':
                await this.handleExplore();
                return true;

            case 'status':
                this.renderDetailedStatus();
                return false;

            case 'save':
                await this.handleSave();
                return false;

            case 'load':
                await this.handleLoad();
                return false;

            case 'wait':
                this.io.print('\n⏳ 시간을 보낸다...');
                this.processTurn();
                return true;

            case 'quit':
                this.gameRunning = false;
                this.io.print('\n게임을 종료합니다.');
                return false;
        }

        return false;
    }

    handleInteraction(choice: Choice) {
        if (!this.currentTarget) return;

        this.io.print(`\n💬 ${choice.text}`);

        try {
            const target = this.currentTarget;
            const beforeRelation = this.world.relations.getRelation(this.player.id, target.id);

            this.feedbackLoop.applyChoice(choice, this.player.id, target.id);

            const success = Math.random() > 0.3;
            const outcome = this.textRenderer.describeOutcome(success, choice.action.name, target.name);
            this.io.print(`→ ${outcome}`);

            const afterRelation = this.world.relations.getRelation(this.player.id, target.id);
            const changeDesc = this.textRenderer.describeRelationChange(
                this.player.id, target.id, beforeRelation, afterRelation
            );
            if (changeDesc) {
                this.io.print(`→ ${changeDesc}`);
            }

            this.processTurn();
            this.currentTarget = null;
        } catch (error) {
            this.io.print(`\n⚠️ 오류 발생: ${error}`);
            this.currentTarget = null;
        }
    }

    // ============ 상세 상태 ============
    renderDetailedStatus() {
        this.io.printHeader('상세 상태');

        this.io.print('\n[플레이어]');
        this.io.print(`  이름: ${this.player.name}`);
        this.io.print(`  권력: ${this.player.power}`);
        this.io.print(`  자원: ${this.player.resources}`);

        if (this.player.stats) {
            this.io.print('\n[전투 능력치]');
            this.io.print(`  HP: ${this.player.stats.currentHp}/${this.player.stats.maxHp}`);
            this.io.print(`  MP: ${this.player.stats.currentMp}/${this.player.stats.maxMp}`);
            this.io.print(`  공격력: ${this.player.stats.attack}`);
            this.io.print(`  방어력: ${this.player.stats.defense}`);
            this.io.print(`  속도: ${this.player.stats.speed}`);
        }

        this.io.print('\n[감정]');
        Object.entries(this.player.emotion).forEach(([key, val]) => {
            const bar = '█'.repeat(Math.floor((val as number) * 10)) + '░'.repeat(10 - Math.floor((val as number) * 10));
            this.io.print(`  ${this.getEmotionName(key)}: [${bar}] ${((val as number) * 100).toFixed(0)}%`);
        });

        this.io.print('\n[관계]');
        const allChars = this.world.getAllCharacters().filter((c: Character) => c.id !== this.player.id);
        allChars.forEach((c: Character) => {
            const rel = this.world.relations.getRelation(this.player.id, c.id);
            const trustBar = '█'.repeat(Math.max(0, Math.floor((rel.trust + 1) * 5))) + '░'.repeat(10 - Math.max(0, Math.floor((rel.trust + 1) * 5)));
            this.io.print(`  ${c.name}: [${trustBar}] 신뢰 ${(rel.trust * 100).toFixed(0)}%`);
        });
    }

    // ============ 탐색/전투 ============
    async handleExplore() {
        this.io.print('\n🔍 주변을 탐색한다...');

        if (Math.random() < 0.7) {
            await this.runCombat();
        } else {
            this.io.print('\n  주변에 아무것도 없다...');
        }

        this.processTurn();
    }

    async runCombat() {
        const currentLocation = this.world.getLocation(this.player.location);
        const dangerLevel = (currentLocation as any)?.dangerLevel || 0.3;
        const maxLevel = Math.floor(dangerLevel * 10) + 1;

        const availableEnemies = ENEMIES.filter(e => e.level <= maxLevel);
        const enemyData = availableEnemies[Math.floor(Math.random() * availableEnemies.length)] || ENEMIES[0];

        const enemy = { ...enemyData, maxHp: enemyData.hp };

        this.io.print(`\n⚔️ ${enemy.name}이(가) 나타났다!`);

        while (enemy.hp > 0 && this.player.stats.currentHp > 0) {
            this.io.print(`\n[${enemy.name}] HP: ${enemy.hp}/${enemy.maxHp}`);
            this.io.print(`[${this.player.name}] HP: ${this.player.stats.currentHp}/${this.player.stats.maxHp}`);

            const choiceIndex = await this.io.promptChoice(['⚔️ 공격', '🛡️ 방어', '🏃 도망']);

            if (choiceIndex === 0) { // 공격
                const damage = Math.max(1, (this.player.stats.attack || 10) - (enemy.defense || 0));
                const isCrit = Math.random() < (this.player.stats.critRate || 0.05);
                const finalDamage = isCrit ? Math.floor(damage * 1.5) : damage;
                enemy.hp = Math.max(0, enemy.hp - finalDamage);
                this.io.print(`⚔️ ${this.player.name}의 공격! ${finalDamage} 피해${isCrit ? '(치명타!)' : ''}`);
            } else if (choiceIndex === 1) { // 방어
                this.io.print(`🛡️ 방어 태세를 취했습니다.`);
            } else if (choiceIndex === 2) { // 도망
                if (Math.random() < 0.5) {
                    this.io.print('🏃 도망쳤습니다!');
                    return;
                }
                this.io.print('❌ 도망에 실패했습니다!');
            }

            if (enemy.hp <= 0) break;

            // 적 턴
            const isDefending = choiceIndex === 1;
            const enemyDmg = Math.max(1, (enemy.attack || 5) - (this.player.stats.defense * (isDefending ? 2 : 1)));
            this.player.stats.currentHp = Math.max(0, this.player.stats.currentHp - enemyDmg);
            this.io.print(`💥 ${enemy.name}의 공격! ${enemyDmg} 피해`);

            if (this.player.stats.currentHp <= 0) {
                this.io.print('💀 패배했습니다...');
                this.player.stats.currentHp = Math.floor(this.player.stats.maxHp * 0.3);
                this.player.location = 'village1';
                this.io.print('...마을에서 깨어났습니다.');
                return;
            }
        }

        if (enemy.hp <= 0) {
            this.io.print(`🎉 승리! ${enemy.name}을(를) 처치했습니다.`);
            const exp = enemy.exp || 10;
            this.io.print(`💰 ${exp} 경험치 획득`);
            await this.handleLevelUp(exp);
        }
    }

    async handleLevelUp(exp: number) {
        const levelUp = LevelSystem.addExperience(this.player, exp);
        if (levelUp) {
            this.io.print(`\n🎉 레벨 업! (Lv.${levelUp.level})`);
            this.io.print(`💪 사용할 수 있는 스탯 포인트: ${levelUp.statPoints}`);

            while (this.player.statPoints > 0) {
                this.io.print(`\n남은 포인트: ${this.player.statPoints}`);
                const statChoice = await this.io.promptChoice([
                    '공격력 (+2)',
                    '방어력 (+2)',
                    '최대 HP (+10)',
                    '최대 MP (+5)',
                    '속도 (+2)',
                    '완료'
                ]);

                const statMap: Record<number, any> = {
                    0: 'attack',
                    1: 'defense',
                    2: 'maxHp',
                    3: 'maxMp',
                    4: 'speed',
                };

                if (statChoice === 5) break;
                if (statMap[statChoice]) {
                    LevelSystem.distributeStat(this.player, statMap[statChoice]);
                    this.io.print(`✅ ${statMap[statChoice]} 증가!`);
                }
            }
        }
    }

    // ============ 저장/불러오기 ============
    async handleSave() {
        this.io.print('\n💾 게임 저장');
        const slotName = await this.io.prompt('저장 슬롯 이름 (기본: slot1): ');
        const finalSlot = slotName.trim() || 'slot1';

        if (this.saveSystem.saveGame(finalSlot, this.turnCount, this.player, this.world)) {
            this.io.print(`✅ "${finalSlot}" 슬롯에 저장 완료!`);
        } else {
            this.io.print('❌ 저장 실패');
        }
    }

    async handleLoad() {
        this.io.print('\n📂 저장 목록');
        const saves = this.saveSystem.listSaves();

        if (saves.length === 0) {
            this.io.print('  저장된 게임이 없습니다.');
            return;
        }

        const saveOptions = saves.map((s, i) =>
            `[${s.slotName}] ${s.playerName} - 턴 ${s.turnCount} (${this.saveSystem.formatTimestamp(s.timestamp)})`
        );
        saveOptions.push('취소');

        const loadIndex = await this.io.promptChoice(saveOptions);

        if (loadIndex >= 0 && loadIndex < saves.length) {
            const saveData = this.saveSystem.loadGame(saves[loadIndex].slotName);
            if (saveData) {
                this.saveSystem.restoreToWorld(saveData, this.world);
                Object.assign(this.player, saveData.player);
                this.turnCount = saveData.turnCount;
                this.io.print(`✅ "${saves[loadIndex].slotName}" 불러오기 완료!`);
            } else {
                this.io.print('❌ 불러오기 실패');
            }
        }
    }

    // ============ 게임 루프 ============
    async run() {
        this.io.clear();
        this.io.printHeader('MathWorld - 텍스트 소설형 RPG');
        this.io.print('\n수학적 알고리즘으로 구동되는 살아있는 세계에 오신 것을 환영합니다.');
        this.io.print('당신의 선택이 세계를 바꿉니다.\n');

        await this.io.prompt('Enter를 눌러 시작하세요...');

        this.initGame();

        while (this.gameRunning) {
            if (this.currentTarget) {
                // 상호작용 모드
                this.renderGameScreen();
                this.io.printSection(`${this.currentTarget.name}과(와)의 상호작용`);

                const choices = this.getInteractionChoices(this.currentTarget);
                const choiceTexts = choices.map(c => c.text);
                choiceTexts.push('돌아가기');

                choices.forEach((c, i) => {
                    this.io.print(`  ${i + 1}. ${c.text}`);
                    this.io.print(`     └ ${c.context}`);
                });

                const choiceIndex = await this.io.promptChoice(choiceTexts);

                if (choiceIndex === choiceTexts.length - 1) {
                    this.currentTarget = null;
                } else if (choiceIndex >= 0 && choiceIndex < choices.length) {
                    this.handleInteraction(choices[choiceIndex]);
                    await this.io.prompt('\nEnter를 눌러 계속...');
                }
            } else {
                // 메인 메뉴 모드
                this.renderGameScreen();
                this.io.printSection('행동 선택');

                const options = this.getMainMenuOptions();
                const optionTexts = options.map(o => o.text);

                options.forEach((o, i) => {
                    this.io.print(`  ${i + 1}. ${o.text}`);
                });

                const optionIndex = await this.io.promptChoice(optionTexts);

                if (optionIndex >= 0 && optionIndex < options.length) {
                    const consumedTurn = await this.handleMainAction(options[optionIndex].action);

                    if (consumedTurn || options[optionIndex].action === 'observe' ||
                        options[optionIndex].action === 'status') {
                        await this.io.prompt('\nEnter를 눌러 계속...');
                    }
                }
            }
        }

        this.io.print('\n게임을 플레이해주셔서 감사합니다!');
    }

    // Getters
    isRunning() { return this.gameRunning; }
    getCurrentTarget() { return this.currentTarget; }
    getPlayer() { return this.player; }
    getWorld() { return this.world; }
    getTurnCount() { return this.turnCount; }
}

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
    Quest,
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
    private quests: Quest[] = [];

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

        // 기본 퀘스트 초기화
        this.initializeQuests();
    }

    initializeQuests() {
        this.quests = [
            {
                id: 'quest_hunt_wolves',
                title: '늑대 토벌',
                description: '마을 주변에서 늑대가 출몰하고 있습니다. 늑대를 처치해 주세요.',
                status: 'available',
                objectives: [
                    { type: 'kill', target: '늑대', required: 3, current: 0, description: '늑대 3마리 처치' }
                ],
                rewards: { exp: 50, resources: 30 },
                level: 1
            },
            {
                id: 'quest_gather_herbs',
                title: '약초 수집',
                description: '황야에서 약초를 채집해 오세요.',
                status: 'available',
                objectives: [
                    { type: 'gather', target: '풀', required: 5, current: 0, description: '풀 5개 채집' }
                ],
                rewards: { exp: 30, resources: 20 },
                level: 1
            },
            {
                id: 'quest_meet_king',
                title: '왕을 알현하라',
                description: '왕도에 가서 왕을 만나세요.',
                status: 'available',
                objectives: [
                    { type: 'talk', target: '왕', required: 1, current: 0, description: '왕과 대화' }
                ],
                rewards: { exp: 100, resources: 50, reputation: 10 },
                level: 2
            }
        ];
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
        this.io.print(`\n현재 위치: ${location?.name || '알 수 없음'}`);

        // 주변 인물
        const nearbyChars = this.world.getCharactersAt(this.player.location)
            .filter((c: Character) => c.id !== this.player.id);

        if (nearbyChars.length > 0) {
            this.io.printSection('주변 인물');
            nearbyChars.forEach((c: Character, i: number) => {
                const relation = this.world.relations.getRelation(this.player.id, c.id);
                const trustText = relation.trust > 0.3 ? '[+]' : relation.trust < -0.3 ? '[-]' : '[=]';
                // NPC 인식 표시 (BeliefSystem 활용)
                const perception = this.beliefSystem.getPerception(c, this.player.id);
                const perceptionShort = perception.length > 20 ? perception.substring(0, 20) + '...' : perception;
                this.io.print(`  ${i + 1}. ${c.title || ''} ${c.name} ${trustText}`);
                if (perception && perception !== '중립적') {
                    this.io.print(`      └ "${perceptionShort}"`);
                }
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

        // 세계 상황 알림 (질병, 전쟁, 경제)
        this.renderWorldAlerts();

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

        // 상점 (마을/도시에서만)
        const currentLocation = this.world.getLocation(this.player.location);
        if (currentLocation?.type === 'city' || currentLocation?.type === 'village') {
            options.push({ text: '상점', action: 'shop' });
        }

        // 위험한 장소에서 탐색(전투) 가능
        const dangerLevel = (currentLocation as any)?.dangerLevel || 0;
        if (dangerLevel > 0 || currentLocation?.type === 'wilderness' || currentLocation?.type === 'dungeon') {
            options.push({ text: '탐색하기', action: 'explore' });
        }

        // 사냥/채집 (황야/자연환경에서)
        if (currentLocation?.type === 'wilderness' || currentLocation?.type === 'village') {
            options.push({ text: '사냥/채집', action: 'hunt' });
        }

        options.push({ text: '퀘스트', action: 'quests' });
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

        // NPC 자율 행동 (UtilityAI 기반)
        this.processNPCAutonomousActions();

        // NPC 행동
        this.eventGenerator.generateNPCActions();

        // 사건 생성
        const events = this.eventGenerator.generateEvents();
        events.forEach((e: any) => {
            if (e.isPublic) {
                this.io.print(`\n${this.textRenderer.describeEvent(e, 'novel')}`);
            }
            // 소문 확산
            this.simulateRumorSpread(e);
        });

        // 임계값 체크
        const thresholdEvents = this.feedbackLoop.checkThresholds();
        thresholdEvents.forEach((e: any) => {
            this.io.print(`\n[!중대] ${this.textRenderer.describeEvent(e, 'novel')}`);
        });
    }

    // ============ NPC 자율 행동 ============
    processNPCAutonomousActions() {
        const npcs = this.world.getAllCharacters().filter((c: Character) => c.id !== this.player.id);

        npcs.forEach((npc: Character) => {
            // 각 NPC가 현재 상황을 평가하고 행동 결정
            const nearbyChars = this.world.getCharactersAt(npc.location)
                .filter((c: Character) => c.id !== npc.id);

            if (nearbyChars.length > 0 && Math.random() < 0.3) {
                // 30% 확률로 자율 행동 실행
                const target = nearbyChars[Math.floor(Math.random() * nearbyChars.length)];
                const action = this.decideNPCAction(npc, target);
                if (action) {
                    this.io.print(`\n${npc.name}이(가) ${target.name}에게 ${action}을(를) 했다.`);
                    // 관계 변화 (간단화)
                    const change = action === '친밀한 대화' ? 0.05 : action === '협력 제안' ? 0.1 : -0.05;
                    this.world.relations.modifyRelation(npc.id, target.id, { trust: change });
                }
            }
        });
    }

    decideNPCAction(npc: Character, target: Character): string | null {
        const relation = this.world.relations.getRelation(npc.id, target.id);

        // 관계에 따른 행동 결정
        if (relation.trust > 0.5) {
            return '친밀한 대화';
        } else if (relation.trust > 0.2) {
            return '협력 제안';
        } else if (relation.trust < -0.3) {
            return '경계';
        }
        return null;
    }

    // ============ 소문 확산 ============
    simulateRumorSpread(event: any) {
        if (!event.isPublic) return;

        const source = event.participants?.[0];
        if (!source) return;

        // 소문 확산 시뮬레이션
        const spreadProb = (rel: any) => Math.max(0.1, rel.trust + 0.3);
        const informed = this.world.relations.simulateRumorSpread(source, 2, spreadProb);

        if (informed.size > 2) {
            const names = (Array.from(informed) as string[])
                .slice(0, 3)
                .map((id: string) => this.world.getCharacter(id)?.name || id);
            const suffix = informed.size > 3 ? ` 외 ${informed.size - 3}명` : '';
            this.io.print(`  [소문] ${names.join(', ')}${suffix}이(가) 알게 됨`);
        }
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
                    this.io.print(`\n${loc.name}(으)로 이동했다.`);
                    this.processTurn();
                }
                return true;

            case 'observe':
                this.io.print('\n주변을 살펴본다...');
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

            case 'shop':
                await this.handleShop();
                return false;

            case 'hunt':
                await this.handleHunt();
                return true;

            case 'quests':
                await this.handleQuests();
                return false;

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
                this.io.print('\n시간을 보낸다...');
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

        this.io.print(`\n${choice.text}`);

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
            this.io.print(`\n[오류] ${error}`);
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

    // ============ 세계 상황 알림 ============
    renderWorldAlerts() {
        const alerts: string[] = [];

        // 질병 알림
        if (this.world.globalState.plagueActive) {
            alerts.push('[역병] 역병이 퍼지고 있습니다! 약값이 치솟고 있습니다.');
        }

        // 전쟁 알림
        if (this.world.globalState.warActive) {
            alerts.push('[전쟁] 전쟁 중! 무기 수요가 급증하고 있습니다.');
        }

        // 경제 상황
        const economySummary = this.economy.getSummary();
        if (economySummary.inflationRate > 0.1) {
            alerts.push(`[경제] 인플레이션 ${(economySummary.inflationRate * 100).toFixed(0)}%! 물가가 오르고 있습니다.`);
        } else if (economySummary.inflationRate < -0.05) {
            alerts.push('[경제] 경기 침체! 물가가 떨어지고 있습니다.');
        }

        // 계절 알림
        const season = this.world.globalState.season;
        if (season === 'winter') {
            alerts.push('[겨울] 겨울입니다. 식량 수요가 높습니다.');
        }

        // 알림 출력
        if (alerts.length > 0) {
            this.io.printSection('세계 상황');
            alerts.forEach(alert => this.io.print(`  ${alert}`));
        }

        // 파벌 정보 표시
        this.renderFactionInfo();
    }

    // ============ 파벌 정보 표시 ============
    renderFactionInfo() {
        const clusters = this.world.relations.getClusters(0.2);
        if (clusters.length > 0) {
            this.io.printSection('정치 세력');
            clusters.forEach((cluster: string[], index: number) => {
                const memberNames = cluster
                    .map((id: string) => this.world.getCharacter(id)?.name || id)
                    .slice(0, 3);
                const suffix = cluster.length > 3 ? ` 외 ${cluster.length - 3}명` : '';
                this.io.print(`  세력 ${index + 1}: ${memberNames.join(', ')}${suffix}`);
            });

            // 영향력 있는 인물
            const influential = this.world.relations.getMostInfluential(2);
            if (influential.length > 0) {
                const names = influential
                    .map((id: string) => this.world.getCharacter(id)?.name || id);
                this.io.print(`  영향력 있는 인물: ${names.join(', ')}`);
            }
        }
    }

    // ============ 상점 시스템 ============
    async handleShop() {
        const location = this.world.getLocation(this.player.location);
        this.io.printHeader(`${location?.name || '마을'} 상점`);

        const goods: Array<{ id: string, name: string }> = [
            { id: 'food', name: '식량' },
            { id: 'weapons', name: '무기' },
            { id: 'medicine', name: '약품' },
            { id: 'materials', name: '재료' },
            { id: 'luxury', name: '사치품' },
        ];

        // 가격 표시
        this.io.print('\n현재 시세:');
        goods.forEach(g => {
            const price = this.economy.getPrice(this.player.location, g.id as any);
            this.io.print(`  ${g.name}: ${price.toFixed(0)} 골드`);
        });

        this.io.print(`\n보유 자원: ${this.player.resources} 골드`);

        // 행동 선택
        const shopOptions = ['구매하기', '판매하기', '나가기'];
        const actionIndex = await this.io.promptChoice(shopOptions);

        if (actionIndex === 0) { // 구매
            await this.handleBuy(goods);
        } else if (actionIndex === 1) { // 판매
            await this.handleSell(goods);
        }
    }

    async handleBuy(goods: Array<{ id: string, name: string }>) {
        const buyOptions = goods.map(g => {
            const price = this.economy.getPrice(this.player.location, g.id as any);
            return `${g.name} (${price.toFixed(0)}골드)`;
        });
        buyOptions.push('취소');

        const itemIndex = await this.io.promptChoice(buyOptions);
        if (itemIndex >= goods.length) return;

        const selectedGoods = goods[itemIndex];
        const price = this.economy.getPrice(this.player.location, selectedGoods.id as any);

        const maxBuy = Math.floor(this.player.resources / price);
        if (maxBuy <= 0) {
            this.io.print('[실패] 자원이 부족합니다!');
            return;
        }

        this.io.print(`\n최대 ${maxBuy}개 구매 가능 (1개당 ${price.toFixed(0)}골드)`);
        const quantityChoice = await this.io.promptChoice(['1개', '5개', '10개', '최대', '취소']);

        const quantities = [1, 5, 10, maxBuy];
        if (quantityChoice >= 4) return;

        const quantity = Math.min(quantities[quantityChoice], maxBuy);
        const result = this.economy.buy(this.player.location, selectedGoods.id as any, quantity);

        if (result.success) {
            this.player.resources -= result.cost;
            // 인벤토리에 추가 (간단히 player에 저장)
            if (!this.player.inventory) this.player.inventory = {};
            this.player.inventory[selectedGoods.id] = (this.player.inventory[selectedGoods.id] || 0) + quantity;
            this.io.print(`[완료] ${selectedGoods.name} ${quantity}개를 ${result.cost.toFixed(0)}골드에 구매했습니다!`);
        } else {
            this.io.print('[실패] 구매 실패! 재고가 부족합니다.');
        }
    }

    async handleSell(goods: Array<{ id: string, name: string }>) {
        if (!this.player.inventory || Object.keys(this.player.inventory).length === 0) {
            this.io.print('[실패] 판매할 물품이 없습니다.');
            return;
        }

        const sellOptions: string[] = [];
        const availableGoods: typeof goods = [];

        goods.forEach(g => {
            const owned = this.player.inventory?.[g.id] || 0;
            if (owned > 0) {
                const price = this.economy.getPrice(this.player.location, g.id as any) * 0.8;
                sellOptions.push(`${g.name} x${owned} (개당 ${price.toFixed(0)}골드)`);
                availableGoods.push(g);
            }
        });
        sellOptions.push('취소');

        if (availableGoods.length === 0) {
            this.io.print('[실패] 판매할 물품이 없습니다.');
            return;
        }

        const itemIndex = await this.io.promptChoice(sellOptions);
        if (itemIndex >= availableGoods.length) return;

        const selectedGoods = availableGoods[itemIndex];
        const owned = this.player.inventory[selectedGoods.id];

        const quantityChoice = await this.io.promptChoice(['1개', '5개', '전부', '취소']);
        const quantities = [1, 5, owned];
        if (quantityChoice >= 3) return;

        const quantity = Math.min(quantities[quantityChoice], owned);
        const result = this.economy.sell(this.player.location, selectedGoods.id as any, quantity);

        if (result.success) {
            this.player.resources += result.revenue;
            this.player.inventory[selectedGoods.id] -= quantity;
            this.io.print(`[완료] ${selectedGoods.name} ${quantity}개를 ${result.revenue.toFixed(0)}골드에 판매했습니다!`);
        }
    }

    // ============ 퀘스트 시스템 ============
    async handleQuests() {
        this.io.printHeader('퀘스트');

        const activeQuests = this.quests.filter(q => q.status === 'active');
        const availableQuests = this.quests.filter(q => q.status === 'available');
        const completedQuests = this.quests.filter(q => q.status === 'completed');

        // 진행 중인 퀘스트 표시
        if (activeQuests.length > 0) {
            this.io.print('\n[진행 중]');
            activeQuests.forEach((q, i) => {
                this.io.print(`  ${i + 1}. ${q.title} (Lv.${q.level})`);
                q.objectives.forEach(obj => {
                    const progress = `${obj.current}/${obj.required}`;
                    const isDone = obj.current >= obj.required ? '[완료]' : '';
                    this.io.print(`     - ${obj.description}: ${progress} ${isDone}`);
                });
            });
        }

        // 수락 가능한 퀘스트 표시
        if (availableQuests.length > 0) {
            this.io.print('\n[수락 가능]');
            availableQuests.forEach((q, i) => {
                this.io.print(`  ${activeQuests.length + i + 1}. ${q.title} (Lv.${q.level})`);
                this.io.print(`     ${q.description}`);
                const rewards = [];
                if (q.rewards.exp) rewards.push(`경험치 ${q.rewards.exp}`);
                if (q.rewards.resources) rewards.push(`자원 ${q.rewards.resources}`);
                this.io.print(`     보상: ${rewards.join(', ')}`);
            });
        }

        // 완료된 퀘스트 수 표시
        if (completedQuests.length > 0) {
            this.io.print(`\n[완료된 퀘스트: ${completedQuests.length}개]`);
        }

        if (activeQuests.length === 0 && availableQuests.length === 0) {
            this.io.print('\n현재 진행 가능한 퀘스트가 없습니다.');
            return;
        }

        // 선택지 구성
        const options: string[] = [];
        activeQuests.forEach(q => options.push(`[확인] ${q.title}`));
        availableQuests.forEach(q => options.push(`[수락] ${q.title}`));
        options.push('돌아가기');

        const choice = await this.io.promptChoice(options);

        if (choice >= options.length - 1) return;

        if (choice < activeQuests.length) {
            // 진행 중인 퀘스트 상세 보기
            const quest = activeQuests[choice];
            this.showQuestDetails(quest);
        } else {
            // 퀘스트 수락
            const quest = availableQuests[choice - activeQuests.length];
            quest.status = 'active';
            this.io.print(`\n[수락] "${quest.title}" 퀘스트를 수락했습니다!`);
        }
    }

    showQuestDetails(quest: Quest) {
        this.io.print(`\n== ${quest.title} ==`);
        this.io.print(quest.description);
        this.io.print('\n[목표]');
        quest.objectives.forEach(obj => {
            const progress = `${obj.current}/${obj.required}`;
            const status = obj.current >= obj.required ? '[완료]' : '[진행중]';
            this.io.print(`  ${status} ${obj.description}: ${progress}`);
        });

        // 모든 목표 완료 시 퀘스트 완료 처리
        if (quest.objectives.every(obj => obj.current >= obj.required)) {
            this.completeQuest(quest);
        }
    }

    completeQuest(quest: Quest) {
        quest.status = 'completed';
        this.io.print(`\n[퀘스트 완료] "${quest.title}"!`);

        if (quest.rewards.exp) {
            this.io.print(`  +${quest.rewards.exp} 경험치`);
            this.player.experience = (this.player.experience || 0) + quest.rewards.exp;
        }
        if (quest.rewards.resources) {
            this.io.print(`  +${quest.rewards.resources} 자원`);
            this.player.resources += quest.rewards.resources;
        }
        if (quest.rewards.reputation) {
            this.io.print(`  +${quest.rewards.reputation} 평판`);
        }
    }

    updateQuestProgress(type: string, target: string, amount: number = 1) {
        const activeQuests = this.quests.filter(q => q.status === 'active');

        activeQuests.forEach(quest => {
            quest.objectives.forEach(obj => {
                if (obj.type === type && obj.target === target && obj.current < obj.required) {
                    obj.current = Math.min(obj.current + amount, obj.required);
                    this.io.print(`[퀘스트] ${quest.title}: ${obj.description} (${obj.current}/${obj.required})`);
                }
            });
        });
    }

    // ============ 사냥/채집 시스템 ============
    async handleHunt() {
        this.io.printHeader('사냥/채집');

        const ecoInfo = this.ecosystem.getEcosystemInfo(this.player.location);
        if (!ecoInfo || ecoInfo.species.length === 0) {
            this.io.print('\n이 주변에는 사냥할 것이 없다.');
            return;
        }

        this.io.print('\n주변에서 발견된 생물:');
        const huntableSpecies = ecoInfo.species.filter(s => s.type !== 'plant' && s.population > 10);
        const gatherableSpecies = ecoInfo.species.filter(s => s.type === 'plant' && s.population > 10);

        if (huntableSpecies.length === 0 && gatherableSpecies.length === 0) {
            this.io.print('  사냥하거나 채집할 것이 없다.');
            this.processTurn();
            return;
        }

        // 사냥 가능한 동물 표시
        if (huntableSpecies.length > 0) {
            this.io.print('\n[사냥 가능]');
            huntableSpecies.forEach((s, i) => {
                this.io.print(`  ${i + 1}. ${s.name} (약 ${s.population}마리)`);
            });
        }

        // 채집 가능한 식물 표시
        if (gatherableSpecies.length > 0) {
            this.io.print('\n[채집 가능]');
            gatherableSpecies.forEach((s, i) => {
                this.io.print(`  ${huntableSpecies.length + i + 1}. ${s.name}`);
            });
        }

        const allSpecies = [...huntableSpecies, ...gatherableSpecies];
        const options = allSpecies.map(s => s.name);
        options.push('돌아가기');

        const choice = await this.io.promptChoice(options);
        if (choice >= allSpecies.length) {
            return;
        }

        const selected = allSpecies[choice];
        const isHunting = choice < huntableSpecies.length;

        if (isHunting) {
            // 사냥 시도
            this.io.print(`\n${selected.name}을(를) 사냥한다...`);
            const result = this.ecosystem.hunt(this.player.location, selected.name.toLowerCase(), 3);

            if (result.success && result.caught > 0) {
                const meatGained = result.caught * 5;
                this.player.resources += meatGained;
                this.io.print(`[성공] ${result.caught}마리를 잡았다! +${meatGained} 자원`);
            } else {
                this.io.print('[실패] 사냥에 실패했다.');
            }
        } else {
            // 채집 시도
            this.io.print(`\n${selected.name}을(를) 채집한다...`);
            const gatherAmount = Math.floor(Math.random() * 3) + 1;
            this.player.resources += gatherAmount * 2;
            this.io.print(`[성공] ${gatherAmount}개를 채집했다! +${gatherAmount * 2} 자원`);
        }

        this.processTurn();
    }

    // ============ 탐색/전투 ============
    async handleExplore() {
        this.io.print('\n주변을 탐색한다...');

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

        this.io.print(`\n${enemy.name}이(가) 나타났다!`);

        while (enemy.hp > 0 && this.player.stats.currentHp > 0) {
            this.io.print(`\n[${enemy.name}] HP: ${enemy.hp}/${enemy.maxHp}`);
            this.io.print(`[${this.player.name}] HP: ${this.player.stats.currentHp}/${this.player.stats.maxHp}`);

            const choiceIndex = await this.io.promptChoice(['공격', '방어', '도망']);

            if (choiceIndex === 0) { // 공격
                const damage = Math.max(1, (this.player.stats.attack || 10) - (enemy.defense || 0));
                const isCrit = Math.random() < (this.player.stats.critRate || 0.05);
                const finalDamage = isCrit ? Math.floor(damage * 1.5) : damage;
                enemy.hp = Math.max(0, enemy.hp - finalDamage);
                this.io.print(`${this.player.name}의 공격! ${finalDamage} 피해${isCrit ? '(치명타!)' : ''}`);
            } else if (choiceIndex === 1) { // 방어
                this.io.print(`방어 태세를 취했습니다.`);
            } else if (choiceIndex === 2) { // 도망
                if (Math.random() < 0.5) {
                    this.io.print('도망쳤습니다!');
                    return;
                }
                this.io.print('[실패] 도망에 실패했습니다!');
            }

            if (enemy.hp <= 0) break;

            // 적 턴
            const isDefending = choiceIndex === 1;
            const enemyDmg = Math.max(1, (enemy.attack || 5) - (this.player.stats.defense * (isDefending ? 2 : 1)));
            this.player.stats.currentHp = Math.max(0, this.player.stats.currentHp - enemyDmg);
            this.io.print(`${enemy.name}의 공격! ${enemyDmg} 피해`);

            if (this.player.stats.currentHp <= 0) {
                this.io.print('[패배] 패배했습니다...');
                this.player.stats.currentHp = Math.floor(this.player.stats.maxHp * 0.3);
                this.player.location = 'village1';
                this.io.print('...마을에서 깨어났습니다.');
                return;
            }
        }

        if (enemy.hp <= 0) {
            this.io.print(`[승리] ${enemy.name}을(를) 처치했습니다.`);
            const exp = enemy.exp || 10;
            this.io.print(`${exp} 경험치 획득`);
            await this.handleLevelUp(exp);
        }
    }

    async handleLevelUp(exp: number) {
        const levelUp = LevelSystem.addExperience(this.player, exp);
        if (levelUp) {
            this.io.print(`\n[레벨업] (Lv.${levelUp.level})`);
            this.io.print(`사용할 수 있는 스탯 포인트: ${levelUp.statPoints}`);

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
                    this.io.print(`[완료] ${statMap[statChoice]} 증가!`);
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
            this.io.print(`[완료] "${finalSlot}" 슬롯에 저장 완료!`);
        } else {
            this.io.print('[실패] 저장 실패');
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
                this.io.print(`[완료] "${saves[loadIndex].slotName}" 불러오기 완료!`);
            } else {
                this.io.print('[실패] 불러오기 실패');
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

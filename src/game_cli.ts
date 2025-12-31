/**
 * MathWorld - 인터랙티브 CLI 게임
 * 
 * 실제 플레이 가능한 텍스트 RPG
 */

import * as readline from 'readline';
import { createGame } from './index';
import {
    ChoiceGenerator,
    CharacterUtils,
    UtilityAI,
    BaseActions,
    Character,
    Choice,
} from './core';
import {
    FeedbackLoop,
    EventGenerator,
    BeliefSystem,
    TextRenderer,
} from './narrative';
import {
    Economy,
    EcosystemSimulation,
    Weather,
    Disease,
} from './simulation';
import { SaveSystem } from './game/SaveSystem';
import { LevelSystem } from './game/LevelSystem';
import { Combat, CombatAction } from './game/Combat';
import { CombatStats } from './core/types';

// ============ 게임 상태 ============
let { world, player, king, merchant } = createGame();
let feedbackLoop: FeedbackLoop;
let eventGenerator: EventGenerator;
let beliefSystem: BeliefSystem;
let textRenderer: TextRenderer;
let choiceGen: ChoiceGenerator;
let economy: Economy;
let ecosystem: EcosystemSimulation;
let weather: Weather;
let disease: Disease;

let currentTarget: Character | null = null;
let turnCount = 0;
let gameRunning = true;
let saveSystem: SaveSystem;
let inCombat = false;
let currentCombat: Combat | null = null;

// ============ 초기화 ============
function initGame() {
    const game = createGame();
    world = game.world;
    player = game.player;
    king = game.king;
    merchant = game.merchant;

    // 추가 장소
    world.addLocation({
        id: 'wilderness',
        name: '황야',
        type: 'wilderness',
        resources: 100,
        population: 0,
        stability: 0.3,
        connectedTo: ['village1'],
    });

    // 시스템 초기화
    feedbackLoop = new FeedbackLoop(world);
    eventGenerator = new EventGenerator(world);
    beliefSystem = new BeliefSystem(world);
    textRenderer = new TextRenderer(world);
    choiceGen = new ChoiceGenerator(world);
    economy = new Economy(world);
    ecosystem = new EcosystemSimulation(world);
    weather = new Weather(world);
    disease = new Disease(world);

    // 초기 관계
    world.relations.updateRelation(player.id, merchant.id, { trust: 0.3 });
    world.relations.updateRelation(merchant.id, player.id, { trust: 0.2 });
    world.relations.updateRelation(king.id, merchant.id, { trust: 0.4 });

    // 세이브 시스템 초기화
    saveSystem = new SaveSystem();

    // 플레이어 전투/성장 시스템 초기화
    LevelSystem.initializePlayerStats(player);

    turnCount = 0;
    currentTarget = null;
    inCombat = false;
    currentCombat = null;
}

// ============ 출력 유틸리티 ============
function printLine(char: string = '─', length: number = 50) {
    console.log(char.repeat(length));
}

function printHeader(title: string) {
    console.log('\n');
    printLine('═');
    console.log(`  ${title}`);
    printLine('═');
}

function printSection(title: string) {
    console.log(`\n【 ${title} 】`);
}

// ============ 화면 렌더링 ============
function renderGameScreen() {
    console.clear();
    printHeader(`MathWorld - 턴 ${turnCount}`);

    // 시간/날씨
    const weatherDesc = weather.describe(player.location);
    console.log(`\n${textRenderer.renderWorldState('novel')}`);
    console.log(weatherDesc);

    // 현재 장소
    const location = world.getLocation(player.location);
    console.log(`\n📍 현재 위치: ${location?.name || '알 수 없음'}`);

    // 주변 인물
    const nearbyChars = world.getCharactersAt(player.location)
        .filter(c => c.id !== player.id);

    if (nearbyChars.length > 0) {
        printSection('주변 인물');
        nearbyChars.forEach((c, i) => {
            const relation = world.relations.getRelation(player.id, c.id);
            const trustIcon = relation.trust > 0.3 ? '😊' : relation.trust < -0.3 ? '😠' : '😐';
            console.log(`  ${i + 1}. ${c.title || ''} ${c.name} ${trustIcon}`);
        });
    }

    // 플레이어 상태
    printSection('나의 상태');
    const dominant = CharacterUtils.getDominantEmotion(player);
    console.log(`  권력: ${player.power} | 자원: ${player.resources}`);
    console.log(`  주요 감정: ${getEmotionName(dominant)} (${(player.emotion[dominant] * 100).toFixed(0)}%)`);

    // 최근 소식
    const recentEvents = world.getRecentEvents(3);
    if (recentEvents.length > 0) {
        printSection('최근 소식');
        recentEvents.forEach(e => {
            if (e.isPublic) {
                console.log(`  • ${textRenderer.describeEvent(e, 'novel')}`);
            }
        });
    }
}

function getEmotionName(emotion: string): string {
    const names: Record<string, string> = {
        trust: '신뢰',
        fear: '공포',
        anger: '분노',
        joy: '기쁨',
        despair: '절망',
    };
    return names[emotion] || emotion;
}

// ============ 메뉴 렌더링 ============
function renderMainMenu(): string[] {
    printSection('행동 선택');

    const options: string[] = [];

    // 주변 인물과 상호작용
    const nearbyChars = world.getCharactersAt(player.location)
        .filter(c => c.id !== player.id);

    if (nearbyChars.length > 0) {
        nearbyChars.forEach((c, i) => {
            options.push(`talk:${c.id}`);
            console.log(`  ${options.length}. ${c.name}에게 말 걸기`);
        });
    }

    // 장소 이동
    const location = world.getLocation(player.location);
    if (location && location.connectedTo.length > 0) {
        location.connectedTo.forEach(locId => {
            const loc = world.getLocation(locId);
            if (loc) {
                options.push(`move:${locId}`);
                console.log(`  ${options.length}. ${loc.name}(으)로 이동`);
            }
        });
    }

    // 기타 행동
    options.push('observe');
    console.log(`  ${options.length}. 주변 관찰하기`);

    // 위험한 장소에서 탐색(전투) 가능
    const currentLocation = world.getLocation(player.location);
    const dangerLevel = (currentLocation as any)?.dangerLevel || 0;
    if (dangerLevel > 0 || currentLocation?.type === 'wilderness' || currentLocation?.type === 'dungeon') {
        options.push('explore');
        console.log(`  ${options.length}. 탐색하기 ⚔️`);
    }

    options.push('status');
    console.log(`  ${options.length}. 상세 상태 보기`);

    options.push('save');
    console.log(`  ${options.length}. 저장하기`);

    options.push('load');
    console.log(`  ${options.length}. 불러오기`);

    options.push('wait');
    console.log(`  ${options.length}. 시간 보내기`);

    options.push('quit');
    console.log(`  ${options.length}. 게임 종료`);

    return options;
}

function renderInteractionMenu(target: Character): Choice[] {
    printSection(`${target.name}과(와)의 상호작용`);

    const choices = choiceGen.generateChoices(player, target.id);

    // 기본 선택지 추가
    choices.push(choiceGen.getObserveChoice());
    choices.push(choiceGen.getSilenceChoice());

    choices.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.text}`);
        console.log(`     └ ${c.context}`);
    });

    console.log(`\n  0. 돌아가기`);

    return choices;
}

// ============ 게임 로직 ============
function processTurn() {
    turnCount++;

    // 시간 진행
    world.advanceTime();

    // 시스템 업데이트
    economy.update();
    ecosystem.update();
    weather.update();
    disease.update();

    // NPC 행동
    eventGenerator.generateNPCActions();

    // 사건 생성
    const events = eventGenerator.generateEvents();
    events.forEach(e => {
        if (e.isPublic) {
            console.log(`\n📢 ${textRenderer.describeEvent(e, 'novel')}`);
        }
    });

    // 임계값 체크
    const thresholdEvents = feedbackLoop.checkThresholds();
    thresholdEvents.forEach(e => {
        console.log(`\n⚠️ [중대 사건] ${textRenderer.describeEvent(e, 'novel')}`);
    });
}

function handleMainAction(action: string) {
    const [type, id] = action.split(':');

    switch (type) {
        case 'talk':
            const target = world.getCharacter(id);
            if (target) {
                currentTarget = target;
            }
            break;

        case 'move':
            const loc = world.getLocation(id);
            if (loc) {
                player.location = id;
                console.log(`\n🚶 ${loc.name}(으)로 이동했다.`);
                processTurn();
            }
            break;

        case 'observe':
            console.log('\n👁️ 주변을 살펴본다...');
            const weatherInfo = weather.getWeather(player.location);
            console.log(`  기온: ${weatherInfo.temperature.toFixed(1)}°C`);
            console.log(`  습도: ${(weatherInfo.humidity * 100).toFixed(0)}%`);
            console.log(`  바람: ${weatherInfo.windSpeed.toFixed(0)}km/h`);

            const ecoInfo = ecosystem.getEcosystemInfo(player.location);
            if (ecoInfo) {
                console.log('\n  [생태계]');
                ecoInfo.species.forEach(s => {
                    console.log(`    ${s.name}: ${s.population}마리`);
                });
            }
            break;

        case 'explore':
            // 탐색은 비동기 처리 필요
            (global as any).pendingAction = 'explore';
            break;

        case 'status':
            renderDetailedStatus();
            break;

        case 'save':
            // 저장은 비동기 처리가 필요하므로 플래그 설정
            (global as any).pendingAction = 'save';
            break;

        case 'load':
            // 불러오기도 비동기 처리
            (global as any).pendingAction = 'load';
            break;

        case 'wait':
            console.log('\n⏳ 시간을 보낸다...');
            processTurn();
            break;

        case 'quit':
            gameRunning = false;
            console.log('\n게임을 종료합니다.');
            break;
    }
}

function handleInteraction(choice: Choice) {
    if (!currentTarget) return;

    console.log(`\n💬 ${choice.text}`);

    try {
        // 현재 타겟 저장 (나중에 null이 될 수 있으므로)
        const target = currentTarget;

        // 결과 서술을 위한 이전 관계 저장
        const beforeRelation = world.relations.getRelation(player.id, target.id);

        // 피드백 루프 적용
        feedbackLoop.applyChoice(choice, player.id, target.id);

        // 결과 서술
        const success = Math.random() > 0.3;
        const outcome = textRenderer.describeOutcome(success, choice.action.name, target.name);
        console.log(`→ ${outcome}`);

        // 관계 변화 서술
        const afterRelation = world.relations.getRelation(player.id, target.id);
        const changeDesc = textRenderer.describeRelationChange(
            player.id, target.id, beforeRelation, afterRelation
        );
        if (changeDesc) {
            console.log(`→ ${changeDesc}`);
        }

        processTurn();
        currentTarget = null;
    } catch (error) {
        console.error('\n⚠️ 오류 발생:', error);
        currentTarget = null;
    }
}

function renderDetailedStatus() {
    printHeader('상세 상태');

    console.log('\n[플레이어]');
    console.log(`  이름: ${player.name}`);
    console.log(`  권력: ${player.power}`);
    console.log(`  자원: ${player.resources}`);

    console.log('\n[감정]');
    Object.entries(player.emotion).forEach(([key, val]) => {
        const bar = '█'.repeat(Math.floor((val as number) * 10)) + '░'.repeat(10 - Math.floor((val as number) * 10));
        console.log(`  ${getEmotionName(key)}: [${bar}] ${((val as number) * 100).toFixed(0)}%`);
    });

    console.log('\n[관계]');
    const allChars = world.getAllCharacters().filter(c => c.id !== player.id);
    allChars.forEach(c => {
        const rel = world.relations.getRelation(player.id, c.id);
        console.log(`  ${c.name}: 신뢰 ${(rel.trust * 100).toFixed(0)}%, 공포 ${(rel.fear * 100).toFixed(0)}%`);
    });

    console.log('\n[경제]');
    const ecoSummary = economy.getSummary();
    console.log(`  식량 평균 가격: ${ecoSummary.avgPrices.food.toFixed(2)}`);
    console.log(`  인플레이션: ${(ecoSummary.inflationRate * 100).toFixed(2)}%`);

    console.log('\n[질병]');
    console.log(`  ${disease.describe()}`);

    // 전투 능력치 표시
    if (player.stats) {
        console.log('\n[전투 능력치]');
        console.log(`  레벨: ${player.level || 1}`);
        console.log(`  경험치: ${player.experience || 0}/${player.expToNextLevel || 100}`);
        console.log(`  HP: ${player.stats.currentHp}/${player.stats.maxHp}`);
        console.log(`  MP: ${player.stats.currentMp}/${player.stats.maxMp}`);
        console.log(`  공격력: ${player.stats.attack} | 방어력: ${player.stats.defense}`);
        console.log(`  속도: ${player.stats.speed} | 치명타: ${(player.stats.critRate * 100).toFixed(0)}%`);

        if (player.statPoints && player.statPoints > 0) {
            console.log(`  💡 분배 가능한 스탯 포인트: ${player.statPoints}`);
        }
        if (player.skillPoints && player.skillPoints > 0) {
            console.log(`  💡 분배 가능한 스킬 포인트: ${player.skillPoints}`);
        }
    }
}

// ============ 전투 시스템 ============

// 적 데이터 (간단한 버전)
const ENEMIES = [
    { id: 'goblin', name: '고블린', level: 1, hp: 30, attack: 8, defense: 2, speed: 12, exp: 15 },
    { id: 'wolf', name: '늑대', level: 2, hp: 45, attack: 12, defense: 3, speed: 18, exp: 25 },
    { id: 'bandit', name: '산적', level: 3, hp: 60, attack: 15, defense: 5, speed: 10, exp: 40 },
    { id: 'skeleton', name: '스켈레톤', level: 5, hp: 80, attack: 20, defense: 8, speed: 8, exp: 60 },
];

function getRandomEnemy(locationDanger: number): typeof ENEMIES[0] {
    const maxLevel = Math.floor(locationDanger * 10) + 1;
    const available = ENEMIES.filter(e => e.level <= maxLevel);
    return available[Math.floor(Math.random() * available.length)] || ENEMIES[0];
}

function renderCombatScreen(enemy: { name: string; hp: number; maxHp: number }) {
    console.clear();
    printHeader(`⚔️ 전투 - ${enemy.name}`);

    // 적 상태
    const enemyHpBar = '█'.repeat(Math.floor((enemy.hp / enemy.maxHp) * 20)) +
        '░'.repeat(20 - Math.floor((enemy.hp / enemy.maxHp) * 20));
    console.log(`\n  ${enemy.name}`);
    console.log(`  HP: [${enemyHpBar}] ${enemy.hp}/${enemy.maxHp}`);

    // 플레이어 상태
    if (player.stats) {
        const playerHpBar = '█'.repeat(Math.floor((player.stats.currentHp / player.stats.maxHp) * 20)) +
            '░'.repeat(20 - Math.floor((player.stats.currentHp / player.stats.maxHp) * 20));
        const playerMpBar = '█'.repeat(Math.floor((player.stats.currentMp / player.stats.maxMp) * 10)) +
            '░'.repeat(10 - Math.floor((player.stats.currentMp / player.stats.maxMp) * 10));
        console.log(`\n  ${player.name} (Lv.${player.level || 1})`);
        console.log(`  HP: [${playerHpBar}] ${player.stats.currentHp}/${player.stats.maxHp}`);
        console.log(`  MP: [${playerMpBar}] ${player.stats.currentMp}/${player.stats.maxMp}`);
    }

    printSection('행동 선택');
    console.log('  1. 공격');
    console.log('  2. 방어');
    console.log('  3. 도망');
}

async function runCombat(prompt: (q: string) => Promise<string>): Promise<{ victory: boolean; exp: number }> {
    const location = world.getLocation(player.location);
    const dangerLevel = (location as any)?.dangerLevel || 0.3;
    const enemyData = getRandomEnemy(dangerLevel);

    const enemy = {
        ...enemyData,
        maxHp: enemyData.hp,
    };

    console.log(`\n⚔️ ${enemy.name}이(가) 나타났다!`);
    await prompt('\nEnter를 눌러 전투 시작...');

    while (enemy.hp > 0 && player.stats && player.stats.currentHp > 0) {
        renderCombatScreen(enemy);

        const input = await prompt('\n선택: ');
        const choice = parseInt(input);

        if (choice === 1) {
            // 공격
            const damage = Math.max(1, (player.stats?.attack || 10) - enemy.defense);
            const isCrit = Math.random() < (player.stats?.critRate || 0.05);
            const finalDamage = isCrit ? Math.floor(damage * (player.stats?.critDamage || 1.5)) : damage;

            enemy.hp = Math.max(0, enemy.hp - finalDamage);
            console.log(`\n⚔️ ${player.name}의 공격! ${finalDamage} 데미지${isCrit ? ' (치명타!)' : ''}`);

        } else if (choice === 2) {
            // 방어
            console.log(`\n🛡️ ${player.name}이(가) 방어 태세를 취했다.`);

        } else if (choice === 3) {
            // 도망
            if (Math.random() < 0.5) {
                console.log('\n🏃 도망에 성공했다!');
                await prompt('\nEnter를 눌러 계속...');
                return { victory: false, exp: 0 };
            } else {
                console.log('\n❌ 도망에 실패했다!');
            }
        }

        // 적 턴
        if (enemy.hp > 0 && player.stats) {
            const isDefending = choice === 2;
            const enemyDamage = Math.max(1, enemy.attack - (player.stats.defense * (isDefending ? 2 : 1)));
            player.stats.currentHp = Math.max(0, player.stats.currentHp - enemyDamage);
            console.log(`\n💥 ${enemy.name}의 공격! ${enemyDamage} 데미지${isDefending ? ' (방어 중)' : ''}`);
        }

        await prompt('\nEnter를 눌러 계속...');
    }

    if (player.stats && player.stats.currentHp <= 0) {
        console.log('\n💀 패배했다...');
        player.stats.currentHp = Math.floor(player.stats.maxHp * 0.3); // 30% HP로 부활
        return { victory: false, exp: 0 };
    } else {
        console.log(`\n🎉 ${enemy.name}을(를) 물리쳤다!`);
        console.log(`💰 ${enemy.exp} 경험치 획득!`);
        return { victory: true, exp: enemy.exp };
    }
}

async function handleCombatResult(prompt: (q: string) => Promise<string>, result: { victory: boolean; exp: number }) {
    if (result.victory && result.exp > 0) {
        const levelUp = LevelSystem.addExperience(player, result.exp);

        if (levelUp) {
            await prompt('\nEnter를 눌러 계속...');
            await renderLevelUpScreen(prompt, levelUp);
        }
    }
}

async function renderLevelUpScreen(prompt: (q: string) => Promise<string>, reward: { level: number; statPoints: number }) {
    console.clear();
    printHeader('🎊 레벨 업!');

    console.log(`\n  레벨 ${reward.level - 1} → ${reward.level}`);
    console.log(`  💪 스탯 포인트 +${reward.statPoints}`);
    console.log(`  ❤️ HP/MP 전체 회복!`);

    while (player.statPoints && player.statPoints > 0) {
        console.log(`\n  남은 스탯 포인트: ${player.statPoints}`);
        console.log('\n  스탯 분배:');
        console.log('  1. 공격력 (+2)');
        console.log('  2. 방어력 (+2)');
        console.log('  3. 최대 HP (+10)');
        console.log('  4. 최대 MP (+5)');
        console.log('  5. 속도 (+1)');
        console.log('  0. 나중에 분배');

        const input = await prompt('\n선택: ');
        const choice = parseInt(input);

        if (choice === 0) break;

        const statMap: Record<number, 'attack' | 'defense' | 'maxHp' | 'maxMp' | 'speed'> = {
            1: 'attack',
            2: 'defense',
            3: 'maxHp',
            4: 'maxMp',
            5: 'speed',
        };

        if (statMap[choice]) {
            LevelSystem.distributeStat(player, statMap[choice]);
            console.log(`✅ ${statMap[choice]} 증가!`);
        }
    }
}

// ============ 메인 게임 루프 ============
async function gameLoop() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const prompt = (question: string): Promise<string> => {
        return new Promise(resolve => {
            rl.question(question, answer => resolve(answer.trim()));
        });
    };

    console.clear();
    printHeader('MathWorld - 텍스트 소설형 RPG');
    console.log('\n수학적 알고리즘으로 구동되는 살아있는 세계에 오신 것을 환영합니다.');
    console.log('당신의 선택이 세계를 바꿉니다.\n');

    await prompt('Enter를 눌러 시작하세요...');

    initGame();

    while (gameRunning) {
        if (currentTarget) {
            // 상호작용 모드
            renderGameScreen();
            const choices = renderInteractionMenu(currentTarget);

            const input = await prompt('\n선택: ');
            const choiceIndex = parseInt(input) - 1;

            if (input === '0' || input === '') {
                currentTarget = null;
            } else if (choiceIndex >= 0 && choiceIndex < choices.length) {
                handleInteraction(choices[choiceIndex]);
                await prompt('\nEnter를 눌러 계속...');
            }
        } else {
            // 메인 메뉴 모드
            renderGameScreen();
            const options = renderMainMenu();

            const input = await prompt('\n선택: ');
            const optionIndex = parseInt(input) - 1;

            if (optionIndex >= 0 && optionIndex < options.length) {
                handleMainAction(options[optionIndex]);

                // 저장/불러오기 처리
                const pendingAction = (global as any).pendingAction;
                if (pendingAction === 'save') {
                    (global as any).pendingAction = null;
                    console.log('\n💾 게임 저장');
                    const slotName = await prompt('저장 슬롯 이름 (기본: slot1): ');
                    const finalSlot = slotName.trim() || 'slot1';

                    if (saveSystem.saveGame(finalSlot, turnCount, player, world)) {
                        console.log(`✅ "${finalSlot}" 슬롯에 저장 완료!`);
                    } else {
                        console.log('❌ 저장 실패');
                    }
                    await prompt('\nEnter를 눌러 계속...');
                } else if (pendingAction === 'load') {
                    (global as any).pendingAction = null;
                    console.log('\n📂 저장 목록');
                    const saves = saveSystem.listSaves();

                    if (saves.length === 0) {
                        console.log('  저장된 게임이 없습니다.');
                    } else {
                        saves.forEach((s, i) => {
                            console.log(`  ${i + 1}. [${s.slotName}] ${s.playerName} - 턴 ${s.turnCount} (${saveSystem.formatTimestamp(s.timestamp)})`);
                        });
                        console.log('  0. 취소');

                        const loadInput = await prompt('\n불러올 슬롯 번호: ');
                        const loadIndex = parseInt(loadInput) - 1;

                        if (loadIndex >= 0 && loadIndex < saves.length) {
                            const saveData = saveSystem.loadGame(saves[loadIndex].slotName);
                            if (saveData) {
                                saveSystem.restoreToWorld(saveData, world);
                                Object.assign(player, saveData.player);
                                turnCount = saveData.turnCount;
                                console.log(`✅ "${saves[loadIndex].slotName}" 불러오기 완료!`);
                            } else {
                                console.log('❌ 불러오기 실패');
                            }
                        }
                    }
                    await prompt('\nEnter를 눌러 계속...');
                } else if (pendingAction === 'explore') {
                    (global as any).pendingAction = null;
                    console.log('\n🔍 주변을 탐색한다...');

                    // 전투 발생 확률
                    if (Math.random() < 0.7) {
                        const result = await runCombat(prompt);
                        await handleCombatResult(prompt, result);
                    } else {
                        console.log('\n  주변에 아무것도 없다...');
                    }

                    processTurn();
                    await prompt('\nEnter를 눌러 계속...');
                } else if (options[optionIndex] !== 'quit' &&
                    !options[optionIndex].startsWith('talk:')) {
                    await prompt('\nEnter를 눌러 계속...');
                }
            }
        }
    }

    rl.close();
    console.log('\n게임을 플레이해주셔서 감사합니다!');
}

// 실행
gameLoop().catch(console.error);

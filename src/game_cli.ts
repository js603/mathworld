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

    turnCount = 0;
    currentTarget = null;
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

    options.push('status');
    console.log(`  ${options.length}. 상세 상태 보기`);

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

        case 'status':
            renderDetailedStatus();
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

                if (options[optionIndex] !== 'quit' &&
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

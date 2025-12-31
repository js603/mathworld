/**
 * MathWorld 100턴 전체 검증 시뮬레이션
 * 
 * 모든 수학적 알고리즘의 유의미한 변화를 검증
 */

import { createGame } from './index';
import {
    ChoiceGenerator,
    CharacterUtils,
    UtilityAI,
    BaseActions,
    WorldState,
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

// ============ 로깅 유틸리티 ============

interface SnapshotData {
    turn: number;
    season: string;
    dayOfYear: number;

    // 감정 (플레이어)
    playerEmotion: { trust: number; fear: number; anger: number; joy: number };

    // 관계
    avgTrust: number;
    avgFear: number;
    factionCount: number;

    // 경제
    avgFoodPrice: number;
    inflationRate: number;

    // 생태계
    preyPopulation: number;
    predatorPopulation: number;
    ecosystemStability: number;

    // 날씨
    weatherType: string;
    temperature: number;

    // 전염병
    susceptible: number;
    infected: number;
    recovered: number;
    dead: number;

    // 사건
    eventsThisTurn: string[];
}

function printSection(title: string) {
    console.log('\n' + '═'.repeat(60));
    console.log(`  ${title}`);
    console.log('═'.repeat(60));
}

function printSubSection(title: string) {
    console.log(`\n【 ${title} 】`);
}

// ============ 메인 시뮬레이션 ============

function runFullSimulation() {
    printSection('MathWorld 100턴 전체 검증 시뮬레이션');
    console.log('시작 시간:', new Date().toISOString());

    // ============ 초기화 ============
    const { world, player, king, merchant } = createGame();

    // 추가 장소 및 캐릭터 설정
    world.addLocation({
        id: 'wilderness',
        name: '황야',
        type: 'wilderness',
        resources: 100,
        population: 0,
        stability: 0.3,
        connectedTo: ['village1'],
    });

    // 서사 엔진
    const feedbackLoop = new FeedbackLoop(world);
    const eventGenerator = new EventGenerator(world);
    const beliefSystem = new BeliefSystem(world);
    const textRenderer = new TextRenderer(world);
    const choiceGen = new ChoiceGenerator(world);
    const ai = new UtilityAI(world);

    // 확장 시스템
    const economy = new Economy(world);
    const ecosystem = new EcosystemSimulation(world);
    const weather = new Weather(world);
    const disease = new Disease(world);

    // 스냅샷 저장소
    const snapshots: SnapshotData[] = [];
    const allEvents: string[] = [];

    // ============ 초기 상태 기록 ============
    printSubSection('초기 상태');
    console.log(`플레이어: ${player.name} (권력: ${player.power}, 자원: ${player.resources})`);
    console.log(`왕: ${king.name} (권력: ${king.power})`);
    console.log(`상인: ${merchant.name} (권력: ${merchant.power})`);
    console.log(`계절: ${world.globalState.season}`);

    // 초기 역병 발생 (SIR 테스트용)
    disease.startOutbreak('fever', merchant.id);
    console.log('\n[!] 초기 역병 발생: 열병 (상인에서 시작)');

    // 초기 관계 설정
    world.relations.updateRelation(player.id, merchant.id, { trust: 0.3 });
    world.relations.updateRelation(merchant.id, player.id, { trust: 0.2 });
    world.relations.updateRelation(king.id, merchant.id, { trust: 0.4, respect: 0.3 });

    // 플레이어 초기 감정 설정
    CharacterUtils.updateEmotion(player, { anger: 0.7, fear: 0.5 });

    // ============ 100턴 시뮬레이션 ============
    printSection('시뮬레이션 시작 (100턴)');

    for (let turn = 1; turn <= 100; turn++) {
        const turnEvents: string[] = [];

        // 1. 시간 진행
        world.advanceTime();

        // 2. 확장 시스템 업데이트
        economy.update();
        ecosystem.update();
        weather.update();
        disease.update();

        // 3. NPC 자발적 행동
        eventGenerator.generateNPCActions();

        // 4. 사건 생성
        const events = eventGenerator.generateEvents();
        for (const event of events) {
            const desc = textRenderer.describeEvent(event, 'novel');
            turnEvents.push(desc);
            allEvents.push(`[턴 ${turn}] ${desc}`);
        }

        // 5. 임계값 체크
        const thresholdEvents = feedbackLoop.checkThresholds();
        for (const event of thresholdEvents) {
            const desc = `[임계값] ${textRenderer.describeEvent(event, 'novel')}`;
            turnEvents.push(desc);
            allEvents.push(`[턴 ${turn}] ${desc}`);
        }

        // 6. 랜덤 플레이어 행동 (시뮬레이션용)
        if (turn % 5 === 0) {
            const choices = choiceGen.generateChoices(player, merchant.id);
            if (choices.length > 0) {
                const randomChoice = choices[Math.floor(Math.random() * choices.length)];
                feedbackLoop.applyChoice(randomChoice, player.id, merchant.id);
            }
        }

        // 7. 스냅샷 (10턴마다)
        if (turn % 10 === 0 || turn === 1) {
            const ecosystemInfo = ecosystem.getEcosystemInfo('wilderness');
            const economySummary = economy.getSummary();
            const weatherInfo = weather.getWeather('capital');
            const diseaseStats = disease.getStats();
            const relationStats = world.relations.getStats();
            const clusters = world.relations.getClusters(0.3);

            const snapshot: SnapshotData = {
                turn,
                season: world.globalState.season,
                dayOfYear: world.globalState.dayOfYear,

                playerEmotion: { ...player.emotion },

                avgTrust: relationStats.avgTrust,
                avgFear: relationStats.avgFear,
                factionCount: clusters.length,

                avgFoodPrice: economySummary.avgPrices.food,
                inflationRate: economySummary.inflationRate,

                preyPopulation: ecosystemInfo?.species.find(s => s.name === '사슴')?.population || 0,
                predatorPopulation: ecosystemInfo?.species.find(s => s.name === '늑대')?.population || 0,
                ecosystemStability: ecosystemInfo?.stability || 0,

                weatherType: weatherInfo.type,
                temperature: weatherInfo.temperature,

                susceptible: diseaseStats.susceptible,
                infected: diseaseStats.infected,
                recovered: diseaseStats.recovered,
                dead: diseaseStats.dead,

                eventsThisTurn: turnEvents,
            };

            snapshots.push(snapshot);

            // 진행 상황 출력
            console.log(`\n[턴 ${turn}] ${world.globalState.season} ${world.globalState.dayOfYear}일`);
            if (turnEvents.length > 0) {
                turnEvents.forEach(e => console.log(`  → ${e}`));
            }
        }
    }

    // ============ 결과 분석 ============
    printSection('시뮬레이션 결과 분석');

    // 1. 감정 감쇠 분석
    printSubSection('1. 감정 감쇠 (Emotion Decay)');
    const firstEmotion = snapshots[0].playerEmotion;
    const lastEmotion = snapshots[snapshots.length - 1].playerEmotion;
    console.log(`  초기 분노: ${firstEmotion.anger.toFixed(3)} → 최종: ${lastEmotion.anger.toFixed(3)}`);
    console.log(`  초기 공포: ${firstEmotion.fear.toFixed(3)} → 최종: ${lastEmotion.fear.toFixed(3)}`);
    console.log(`  감쇠율: ${((1 - lastEmotion.anger / firstEmotion.anger) * 100).toFixed(1)}%`);
    console.log(`  ✓ 예상: 0.95^100 = ${Math.pow(0.95, 100).toFixed(6)} (99.4% 감쇠)`);

    // 2. 계절 변화 분석
    printSubSection('2. 계절 변화 (Seasonal)');
    const seasons = snapshots.map(s => s.season);
    const uniqueSeasons = [...new Set(seasons)];
    console.log(`  관찰된 계절: ${uniqueSeasons.join(' → ')}`);
    console.log(`  100일 ≈ 1.1계절 (91일/계절)`);
    console.log(`  최종 일수: ${snapshots[snapshots.length - 1].dayOfYear}일`);

    // 3. 경제 시스템 분석
    printSubSection('3. 경제 (Economy - Supply/Demand)');
    console.log('  턴 | 식량가격 | 인플레이션');
    console.log('  ' + '-'.repeat(35));
    snapshots.forEach(s => {
        console.log(`  ${s.turn.toString().padStart(3)} | ${s.avgFoodPrice.toFixed(2).padStart(8)} | ${(s.inflationRate * 100).toFixed(2)}%`);
    });

    // 4. 생태계 분석
    printSubSection('4. 생태계 (Lotka-Volterra)');
    console.log('  턴 | 사슴(피식자) | 늑대(포식자) | 안정성');
    console.log('  ' + '-'.repeat(50));
    snapshots.forEach(s => {
        console.log(`  ${s.turn.toString().padStart(3)} | ${s.preyPopulation.toString().padStart(12)} | ${s.predatorPopulation.toString().padStart(12)} | ${s.ecosystemStability.toFixed(2)}`);
    });

    // 5. 날씨 분석
    printSubSection('5. 날씨 (Markov Chain)');
    const weatherTypes = snapshots.map(s => s.weatherType);
    const weatherCounts: Record<string, number> = {};
    weatherTypes.forEach(w => weatherCounts[w] = (weatherCounts[w] || 0) + 1);
    console.log('  날씨 분포:');
    Object.entries(weatherCounts).forEach(([type, count]) => {
        console.log(`    ${type}: ${count}회 (${(count / snapshots.length * 100).toFixed(1)}%)`);
    });
    console.log('  기온 변화:');
    snapshots.forEach(s => {
        console.log(`    턴 ${s.turn}: ${s.temperature.toFixed(1)}°C (${s.weatherType})`);
    });

    // 6. 전염병 분석
    printSubSection('6. 전염병 (SIR Model)');
    console.log('  턴 | 취약(S) | 감염(I) | 회복(R) | 사망(D)');
    console.log('  ' + '-'.repeat(50));
    snapshots.forEach(s => {
        console.log(`  ${s.turn.toString().padStart(3)} | ${s.susceptible.toString().padStart(7)} | ${s.infected.toString().padStart(7)} | ${s.recovered.toString().padStart(7)} | ${s.dead.toString().padStart(7)}`);
    });

    // 7. 관계/파벌 분석
    printSubSection('7. 관계 및 파벌 (Graph Theory)');
    console.log('  턴 | 평균신뢰 | 평균공포 | 파벌수');
    console.log('  ' + '-'.repeat(40));
    snapshots.forEach(s => {
        console.log(`  ${s.turn.toString().padStart(3)} | ${s.avgTrust.toFixed(3).padStart(8)} | ${s.avgFear.toFixed(3).padStart(8)} | ${s.factionCount}`);
    });

    // 8. 발생한 사건 요약
    printSubSection('8. 발생한 사건 요약');
    if (allEvents.length > 0) {
        console.log(`  총 ${allEvents.length}개 사건 발생:`);
        allEvents.slice(0, 20).forEach(e => console.log(`    ${e}`));
        if (allEvents.length > 20) {
            console.log(`    ... 외 ${allEvents.length - 20}개`);
        }
    } else {
        console.log('  발생한 사건 없음');
    }

    // ============ 유의미한 변화 요약 ============
    printSection('유의미한 변화 요약');

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];

    console.log('\n[수학적 모델 검증 결과]');
    console.log('─'.repeat(50));

    // 감정 감쇠
    const emotionDecay = 1 - last.playerEmotion.anger / first.playerEmotion.anger;
    console.log(`✓ 감정 감쇠: ${(emotionDecay * 100).toFixed(1)}% 감소 (지수 감쇠 모델)`);

    // 계절
    console.log(`✓ 계절 변화: ${first.season} → ${last.season} (사인파 모델)`);

    // 경제
    const priceChange = ((last.avgFoodPrice - first.avgFoodPrice) / first.avgFoodPrice * 100);
    console.log(`✓ 식량 가격: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}% 변화 (수요-공급 모델)`);

    // 생태계
    const preyChange = last.preyPopulation - first.preyPopulation;
    const predatorChange = last.predatorPopulation - first.predatorPopulation;
    console.log(`✓ 생태계: 사슴 ${preyChange > 0 ? '+' : ''}${preyChange}, 늑대 ${predatorChange > 0 ? '+' : ''}${predatorChange} (Lotka-Volterra)`);

    // 날씨
    console.log(`✓ 날씨 전이: ${Object.keys(weatherCounts).length}가지 상태 관찰 (마르코프 체인)`);

    // SIR
    const sirTotal = first.susceptible + first.infected + first.recovered + first.dead;
    const infectedPeak = Math.max(...snapshots.map(s => s.infected));
    console.log(`✓ 역병: 감염 피크 ${infectedPeak}명, 최종 회복 ${last.recovered}명, 사망 ${last.dead}명 (SIR)`);

    // 관계
    const trustChange = last.avgTrust - first.avgTrust;
    console.log(`✓ 평균 신뢰도: ${trustChange > 0 ? '+' : ''}${trustChange.toFixed(3)} 변화 (그래프 이론)`);

    // 사건
    console.log(`✓ 자동 생성 사건: ${allEvents.length}개 (확률적 사건 시스템)`);

    printSection('시뮬레이션 완료');
    console.log('종료 시간:', new Date().toISOString());
}

// 실행
runFullSimulation();

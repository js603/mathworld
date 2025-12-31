/**
 * MathWorld 데모 - Phase 1 & 2 통합
 * 
 * 핵심 시스템 + 서사 엔진 동작 확인
 */

import { createGame } from './index';
import {
    ChoiceGenerator,
    CharacterUtils,
    UtilityAI,
    BaseActions,
} from './core';
import {
    FeedbackLoop,
    EventGenerator,
    BeliefSystem,
    TextRenderer,
} from './narrative';

function runDemo() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('   MathWorld - 텍스트 소설형 RPG 데모 (Phase 1 & 2)');
    console.log('═══════════════════════════════════════════════════════\n');

    // 게임 초기화
    const { world, player, king, merchant } = createGame();

    // 서사 엔진 초기화
    const feedbackLoop = new FeedbackLoop(world);
    const eventGenerator = new EventGenerator(world);
    const beliefSystem = new BeliefSystem(world);
    const textRenderer = new TextRenderer(world);
    const choiceGen = new ChoiceGenerator(world);

    // ═══════════════════════════════════════
    // 1. 세계 상태 렌더링
    // ═══════════════════════════════════════
    console.log('【 세계 상태 】');
    console.log(textRenderer.renderWorldState('novel'));
    console.log();

    // ═══════════════════════════════════════
    // 2. 턴 시작 요약
    // ═══════════════════════════════════════
    console.log('【 턴 시작 요약 】');
    console.log(textRenderer.renderTurnSummary(player.id));
    console.log();

    // ═══════════════════════════════════════
    // 3. 동적 선택지 생성
    // ═══════════════════════════════════════
    console.log('【 [상인과의 상호작용] 선택지 】');
    const choices = choiceGen.generateChoices(player, merchant.id);
    console.log(textRenderer.formatChoices(choices));
    console.log();

    // ═══════════════════════════════════════
    // 4. 선택 적용 → 피드백 루프
    // ═══════════════════════════════════════
    console.log('【 선택 적용: 우호적 대화 】');
    const selectedChoice = choices.find(c => c.action.id === 'talk_friendly') || choices[0];

    // 관계 변화 전 상태 저장
    const beforeRelation = { ...world.relations.getRelation(player.id, merchant.id) };

    // 피드백 루프 적용
    feedbackLoop.applyChoice(selectedChoice, player.id, merchant.id);

    // 관계 변화 후 상태
    const afterRelation = world.relations.getRelation(player.id, merchant.id);

    // 관계 변화 서술 (숫자 숨김)
    const changeDesc = textRenderer.describeRelationChange(
        player.id, merchant.id, beforeRelation, afterRelation
    );
    if (changeDesc) {
        console.log(`→ ${changeDesc}`);
    } else {
        console.log('→ ' + textRenderer.describeOutcome(true, '대화', merchant.name));
    }
    console.log();

    // ═══════════════════════════════════════
    // 5. 믿음 시스템
    // ═══════════════════════════════════════
    console.log('【 믿음 시스템 】');

    // 플레이어의 상인에 대한 인식
    console.log(`플레이어 → 상인 인식: ${beliefSystem.getPerception(player, merchant.id)}`);

    // 정보 공유 시뮬레이션
    console.log('\n(왕이 플레이어에게 상인은 "거짓말쟁이"라고 말함)');
    beliefSystem.shareInformation(king, player, merchant.id, 'liar');
    console.log(`플레이어의 "상인이 정직하다" 믿음: ${beliefSystem.getBelief(player, merchant.id, 'honest').toFixed(3)}`);
    console.log();

    // ═══════════════════════════════════════
    // 6. 사건 자동 생성
    // ═══════════════════════════════════════
    console.log('【 사건 자동 생성 】');

    // 불안정 상태 감지
    const instabilities = eventGenerator.detectInstability();
    console.log(`불안정 상태: ${instabilities.length > 0 ? instabilities.join(', ') : '없음'}`);

    // 사건 생성
    const events = eventGenerator.generateEvents();
    if (events.length > 0) {
        console.log('발생한 사건:');
        for (const event of events) {
            console.log(`  - ${textRenderer.describeEvent(event, 'novel')}`);
        }
    } else {
        console.log('이번 턴에는 특별한 사건이 없었다.');
    }
    console.log();

    // NPC 자발적 행동
    console.log('(NPC 자발적 행동 시뮬레이션)');
    eventGenerator.generateNPCActions();
    console.log('NPC들이 각자의 일상을 보내고 있다.');
    console.log();

    // ═══════════════════════════════════════
    // 7. 시간 경과 (5턴)
    // ═══════════════════════════════════════
    console.log('【 시간 경과 (5턴) 】');
    for (let i = 0; i < 5; i++) {
        world.advanceTime();
        eventGenerator.generateNPCActions();
    }
    console.log(textRenderer.renderWorldState('novel'));

    // 누적된 변화 요약
    const changeSummary = feedbackLoop.getAccumulatedChangeSummary(player.id);
    if (changeSummary.length > 0) {
        console.log('\n[변화의 흐름]');
        changeSummary.forEach(s => console.log(`  • ${s}`));
    }
    console.log();

    // ═══════════════════════════════════════
    // 8. 임계값 체크
    // ═══════════════════════════════════════
    console.log('【 임계값 체크 】');
    const thresholdEvents = feedbackLoop.checkThresholds();
    if (thresholdEvents.length > 0) {
        console.log('임계점 도달! 중대한 변화:');
        for (const event of thresholdEvents) {
            console.log(`  ! ${textRenderer.describeEvent(event, 'novel')}`);
        }
    } else {
        console.log('아직 임계점에 도달하지 않았다.');
    }
    console.log();

    // ═══════════════════════════════════════
    // 9. 캐릭터 서술
    // ═══════════════════════════════════════
    console.log('【 인물 묘사 】');
    console.log(`왕: ${textRenderer.describeCharacter(king.id, 'novel')}`);
    console.log(`상인: ${textRenderer.describeCharacter(merchant.id, 'novel')}`);
    console.log(`플레이어: ${textRenderer.describeCharacter(player.id, 'novel')}`);
    console.log();

    console.log('═══════════════════════════════════════════════════════');
    console.log('   데모 완료! Phase 1 & 2 정상 작동');
    console.log('═══════════════════════════════════════════════════════');
}

// 실행
runDemo();

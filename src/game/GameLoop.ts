/**
 * 메인 게임 루프
 * 
 * 턴 기반 게임의 핵심 루프 관리
 */

import { WorldState, ChoiceGenerator, UtilityAI, BaseActions, Character, EntityId, Choice } from '../core';
import { FeedbackLoop, EventGenerator, BeliefSystem, TextRenderer } from '../narrative';

/**
 * 게임 상태
 */
export type GamePhase = 'exploration' | 'dialogue' | 'combat' | 'event';

/**
 * 턴 결과
 */
export interface TurnResult {
    events: string[];
    stateChanges: string[];
    nextPhase: GamePhase;
}

/**
 * 게임 루프 클래스
 */
export class GameLoop {
    private world: WorldState;
    private feedbackLoop: FeedbackLoop;
    private eventGenerator: EventGenerator;
    private beliefSystem: BeliefSystem;
    private textRenderer: TextRenderer;
    private choiceGenerator: ChoiceGenerator;
    private utilityAI: UtilityAI;

    private currentPhase: GamePhase = 'exploration';
    private turnCount: number = 0;
    private playerId: EntityId | null = null;

    constructor(world: WorldState) {
        this.world = world;
        this.feedbackLoop = new FeedbackLoop(world);
        this.eventGenerator = new EventGenerator(world);
        this.beliefSystem = new BeliefSystem(world);
        this.textRenderer = new TextRenderer(world);
        this.choiceGenerator = new ChoiceGenerator(world);
        this.utilityAI = new UtilityAI(world);
    }

    /**
     * 플레이어 설정
     */
    setPlayer(playerId: EntityId): void {
        this.playerId = playerId;
    }

    /**
     * 현재 턴 수
     */
    get turn(): number {
        return this.turnCount;
    }

    /**
     * 현재 게임 페이즈
     */
    get phase(): GamePhase {
        return this.currentPhase;
    }

    /**
     * 턴 시작 처리
     */
    startTurn(): string {
        this.turnCount++;
        this.eventGenerator.clearRecentEvents();
        this.feedbackLoop.resetAccumulatedChanges();

        if (!this.playerId) {
            return '플레이어가 설정되지 않았습니다.';
        }

        return this.textRenderer.renderTurnSummary(this.playerId);
    }

    /**
     * 플레이어 선택지 생성
     */
    getPlayerChoices(targetId?: EntityId): Choice[] {
        if (!this.playerId) return [];

        const player = this.world.getCharacter(this.playerId);
        if (!player) return [];

        const choices = this.choiceGenerator.generateChoices(player, targetId);

        // 항상 가능한 기본 선택지 추가
        choices.push(this.choiceGenerator.getObserveChoice());
        choices.push(this.choiceGenerator.getSilenceChoice());

        return choices;
    }

    /**
     * 플레이어 선택 적용
     */
    applyPlayerChoice(choice: Choice, targetId?: EntityId): string {
        if (!this.playerId) return '플레이어가 설정되지 않았습니다.';

        // 피드백 루프 적용
        this.feedbackLoop.applyChoice(choice, this.playerId, targetId);

        // 결과 서술
        const success = Math.random() > 0.3; // 간단한 성공 판정
        return this.textRenderer.describeOutcome(success, choice.text,
            targetId ? this.world.getCharacter(targetId)?.name : undefined);
    }

    /**
     * NPC 턴 처리
     */
    processNPCTurns(): string[] {
        const results: string[] = [];
        const npcs = this.world.getAllCharacters().filter(c => !c.isPlayer);

        for (const npc of npcs) {
            // 10% 확률로 행동
            if (Math.random() > 0.1) continue;

            // AI 행동 결정
            const decision = this.utilityAI.selectAction(npc, BaseActions);
            if (decision) {
                // 랜덤 타겟 선택
                const possibleTargets = npcs.filter(n => n.id !== npc.id);
                const target = possibleTargets[Math.floor(Math.random() * possibleTargets.length)];

                if (target) {
                    results.push(`${npc.name}이(가) ${decision.action.name}을(를) 시도했다.`);
                }
            }
        }

        return results;
    }

    /**
     * 사건 처리
     */
    processEvents(): string[] {
        const results: string[] = [];

        // 사건 자동 생성
        const events = this.eventGenerator.generateEvents();
        for (const event of events) {
            results.push(this.textRenderer.describeEvent(event, 'novel'));
        }

        // 임계값 체크
        const thresholdEvents = this.feedbackLoop.checkThresholds();
        for (const event of thresholdEvents) {
            results.push(`[중대 사건] ${this.textRenderer.describeEvent(event, 'novel')}`);
        }

        return results;
    }

    /**
     * 턴 종료 처리
     */
    endTurn(): TurnResult {
        // 시간 경과
        this.world.advanceTime();

        // NPC 자발적 행동
        this.eventGenerator.generateNPCActions();

        // 결과 수집
        const events = this.processEvents();
        const stateChanges = this.playerId
            ? this.feedbackLoop.getAccumulatedChangeSummary(this.playerId)
            : [];

        // 다음 페이즈 결정
        const instabilities = this.eventGenerator.detectInstability();
        let nextPhase: GamePhase = 'exploration';
        if (instabilities.includes('fear_spike')) {
            nextPhase = 'event';
        }

        return {
            events,
            stateChanges,
            nextPhase,
        };
    }

    /**
     * 전체 턴 실행 (자동)
     */
    runFullTurn(choiceIndex: number, targetId?: EntityId): {
        turnStart: string;
        choices: Choice[];
        actionResult: string;
        npcActions: string[];
        turnEnd: TurnResult;
    } {
        const turnStart = this.startTurn();
        const choices = this.getPlayerChoices(targetId);

        const selectedChoice = choices[choiceIndex] || choices[0];
        const actionResult = this.applyPlayerChoice(selectedChoice, targetId);

        const npcActions = this.processNPCTurns();
        const turnEnd = this.endTurn();

        return {
            turnStart,
            choices,
            actionResult,
            npcActions,
            turnEnd,
        };
    }
}

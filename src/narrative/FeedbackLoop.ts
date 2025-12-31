/**
 * 피드백 루프 시스템
 * 
 * 핵심: 선택 → 세계 → 선택의 무한 순환
 * - 결과를 즉시 보여주지 않는다
 * - 누적 효과로만 체감하게 한다
 * - 수치는 항상 "관계 변화"로 번역된다
 */

import {
    EntityId,
    Character,
    Choice,
    GameEvent,
    Effect,
    InstabilityType,
} from '../core/types';
import { WorldState } from '../core/WorldState';
import { generateId, rollSuccess } from '../utils';

/**
 * 임계값 정의
 */
interface Threshold {
    id: string;
    name: string;
    check: (world: WorldState) => boolean;
    eventType: GameEvent['type'];
    description: string;
}

/**
 * 누적된 변화 추적
 */
interface AccumulatedChange {
    characterId: EntityId;
    field: string;
    totalChange: number;
    changeCount: number;
    lastTimestamp: number;
}

/**
 * 피드백 루프 클래스
 */
export class FeedbackLoop {
    private world: WorldState;
    private accumulatedChanges: Map<string, AccumulatedChange> = new Map();
    private thresholds: Threshold[] = [];
    private pendingEvents: GameEvent[] = [];

    constructor(world: WorldState) {
        this.world = world;
        this.initializeThresholds();
    }

    /**
     * 기본 임계값 초기화
     */
    private initializeThresholds(): void {
        this.thresholds = [
            {
                id: 'trust_collapse',
                name: '신뢰 붕괴',
                check: (world) => {
                    const stats = world.relations.getStats();
                    return stats.avgTrust < -0.3;
                },
                eventType: 'betrayal',
                description: '전반적인 신뢰가 무너졌다',
            },
            {
                id: 'fear_spike',
                name: '공포 급등',
                check: (world) => {
                    const stats = world.relations.getStats();
                    return stats.avgFear > 0.6;
                },
                eventType: 'custom',
                description: '공포가 사회를 지배하고 있다',
            },
            {
                id: 'power_vacuum',
                name: '권력 공백',
                check: (world) => {
                    const influential = world.relations.getMostInfluential(1);
                    if (influential.length === 0) return false;
                    const leader = world.getCharacter(influential[0]);
                    return leader ? leader.power < 20 : false;
                },
                eventType: 'custom',
                description: '권력의 공백이 생겼다',
            },
        ];
    }

    /**
     * 선택지 적용 → 세계 상태 변화 (핵심 메서드)
     */
    applyChoice(choice: Choice, actorId: EntityId, targetId?: EntityId): void {
        const actor = this.world.getCharacter(actorId);
        if (!actor) return;

        // 1. 효과 적용 (숨김)
        for (const effect of choice.action.effects) {
            this.applyEffectSilently(effect, actorId, targetId);
        }

        // 2. 이벤트 기록
        const event: GameEvent = {
            id: generateId('event'),
            type: this.getEventType(choice.action.category),
            timestamp: this.world.time,
            participants: targetId ? [actorId, targetId] : [actorId],
            location: actor.location,
            description: `${actor.name}이(가) ${choice.text}`,
            effects: choice.action.effects,
            isPublic: this.isPublicAction(choice.action.category),
            witnesses: this.getWitnesses(actor.location, actorId),
        };

        this.world.addEvent(event);

        // 3. 파급 효과 전파
        this.propagateEffects(event);
    }

    /**
     * 효과를 조용히 적용 (수치 변화를 플레이어에게 보여주지 않음)
     */
    private applyEffectSilently(
        effect: Effect,
        actorId: EntityId,
        targetId?: EntityId
    ): void {
        // 타겟 해석
        let resolvedTarget = effect.target;
        if (effect.target === 'self') resolvedTarget = actorId;
        if (effect.target === 'target' && targetId) resolvedTarget = targetId;
        if (effect.target === 'self:target' && targetId) {
            resolvedTarget = `${actorId}:${targetId}`;
        }

        // 효과 적용
        const modifiedEffect = { ...effect, target: resolvedTarget };
        this.world.applyEffect(modifiedEffect);

        // 누적 변화 추적
        this.trackChange(resolvedTarget, effect.field, effect.change as number);
    }

    /**
     * 변화 누적 추적
     */
    private trackChange(target: EntityId, field: string, change: number): void {
        const key = `${target}:${field}`;
        const existing = this.accumulatedChanges.get(key);

        if (existing) {
            existing.totalChange += change;
            existing.changeCount++;
            existing.lastTimestamp = this.world.time;
        } else {
            this.accumulatedChanges.set(key, {
                characterId: target,
                field,
                totalChange: change,
                changeCount: 1,
                lastTimestamp: this.world.time,
            });
        }
    }

    /**
     * 파급 효과 전파
     * - 관계 변화가 다른 관계에 영향
     * - 소문 확산
     */
    private propagateEffects(event: GameEvent): void {
        // 목격자들의 관계 변화
        for (const witnessId of event.witnesses) {
            if (event.participants.includes(witnessId)) continue;

            const witness = this.world.getCharacter(witnessId);
            if (!witness) continue;

            // 목격한 행동에 따른 평가 변화
            for (const participantId of event.participants) {
                this.evaluateWitnessedAction(witnessId, participantId, event);
            }
        }

        // 정보 확산 (시간에 따라)
        if (event.isPublic) {
            this.spreadInformation(event);
        }
    }

    /**
     * 목격한 행동 평가
     */
    private evaluateWitnessedAction(
        witnessId: EntityId,
        actorId: EntityId,
        event: GameEvent
    ): void {
        const witness = this.world.getCharacter(witnessId);
        if (!witness) return;

        // 행동 유형에 따른 평가
        let trustChange = 0;
        let respectChange = 0;

        switch (event.type) {
            case 'betrayal':
                trustChange = -0.2;
                respectChange = -0.1;
                break;
            case 'combat':
                if (witness.personality.morality > 0.6) {
                    trustChange = -0.1;
                }
                if (witness.personality.courage > 0.6) {
                    respectChange = 0.05;
                }
                break;
            case 'trade':
                trustChange = 0.02;
                break;
        }

        // 관계 변화 적용
        if (trustChange !== 0 || respectChange !== 0) {
            this.world.relations.modifyRelation(witnessId, actorId, {
                trust: trustChange,
                respect: respectChange,
            });
        }
    }

    /**
     * 정보 확산
     */
    private spreadInformation(event: GameEvent): void {
        // 소문 확산 시뮬레이션 (간소화 버전)
        const source = event.participants[0];
        const informed = this.world.relations.simulateRumorSpread(
            source,
            2, // 2턴에 걸쳐 확산
            (relation) => 0.2 + relation.trust * 0.3
        );

        // 정보를 받은 사람들에게 기억 추가
        for (const characterId of informed) {
            if (event.participants.includes(characterId)) continue;

            const character = this.world.getCharacter(characterId);
            if (character) {
                // 소문으로 들은 것은 해석이 달라질 수 있음
                character.memory.push({
                    eventId: event.id,
                    interpretation: `소문: ${event.description}`,
                    emotionalImpact: {},
                    timestamp: this.world.time,
                });
            }
        }
    }

    /**
     * 임계값 체크 → 자동 이벤트 발생
     */
    checkThresholds(): GameEvent[] {
        const triggeredEvents: GameEvent[] = [];

        for (const threshold of this.thresholds) {
            if (threshold.check(this.world)) {
                const event: GameEvent = {
                    id: generateId('event'),
                    type: threshold.eventType,
                    timestamp: this.world.time,
                    participants: [],
                    location: 'global',
                    description: threshold.description,
                    effects: [],
                    isPublic: true,
                    witnesses: [],
                };

                triggeredEvents.push(event);
                this.world.addEvent(event);
            }
        }

        return triggeredEvents;
    }

    /**
     * 불안정 상태 감지
     */
    detectInstability(): InstabilityType[] {
        const instabilities: InstabilityType[] = [];
        const stats = this.world.relations.getStats();

        // 권력 불균형
        const influential = this.world.relations.getMostInfluential(2);
        if (influential.length >= 2) {
            const top1 = this.world.getCharacter(influential[0]);
            const top2 = this.world.getCharacter(influential[1]);
            if (top1 && top2 && top1.power > top2.power * 2) {
                instabilities.push('power_imbalance');
            }
        }

        // 신뢰 붕괴
        if (stats.avgTrust < -0.2) {
            instabilities.push('trust_collapse');
        }

        // 공포 급등
        if (stats.avgFear > 0.5) {
            instabilities.push('fear_spike');
        }

        return instabilities;
    }

    /**
     * 누적된 변화 요약 (의도 유도: 숫자가 아닌 의미로 표현)
     */
    getAccumulatedChangeSummary(characterId: EntityId): string[] {
        const summaries: string[] = [];

        for (const [key, change] of this.accumulatedChanges) {
            if (!key.startsWith(characterId)) continue;

            if (change.field === 'trust' && Math.abs(change.totalChange) > 0.1) {
                if (change.totalChange > 0) {
                    summaries.push('주변 사람들이 당신을 더 신뢰하게 되었다');
                } else {
                    summaries.push('사람들의 시선이 차가워졌다');
                }
            }

            if (change.field === 'fear' && change.totalChange > 0.1) {
                summaries.push('두려움의 그림자가 드리워졌다');
            }

            if (change.field === 'respect' && Math.abs(change.totalChange) > 0.1) {
                if (change.totalChange > 0) {
                    summaries.push('당신의 행동이 존경을 얻었다');
                } else {
                    summaries.push('당신의 명성이 실추되었다');
                }
            }
        }

        return summaries;
    }

    /**
     * 누적 변화 초기화 (새 턴 시작 시)
     */
    resetAccumulatedChanges(): void {
        this.accumulatedChanges.clear();
    }

    // ============ 유틸리티 ============

    private getEventType(category: string): GameEvent['type'] {
        switch (category) {
            case 'combat': return 'combat';
            case 'economic': return 'trade';
            case 'social': return 'dialogue';
            default: return 'custom';
        }
    }

    private isPublicAction(category: string): boolean {
        return category === 'combat' || category === 'economic';
    }

    private getWitnesses(locationId: EntityId, excludeId: EntityId): EntityId[] {
        return this.world.getCharactersAt(locationId)
            .filter(c => c.id !== excludeId)
            .slice(0, 5) // 최대 5명
            .map(c => c.id);
    }
}

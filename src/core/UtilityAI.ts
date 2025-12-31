/**
 * 효용 함수 기반 AI 모듈
 * 
 * 핵심: U(action) = Σ P(outcome) × Value(outcome)
 * NPC는 "최대 기대 효용"을 선택
 */

import {
    EntityId,
    Character,
    Action,
    Condition,
    Effect,
} from './types';
import { WorldState } from './WorldState';
import { clamp, sigmoid } from '../utils';

/**
 * 효용 계산 결과
 */
export interface UtilityResult {
    action: Action;
    utility: number;
    breakdown: {
        selfBenefit: number;
        targetBenefit: number;
        risk: number;
        personalityFit: number;
        emotionalFit: number;
    };
}

/**
 * 효용 함수 AI 클래스
 */
export class UtilityAI {
    private world: WorldState;

    constructor(world: WorldState) {
        this.world = world;
    }

    /**
     * 단일 행동의 효용 계산
     */
    calculateUtility(
        character: Character,
        action: Action,
        targetId?: EntityId
    ): UtilityResult {
        // 조건 체크
        if (!this.checkConditions(character, action.conditions, targetId)) {
            return {
                action,
                utility: -Infinity,
                breakdown: { selfBenefit: 0, targetBenefit: 0, risk: 0, personalityFit: 0, emotionalFit: 0 },
            };
        }

        // 효과 분석
        const selfBenefit = this.calculateSelfBenefit(character, action.effects);
        const targetBenefit = targetId
            ? this.calculateTargetBenefit(character, targetId, action.effects)
            : 0;

        // 리스크 계산 (실패 확률 × 실패 비용)
        const successRate = this.calculateSuccessRate(character, action, targetId);
        const risk = (1 - successRate) * action.weights.riskFactor;

        // 성격 적합도 (성격에 맞는 행동일수록 높음)
        const personalityFit = this.calculatePersonalityFit(character, action);

        // 감정 적합도 (현재 감정 상태에 맞는 행동)
        const emotionalFit = this.calculateEmotionalFit(character, action);

        // 최종 효용 = 가중 합
        const utility =
            selfBenefit * action.weights.selfBenefit +
            targetBenefit * action.weights.targetBenefit -
            risk +
            personalityFit * 0.3 +
            emotionalFit * 0.2;

        return {
            action,
            utility,
            breakdown: {
                selfBenefit,
                targetBenefit,
                risk,
                personalityFit,
                emotionalFit,
            },
        };
    }

    /**
     * 여러 행동 중 최적 행동 선택
     */
    selectAction(
        character: Character,
        actions: Action[],
        targetId?: EntityId
    ): { action: Action; result: UtilityResult } | null {
        if (actions.length === 0) return null;

        const results = actions.map(action =>
            this.calculateUtility(character, action, targetId)
        );

        // 유효한 행동만 필터링
        const validResults = results.filter(r => r.utility > -Infinity);
        if (validResults.length === 0) return null;

        // 최대 효용 행동 선택 (약간의 무작위성 추가)
        validResults.sort((a, b) => b.utility - a.utility);

        // 상위 3개 중 확률적 선택 (결정론적이지 않게)
        const topN = validResults.slice(0, Math.min(3, validResults.length));
        const weights = topN.map(r => Math.max(0.1, sigmoid(r.utility)));
        const totalWeight = weights.reduce((a, b) => a + b, 0);

        let random = Math.random() * totalWeight;
        for (let i = 0; i < topN.length; i++) {
            random -= weights[i];
            if (random <= 0) {
                return { action: topN[i].action, result: topN[i] };
            }
        }

        return { action: topN[0].action, result: topN[0] };
    }

    /**
     * 조건 체크
     */
    private checkConditions(
        character: Character,
        conditions: Condition[],
        targetId?: EntityId
    ): boolean {
        for (const condition of conditions) {
            if (!this.checkCondition(character, condition, targetId)) {
                return false;
            }
        }
        return true;
    }

    private checkCondition(
        character: Character,
        condition: Condition,
        targetId?: EntityId
    ): boolean {
        let value: number | string | boolean;

        switch (condition.type) {
            case 'stat':
                value = this.getStatValue(character, condition.field!);
                break;
            case 'relation':
                if (!targetId) return false;
                value = this.getRelationValue(character.id, targetId, condition.field!);
                break;
            case 'resource':
                value = character.resources;
                break;
            case 'location':
                value = character.location;
                break;
            default:
                return true;
        }

        return this.compareValues(value, condition.operator, condition.value);
    }

    private getStatValue(character: Character, field: string): number {
        if (field in character.personality) {
            return character.personality[field as keyof typeof character.personality];
        }
        if (field in character.emotion) {
            return character.emotion[field as keyof typeof character.emotion];
        }
        if (field === 'power') return character.power;
        if (field === 'resources') return character.resources;
        return 0;
    }

    private getRelationValue(fromId: EntityId, toId: EntityId, field: string): number {
        const relation = this.world.relations.getRelation(fromId, toId);
        if (field in relation) {
            return relation[field as keyof typeof relation] as number;
        }
        return 0;
    }

    private compareValues(
        a: number | string | boolean,
        op: string,
        b: number | string | boolean
    ): boolean {
        switch (op) {
            case '>': return (a as number) > (b as number);
            case '<': return (a as number) < (b as number);
            case '>=': return (a as number) >= (b as number);
            case '<=': return (a as number) <= (b as number);
            case '==': return a === b;
            case '!=': return a !== b;
            default: return false;
        }
    }

    /**
     * 자기 이익 계산
     */
    private calculateSelfBenefit(character: Character, effects: Effect[]): number {
        let benefit = 0;

        for (const effect of effects) {
            if (effect.target === character.id || effect.target === 'self') {
                switch (effect.type) {
                    case 'resource':
                        benefit += (effect.change as number) * 0.01;
                        break;
                    case 'stat':
                        if (effect.field === 'power') {
                            benefit += (effect.change as number) * 0.1;
                        }
                        break;
                    case 'emotion':
                        if (effect.field === 'joy') benefit += (effect.change as number);
                        if (effect.field === 'fear') benefit -= (effect.change as number);
                        break;
                }
            }
        }

        return benefit;
    }

    /**
     * 타겟 이익 계산 (협력/적대 판단용)
     */
    private calculateTargetBenefit(
        character: Character,
        targetId: EntityId,
        effects: Effect[]
    ): number {
        const relation = this.world.relations.getRelation(character.id, targetId);
        let targetBenefit = 0;

        for (const effect of effects) {
            if (effect.target === targetId || effect.target === 'target') {
                switch (effect.type) {
                    case 'resource':
                        targetBenefit += (effect.change as number) * 0.01;
                        break;
                    case 'emotion':
                        if (effect.field === 'fear') targetBenefit -= (effect.change as number);
                        break;
                }
            }
        }

        // 관계에 따라 타겟 이익의 가치가 달라짐
        // 친구에게 이득 = 내 이득, 적에게 이득 = 내 손해
        return targetBenefit * relation.trust;
    }

    /**
     * 성공 확률 계산
     */
    private calculateSuccessRate(
        character: Character,
        action: Action,
        targetId?: EntityId
    ): number {
        let rate = action.baseSuccessRate;

        // 관련 스탯에 따른 보정
        switch (action.category) {
            case 'dialogue':
                rate *= (0.5 + character.personality.cunning * 0.5);
                break;
            case 'combat':
                rate *= (0.5 + character.personality.courage * 0.5);
                break;
            case 'social':
                if (targetId) {
                    const relation = this.world.relations.getRelation(character.id, targetId);
                    rate *= (0.5 + (relation.trust + 1) * 0.25);
                }
                break;
        }

        return clamp(rate, 0, 1);
    }

    /**
     * 성격 적합도 계산
     */
    private calculatePersonalityFit(character: Character, action: Action): number {
        const p = character.personality;
        let fit = 0;

        switch (action.category) {
            case 'combat':
                fit = p.courage * 0.5 + p.ambition * 0.3 - p.morality * 0.2;
                break;
            case 'dialogue':
                fit = p.cunning * 0.4 + p.loyalty * 0.3;
                break;
            case 'social':
                fit = p.loyalty * 0.4 + p.morality * 0.3;
                break;
            case 'economic':
                fit = p.ambition * 0.5 + p.cunning * 0.3;
                break;
        }

        return fit;
    }

    /**
     * 감정 적합도 계산
     */
    private calculateEmotionalFit(character: Character, action: Action): number {
        const e = character.emotion;
        let fit = 0;

        // 분노 상태 → 공격적 행동 선호
        if (action.category === 'combat') {
            fit += e.anger * 0.5;
        }

        // 공포 상태 → 회피 행동 선호
        if (e.fear > 0.5 && action.category !== 'combat') {
            fit += 0.3;
        }

        // 신뢰 높음 → 협력 행동 선호
        if (action.category === 'social' || action.category === 'dialogue') {
            fit += e.trust * 0.3;
        }

        return fit;
    }
}

/**
 * 미리 정의된 행동 목록
 */
export const BaseActions: Action[] = [
    {
        id: 'talk_friendly',
        name: '우호적 대화',
        category: 'dialogue',
        conditions: [],
        effects: [
            { type: 'relation', target: 'self:target', field: 'trust', change: 0.05, isRelative: true },
        ],
        baseSuccessRate: 0.9,
        weights: { selfBenefit: 0.3, targetBenefit: 0.5, riskFactor: 0.1 },
    },
    {
        id: 'threaten',
        name: '위협',
        category: 'dialogue',
        conditions: [{ type: 'stat', field: 'power', operator: '>=', value: 5 }],
        effects: [
            { type: 'relation', target: 'self:target', field: 'fear', change: 0.2, isRelative: true },
            { type: 'relation', target: 'self:target', field: 'trust', change: -0.1, isRelative: true },
        ],
        baseSuccessRate: 0.7,
        weights: { selfBenefit: 0.7, targetBenefit: -0.5, riskFactor: 0.5 },
    },
    {
        id: 'trade',
        name: '거래',
        category: 'economic',
        conditions: [{ type: 'resource', operator: '>=', value: 10 }],
        effects: [
            { type: 'resource', target: 'self', field: 'resources', change: -10, isRelative: true },
            { type: 'relation', target: 'self:target', field: 'trust', change: 0.03, isRelative: true },
        ],
        baseSuccessRate: 0.95,
        weights: { selfBenefit: 0.4, targetBenefit: 0.4, riskFactor: 0.2 },
    },
    {
        id: 'attack',
        name: '공격',
        category: 'combat',
        conditions: [],
        effects: [
            { type: 'relation', target: 'self:target', field: 'trust', change: -0.5, isRelative: true },
            { type: 'relation', target: 'self:target', field: 'fear', change: 0.3, isRelative: true },
        ],
        baseSuccessRate: 0.6,
        weights: { selfBenefit: 0.8, targetBenefit: -1.0, riskFactor: 0.8 },
    },
    {
        id: 'help',
        name: '도움 제공',
        category: 'social',
        conditions: [{ type: 'resource', operator: '>=', value: 20 }],
        effects: [
            { type: 'resource', target: 'self', field: 'resources', change: -20, isRelative: true },
            { type: 'relation', target: 'self:target', field: 'trust', change: 0.15, isRelative: true },
            { type: 'relation', target: 'self:target', field: 'debt', change: 20, isRelative: true },
        ],
        baseSuccessRate: 1.0,
        weights: { selfBenefit: 0.2, targetBenefit: 0.8, riskFactor: 0.1 },
    },
    {
        id: 'betray',
        name: '배신',
        category: 'social',
        conditions: [{ type: 'relation', field: 'trust', operator: '>', value: 0 }],
        effects: [
            { type: 'resource', target: 'self', field: 'resources', change: 50, isRelative: true },
            { type: 'relation', target: 'self:target', field: 'trust', change: -0.8, isRelative: true },
        ],
        baseSuccessRate: 0.5,
        weights: { selfBenefit: 1.0, targetBenefit: -1.0, riskFactor: 1.0 },
    },
];

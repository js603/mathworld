/**
 * 동적 선택지 생성기
 * 
 * 핵심: 선택지는 미리 작성된 것이 아니라 현재 상태에서 계산되어 생성
 * - 의도 유도 원칙 5: 선택지를 없애지 말고 변질시켜라
 */

import {
    EntityId,
    Character,
    Action,
    Choice,
} from './types';
import { WorldState } from './WorldState';
import { UtilityAI, BaseActions } from './UtilityAI';
import { generateId } from '../utils';

/**
 * 선택지 맥락 유형
 */
type ContextType =
    | 'respectful'      // 존중
    | 'suspicious'      // 의심 섞인
    | 'fearful'         // 두려움 섞인
    | 'confident'       // 자신감 있는
    | 'desperate'       // 절박한
    | 'neutral';        // 중립

/**
 * 동적 선택지 생성기
 */
export class ChoiceGenerator {
    private world: WorldState;
    private utilityAI: UtilityAI;
    private actionPool: Action[];

    constructor(world: WorldState, customActions?: Action[]) {
        this.world = world;
        this.utilityAI = new UtilityAI(world);
        this.actionPool = [...BaseActions, ...(customActions || [])];
    }

    /**
     * 현재 상태에서 가능한 선택지 생성
     */
    generateChoices(
        player: Character,
        targetId?: EntityId,
        maxChoices: number = 4
    ): Choice[] {
        // 가능한 모든 행동에 대해 효용 계산
        const results = this.actionPool
            .map(action => ({
                action,
                result: this.utilityAI.calculateUtility(player, action, targetId),
            }))
            .filter(r => r.result.utility > -Infinity);

        // 효용순 정렬
        results.sort((a, b) => b.result.utility - a.result.utility);

        // 다양성 확보: 카테고리별로 최소 1개씩 포함하려 시도
        const choices: Choice[] = [];
        const usedCategories = new Set<string>();

        // 상위 효용 행동 먼저
        for (const r of results) {
            if (choices.length >= maxChoices) break;

            const category = r.action.category;
            if (!usedCategories.has(category) || choices.length < maxChoices / 2) {
                const context = this.determineContext(player, targetId, r.action);
                choices.push(this.createChoice(r.action, context, r.result.utility));
                usedCategories.add(category);
            }
        }

        // 맥락화 적용 (의도 유도 원칙)
        return choices.map(c => this.contextualizeChoice(c, player, targetId));
    }

    /**
     * 단일 선택지 생성
     */
    private createChoice(action: Action, context: ContextType, utility: number): Choice {
        return {
            id: generateId('choice'),
            text: this.generateChoiceText(action, context),
            action,
            context: this.getContextDescription(context),
            calculatedUtility: utility,
        };
    }

    /**
     * 선택지 텍스트 생성 (템플릿 기반)
     */
    private generateChoiceText(action: Action, context: ContextType): string {
        const contextPrefix = this.getContextPrefix(context);

        // 기본 텍스트에 맥락 추가
        switch (action.id) {
            case 'talk_friendly':
                return `${contextPrefix}친근하게 대화한다`;
            case 'threaten':
                return `${contextPrefix}위협한다`;
            case 'trade':
                return `${contextPrefix}거래를 제안한다`;
            case 'attack':
                return `${contextPrefix}공격한다`;
            case 'help':
                return `${contextPrefix}도움을 제공한다`;
            case 'betray':
                return `${contextPrefix}배신한다`;
            default:
                return `${contextPrefix}${action.name}`;
        }
    }

    private getContextPrefix(context: ContextType): string {
        switch (context) {
            case 'respectful': return '[정중하게] ';
            case 'suspicious': return '[경계하며] ';
            case 'fearful': return '[두려움을 느끼며] ';
            case 'confident': return '[자신감 있게] ';
            case 'desperate': return '[절박하게] ';
            default: return '';
        }
    }

    private getContextDescription(context: ContextType): string {
        switch (context) {
            case 'respectful': return '상대가 당신을 존중하고 있다';
            case 'suspicious': return '상대가 당신을 의심하고 있다';
            case 'fearful': return '상대가 당신을 두려워하고 있다';
            case 'confident': return '당신이 우위에 있다';
            case 'desperate': return '상황이 불리하다';
            default: return '평범한 상황이다';
        }
    }

    /**
     * 맥락 결정 (플레이어-타겟 관계 기반)
     */
    private determineContext(
        player: Character,
        targetId?: EntityId,
        action?: Action
    ): ContextType {
        if (!targetId) return 'neutral';

        const relation = this.world.relations.getRelation(targetId, player.id);
        const reverseRelation = this.world.relations.getRelation(player.id, targetId);
        const target = this.world.getCharacter(targetId);

        // 상대방의 나에 대한 관계 기반
        if (relation.fear > 0.5) return 'fearful';
        if (relation.trust < -0.3) return 'suspicious';
        if (relation.respect > 0.5) return 'respectful';

        // 상대적 파워 기반
        if (target && player.power > target.power * 1.5) return 'confident';
        if (target && player.power < target.power * 0.5) return 'desperate';

        return 'neutral';
    }

    /**
     * 선택지 맥락화 (의도 유도 원칙 5)
     * 같은 행동이라도 과거 경험에 따라 다른 의미를 가짐
     */
    private contextualizeChoice(
        choice: Choice,
        player: Character,
        targetId?: EntityId
    ): Choice {
        if (!targetId) return choice;

        const relation = this.world.relations.getRelation(player.id, targetId);
        const target = this.world.getCharacter(targetId);
        if (!target) return choice;

        // 과거 상호작용에 따른 맥락 변화
        const historyCount = relation.history.length;

        // 이전에 배신당한 적이 있으면 신뢰 행동의 맥락이 변함
        if (choice.action.id === 'talk_friendly' && relation.trust < 0) {
            return {
                ...choice,
                context: '과거의 상처가 남아있다. 그래도 대화를 시도할 것인가?',
                text: '[조심스럽게] 대화를 시도한다',
            };
        }

        // 빚이 있으면 도움 제공의 의미가 다름
        if (choice.action.id === 'help' && relation.debt < 0) {
            return {
                ...choice,
                context: '당신은 이 사람에게 빚이 있다',
                text: '[빚을 갚기 위해] 도움을 제공한다',
            };
        }

        // 비밀을 공유한 사이라면
        if (relation.secretShared && choice.action.category === 'dialogue') {
            return {
                ...choice,
                context: '당신들은 비밀을 공유하고 있다',
            };
        }

        return choice;
    }

    /**
     * 특정 상황에 맞는 특별 선택지 생성
     */
    generateSpecialChoices(
        player: Character,
        situation: 'combat' | 'negotiation' | 'discovery' | 'crisis'
    ): Choice[] {
        const specialActions: Action[] = [];

        switch (situation) {
            case 'combat':
                specialActions.push({
                    id: 'flee',
                    name: '도주',
                    category: 'combat',
                    conditions: [],
                    effects: [],
                    baseSuccessRate: 0.7,
                    weights: { selfBenefit: 0.5, targetBenefit: 0, riskFactor: 0.3 },
                });
                specialActions.push({
                    id: 'surrender',
                    name: '항복',
                    category: 'combat',
                    conditions: [],
                    effects: [
                        { type: 'relation', target: 'self:target', field: 'fear', change: 0.3, isRelative: true },
                    ],
                    baseSuccessRate: 1.0,
                    weights: { selfBenefit: -0.5, targetBenefit: 0.5, riskFactor: 0 },
                });
                break;

            case 'negotiation':
                specialActions.push({
                    id: 'bluff',
                    name: '허세',
                    category: 'dialogue',
                    conditions: [],
                    effects: [],
                    baseSuccessRate: 0.4,
                    weights: { selfBenefit: 0.6, targetBenefit: -0.2, riskFactor: 0.6 },
                });
                specialActions.push({
                    id: 'compromise',
                    name: '타협',
                    category: 'social',
                    conditions: [],
                    effects: [
                        { type: 'relation', target: 'self:target', field: 'trust', change: 0.1, isRelative: true },
                    ],
                    baseSuccessRate: 0.8,
                    weights: { selfBenefit: 0.3, targetBenefit: 0.3, riskFactor: 0.1 },
                });
                break;

            case 'crisis':
                specialActions.push({
                    id: 'sacrifice',
                    name: '희생',
                    category: 'social',
                    conditions: [],
                    effects: [
                        { type: 'resource', target: 'self', field: 'resources', change: -50, isRelative: true },
                    ],
                    baseSuccessRate: 1.0,
                    weights: { selfBenefit: -1.0, targetBenefit: 1.0, riskFactor: 0 },
                });
                break;
        }

        return specialActions.map(action => ({
            id: generateId('choice'),
            text: action.name,
            action,
            context: situation,
        }));
    }

    /**
     * 침묵 선택지 (항상 가능)
     */
    getSilenceChoice(): Choice {
        return {
            id: generateId('choice'),
            text: '[침묵을 지킨다]',
            action: {
                id: 'silence',
                name: '침묵',
                category: 'dialogue',
                conditions: [],
                effects: [],
                baseSuccessRate: 1.0,
                weights: { selfBenefit: 0, targetBenefit: 0, riskFactor: 0 },
            },
            context: '아무 말도 하지 않는다',
        };
    }

    /**
     * 관찰 선택지 (정보 수집)
     */
    getObserveChoice(): Choice {
        return {
            id: generateId('choice'),
            text: '[상황을 관찰한다]',
            action: {
                id: 'observe',
                name: '관찰',
                category: 'dialogue',
                conditions: [],
                effects: [],
                baseSuccessRate: 1.0,
                weights: { selfBenefit: 0.1, targetBenefit: 0, riskFactor: 0 },
            },
            context: '주변을 살피며 정보를 수집한다',
        };
    }
}

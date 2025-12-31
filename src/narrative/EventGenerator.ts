/**
 * 사건 자동 생성기
 * 
 * 핵심: 세계는 항상 "불안정"하게 유지
 * - 권력 격차 ↑ → 반발 확률 ↑
 * - 정보 비대칭 ↑ → 음모 확률 ↑
 * - 공포 ↑ → 극단 행동 확률 ↑
 */

import {
    EntityId,
    GameEvent,
    InstabilityType,
    Character,
} from '../core/types';
import { WorldState } from '../core/WorldState';
import { generateId, rollSuccess, randomChoice, clamp } from '../utils';

/**
 * 사건 트리거 정의
 */
interface EventTrigger {
    id: string;
    name: string;
    condition: (world: WorldState) => boolean;
    baseProbability: number;
    probabilityModifiers: Array<(world: WorldState) => number>;
    generateEvent: (world: WorldState) => GameEvent;
}

/**
 * 사건 생성기 클래스
 */
export class EventGenerator {
    private world: WorldState;
    private triggers: EventTrigger[] = [];
    private recentEvents: Set<string> = new Set(); // 중복 방지

    constructor(world: WorldState) {
        this.world = world;
        this.initializeTriggers();
    }

    /**
     * 기본 사건 트리거 초기화
     */
    private initializeTriggers(): void {
        // 1. 권력 도전 사건
        this.triggers.push({
            id: 'power_challenge',
            name: '권력 도전',
            condition: (world) => {
                const influential = world.relations.getMostInfluential(2);
                if (influential.length < 2) return false;
                const leader = world.getCharacter(influential[0]);
                const challenger = world.getCharacter(influential[1]);
                if (!leader || !challenger) return false;
                // 2위가 1위의 70% 이상 권력을 가지면 도전 가능
                return challenger.power >= leader.power * 0.7;
            },
            baseProbability: 0.1,
            probabilityModifiers: [
                (world) => {
                    const influential = world.relations.getMostInfluential(2);
                    if (influential.length < 2) return 0;
                    const challenger = world.getCharacter(influential[1]);
                    return challenger ? challenger.personality.ambition * 0.2 : 0;
                },
            ],
            generateEvent: (world) => {
                const influential = world.relations.getMostInfluential(2);
                const challenger = world.getCharacter(influential[1]);
                return {
                    id: generateId('event'),
                    type: 'custom',
                    timestamp: world.time,
                    participants: influential,
                    location: 'capital',
                    description: `${challenger?.name || '누군가'}가 권력에 도전장을 던졌다`,
                    effects: [],
                    isPublic: true,
                    witnesses: [],
                };
            },
        });

        // 2. 배신 사건
        this.triggers.push({
            id: 'betrayal_plot',
            name: '배신 음모',
            condition: (world) => {
                const characters = world.getAllCharacters();
                return characters.some(c =>
                    c.personality.ambition > 0.7 &&
                    c.personality.loyalty < 0.3 &&
                    c.power > 20
                );
            },
            baseProbability: 0.05,
            probabilityModifiers: [
                (world) => {
                    const stats = world.relations.getStats();
                    return stats.avgTrust < 0 ? 0.1 : 0;
                },
            ],
            generateEvent: (world) => {
                const characters = world.getAllCharacters();
                const betrayer = characters.find(c =>
                    c.personality.ambition > 0.7 && c.personality.loyalty < 0.3
                );
                return {
                    id: generateId('event'),
                    type: 'betrayal',
                    timestamp: world.time,
                    participants: betrayer ? [betrayer.id] : [],
                    location: betrayer?.location || 'unknown',
                    description: `어둠 속에서 음모가 꿈틀거린다`,
                    effects: [],
                    isPublic: false,
                    witnesses: [],
                };
            },
        });

        // 3. 동맹 형성
        this.triggers.push({
            id: 'alliance_formation',
            name: '동맹 형성',
            condition: (world) => {
                const clusters = world.relations.getClusters(0.4);
                return clusters.some((c: EntityId[]) => c.length >= 2);
            },
            baseProbability: 0.15,
            probabilityModifiers: [],
            generateEvent: (world) => {
                const clusters = world.relations.getClusters(0.4);
                const largestCluster = clusters.sort((a: EntityId[], b: EntityId[]) => b.length - a.length)[0];
                return {
                    id: generateId('event'),
                    type: 'alliance',
                    timestamp: world.time,
                    participants: largestCluster || [],
                    location: 'capital',
                    description: '새로운 동맹이 결성되었다는 소문이 퍼진다',
                    effects: [],
                    isPublic: true,
                    witnesses: [],
                };
            },
        });

        // 4. 경제 위기
        this.triggers.push({
            id: 'economic_crisis',
            name: '경제 위기',
            condition: (world) => world.globalState.economyIndex < 0.7,
            baseProbability: 0.2,
            probabilityModifiers: [
                (world) => (1 - world.globalState.economyIndex) * 0.3,
            ],
            generateEvent: (world) => ({
                id: generateId('event'),
                type: 'custom',
                timestamp: world.time,
                participants: [],
                location: 'global',
                description: '시장이 흔들리고 있다. 물가가 불안정하다.',
                effects: [],
                isPublic: true,
                witnesses: [],
            }),
        });

        // 5. 소문/스캔들
        this.triggers.push({
            id: 'scandal',
            name: '스캔들',
            condition: (world) => {
                const characters = world.getAllCharacters();
                return characters.some(c =>
                    c.power > 30 && world.relations.getEnemies(c.id).length > 0
                );
            },
            baseProbability: 0.08,
            probabilityModifiers: [],
            generateEvent: (world) => {
                const characters = world.getAllCharacters();
                const target = characters.find(c =>
                    c.power > 30 && world.relations.getEnemies(c.id).length > 0
                );
                return {
                    id: generateId('event'),
                    type: 'custom',
                    timestamp: world.time,
                    participants: target ? [target.id] : [],
                    location: 'capital',
                    description: `누군가의 비밀이 새어나가고 있다`,
                    effects: [],
                    isPublic: true,
                    witnesses: [],
                };
            },
        });
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

        // 자원 부족
        const characters = this.world.getAllCharacters();
        const avgResources = characters.reduce((sum, c) => sum + c.resources, 0) / characters.length;
        if (avgResources < 50) {
            instabilities.push('resource_scarcity');
        }

        // 신뢰 붕괴
        if (stats.avgTrust < -0.2) {
            instabilities.push('trust_collapse');
        }

        // 정보 비대칭 (비밀 공유 관계가 적음)
        // 간략화: 파벌이 많으면 정보 비대칭
        const clusters = this.world.relations.getClusters(0.3);
        if (clusters.length > 2) {
            instabilities.push('information_asymmetry');
        }

        // 공포 급등
        if (stats.avgFear > 0.5) {
            instabilities.push('fear_spike');
        }

        return instabilities;
    }

    /**
     * 사건 생성 (매 턴 호출)
     */
    generateEvents(): GameEvent[] {
        const events: GameEvent[] = [];
        const instabilities = this.detectInstability();

        for (const trigger of this.triggers) {
            // 조건 체크
            if (!trigger.condition(this.world)) continue;

            // 중복 방지 (최근에 같은 사건이 발생했으면 스킵)
            if (this.recentEvents.has(trigger.id)) continue;

            // 확률 계산
            let probability = trigger.baseProbability;
            for (const modifier of trigger.probabilityModifiers) {
                probability += modifier(this.world);
            }
            probability = clamp(probability, 0, 0.8);

            // 불안정 상태에 따른 확률 증가
            if (instabilities.length > 0) {
                probability *= 1 + instabilities.length * 0.1;
            }

            // 확률 체크
            if (rollSuccess(probability)) {
                const event = trigger.generateEvent(this.world);
                events.push(event);
                this.world.addEvent(event);

                // 최근 사건에 추가 (같은 사건 연속 방지)
                this.recentEvents.add(trigger.id);
                setTimeout(() => this.recentEvents.delete(trigger.id), 0); // 다음 턴에 초기화
            }
        }

        return events;
    }

    /**
     * 특정 조건에 따른 강제 사건 생성
     */
    forceEvent(eventType: GameEvent['type'], participants: EntityId[]): GameEvent {
        const event: GameEvent = {
            id: generateId('event'),
            type: eventType,
            timestamp: this.world.time,
            participants,
            location: 'capital',
            description: this.getEventDescription(eventType),
            effects: [],
            isPublic: true,
            witnesses: [],
        };

        this.world.addEvent(event);
        return event;
    }

    private getEventDescription(type: GameEvent['type']): string {
        switch (type) {
            case 'war_declared': return '전쟁의 북소리가 울려 퍼진다';
            case 'plague': return '역병의 그림자가 드리운다';
            case 'natural_disaster': return '자연이 분노했다';
            case 'betrayal': return '누군가의 칼이 등을 향했다';
            case 'alliance': return '손이 맞잡혔다';
            case 'death': return '한 생이 저물었다';
            default: return '무언가가 변했다';
        }
    }

    /**
     * NPC 자발적 행동 생성
     * (플레이어가 아무것도 안 해도 세계가 움직임)
     */
    generateNPCActions(): void {
        const characters = this.world.getAllCharacters().filter(c => !c.isPlayer);

        for (const npc of characters) {
            // 10% 확률로 자발적 행동
            if (!rollSuccess(0.1)) continue;

            // 성격에 따른 행동 결정
            if (npc.personality.ambition > 0.7) {
                // 야망이 높으면 권력 추구
                npc.power += 1;
            }

            if (npc.personality.cunning > 0.7 && rollSuccess(0.3)) {
                // 교활하면 정보 수집 (관계 형성)
                const others = characters.filter(c => c.id !== npc.id);
                const target = randomChoice(others);
                if (target) {
                    this.world.relations.modifyRelation(npc.id, target.id, { trust: 0.05 });
                }
            }
        }
    }

    /**
     * 최근 사건 목록 초기화 (새 턴)
     */
    clearRecentEvents(): void {
        this.recentEvents.clear();
    }
}

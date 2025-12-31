/**
 * 믿음/해석 시스템
 * 
 * 핵심: "사람은 사실이 아니라 믿음으로 행동한다"
 * - 각 인물은 불완전한 정보로 세계를 해석
 * - 과거가 현재를 계속 바꿈 (기억의 재구성)
 */

import {
    EntityId,
    Character,
    GameEvent,
    InterpretedEvent,
} from '../core/types';
import { WorldState } from '../core/WorldState';
import { CharacterUtils } from '../core/Character';
import { clamp } from '../utils';

/**
 * 해석 편향 유형
 */
type InterpretationBias =
    | 'positive'    // 긍정적 해석
    | 'negative'    // 부정적 해석
    | 'suspicious'  // 의심
    | 'fearful'     // 공포 기반
    | 'neutral';    // 중립

/**
 * 믿음 시스템 클래스
 */
export class BeliefSystem {
    private world: WorldState;

    constructor(world: WorldState) {
        this.world = world;
    }

    /**
     * 사건을 인물의 관점에서 해석
     */
    interpretEvent(
        character: Character,
        event: GameEvent,
        isDirectWitness: boolean
    ): InterpretedEvent {
        const bias = this.determineBias(character, event);
        const interpretation = this.generateInterpretation(event, bias, isDirectWitness);
        const emotionalImpact = this.calculateEmotionalImpact(character, event, bias);

        return {
            eventId: event.id,
            interpretation,
            emotionalImpact,
            timestamp: this.world.time,
        };
    }

    /**
     * 해석 편향 결정
     */
    private determineBias(character: Character, event: GameEvent): InterpretationBias {
        // 참여자와의 관계 확인
        const participantRelations = event.participants.map(pId => ({
            id: pId,
            relation: this.world.relations.getRelation(character.id, pId),
        }));

        // 평균 신뢰도
        const avgTrust = participantRelations.reduce((sum, r) => sum + r.relation.trust, 0)
            / Math.max(1, participantRelations.length);

        // 감정 상태에 따른 편향
        if (character.emotion.fear > 0.5) return 'fearful';
        if (character.emotion.anger > 0.5) return 'negative';
        if (avgTrust < -0.3) return 'suspicious';
        if (avgTrust > 0.3) return 'positive';

        return 'neutral';
    }

    /**
     * 해석 텍스트 생성
     */
    private generateInterpretation(
        event: GameEvent,
        bias: InterpretationBias,
        isDirect: boolean
    ): string {
        const sourcePrefix = isDirect ? '' : '소문에 의하면, ';
        let interpretation = event.description;

        switch (bias) {
            case 'positive':
                interpretation = `${sourcePrefix}${event.description} (좋은 의도였을 것이다)`;
                break;
            case 'negative':
                interpretation = `${sourcePrefix}${event.description} (분명 불순한 의도가 있다)`;
                break;
            case 'suspicious':
                interpretation = `${sourcePrefix}${event.description} (무언가 숨기고 있다)`;
                break;
            case 'fearful':
                interpretation = `${sourcePrefix}${event.description} (위험한 일이 벌어지고 있다)`;
                break;
            default:
                interpretation = `${sourcePrefix}${event.description}`;
        }

        return interpretation;
    }

    /**
     * 감정적 영향 계산
     */
    private calculateEmotionalImpact(
        character: Character,
        event: GameEvent,
        bias: InterpretationBias
    ): Partial<Character['emotion']> {
        const impact: Partial<Character['emotion']> = {};

        switch (event.type) {
            case 'betrayal':
                impact.trust = -0.2;
                impact.anger = bias === 'negative' ? 0.3 : 0.1;
                break;
            case 'combat':
                impact.fear = character.personality.courage < 0.5 ? 0.2 : 0;
                break;
            case 'alliance':
                impact.joy = bias === 'positive' ? 0.1 : 0;
                impact.fear = bias === 'fearful' ? 0.1 : -0.05;
                break;
            case 'death':
                impact.fear = 0.15;
                impact.despair = 0.1;
                break;
            case 'plague':
            case 'natural_disaster':
                impact.fear = 0.3;
                break;
            case 'war_declared':
                impact.fear = character.personality.courage < 0.5 ? 0.4 : 0.1;
                break;
        }

        // 공포 기반 해석이면 공포 증가
        if (bias === 'fearful') {
            impact.fear = (impact.fear || 0) + 0.1;
        }

        return impact;
    }

    /**
     * 믿음 업데이트 (베이지안 스타일)
     * P(H|E) ∝ P(E|H) × P(H)
     */
    updateBelief(
        character: Character,
        subject: EntityId,
        trait: string,
        evidence: number,
        strength: number = 0.1
    ): void {
        CharacterUtils.updateBelief(
            character,
            CharacterUtils.beliefKey(subject, trait),
            evidence,
            strength
        );
    }

    /**
     * 특정 대상에 대한 믿음 조회
     */
    getBelief(character: Character, subject: EntityId, trait: string): number {
        const key = CharacterUtils.beliefKey(subject, trait);
        return character.beliefs.get(key) ?? 0.5;
    }

    /**
     * 기억 재구성
     * 새로운 정보에 따라 과거 기억의 해석이 변할 수 있음
     */
    reconstructMemory(character: Character, newEvidence: string): void {
        // 관련된 기억 찾기 (간략화: 최근 기억만)
        const recentMemories = character.memory.slice(-10);

        for (const memory of recentMemories) {
            // 새 증거에 따른 재해석
            if (memory.interpretation.includes('좋은 의도')) {
                // 부정적 증거가 나오면 재해석
                if (newEvidence.includes('배신') || newEvidence.includes('거짓')) {
                    memory.interpretation = memory.interpretation.replace(
                        '(좋은 의도였을 것이다)',
                        '(속았던 것이다!)'
                    );
                    memory.emotionalImpact.anger = (memory.emotionalImpact.anger || 0) + 0.2;
                }
            }
        }
    }

    /**
     * 인물이 특정 대상을 어떻게 인식하는지 요약
     */
    getPerception(character: Character, targetId: EntityId): string {
        const relation = this.world.relations.getRelation(character.id, targetId);
        const target = this.world.getCharacter(targetId);
        if (!target) return '알 수 없음';

        const beliefs: string[] = [];

        // 신뢰 기반 인식
        if (relation.trust > 0.5) {
            beliefs.push('믿을 수 있는 사람');
        } else if (relation.trust < -0.3) {
            beliefs.push('신뢰할 수 없는 자');
        }

        // 공포 기반 인식
        if (relation.fear > 0.5) {
            beliefs.push('두려운 존재');
        }

        // 존경 기반 인식
        if (relation.respect > 0.5) {
            beliefs.push('존경할 만한 인물');
        } else if (relation.respect < -0.3) {
            beliefs.push('경멸스러운 자');
        }

        // 특정 믿음 확인
        const honestBelief = this.getBelief(character, targetId, 'honest');
        if (honestBelief > 0.7) {
            beliefs.push('정직한 사람');
        } else if (honestBelief < 0.3) {
            beliefs.push('거짓말쟁이');
        }

        const dangerousBelief = this.getBelief(character, targetId, 'dangerous');
        if (dangerousBelief > 0.7) {
            beliefs.push('위험한 인물');
        }

        if (beliefs.length === 0) {
            return '특별한 인상 없음';
        }

        return beliefs.join(', ');
    }

    /**
     * 인물 간 정보 공유
     * 누가 누구에게 무엇을 말했는지에 따라 믿음 전파
     */
    shareInformation(
        speaker: Character,
        listener: Character,
        about: EntityId,
        claim: 'trustworthy' | 'dangerous' | 'liar' | 'ally'
    ): void {
        // 화자에 대한 청자의 신뢰도가 영향
        const speakerRelation = this.world.relations.getRelation(listener.id, speaker.id);
        const credibility = (speakerRelation.trust + 1) / 2; // 0~1로 변환

        // 주장에 따른 증거 값
        let evidence = 0;
        let trait = '';
        switch (claim) {
            case 'trustworthy':
                trait = 'trustworthy';
                evidence = 0.5;
                break;
            case 'dangerous':
                trait = 'dangerous';
                evidence = 0.5;
                break;
            case 'liar':
                trait = 'honest';
                evidence = -0.5;
                break;
            case 'ally':
                trait = 'ally';
                evidence = 0.5;
                break;
        }

        // 화자 신뢰도에 따라 증거 강도 조절
        this.updateBelief(listener, about, trait, evidence, credibility * 0.15);
    }
}

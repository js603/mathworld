/**
 * 인물 모델 및 팩토리
 * 
 * 핵심: 인물은 "숫자로 된 인간" - 속성 벡터로 표현
 * - 성격: 거의 변하지 않음
 * - 감정: 사건에 따라 변화
 */

import {
    EntityId,
    Character,
    Personality,
    Emotion,
    InterpretedEvent,
} from './types';
import { generateId } from '../utils';

/**
 * 인물 생성 옵션
 */
export interface CharacterCreateOptions {
    name: string;
    title?: string;
    location: EntityId;
    personality?: Partial<Personality>;
    emotion?: Partial<Emotion>;
    resources?: number;
    power?: number;
    isPlayer?: boolean;
}

/**
 * 기본 성격 (중립)
 */
const DEFAULT_PERSONALITY: Personality = {
    ambition: 0.5,
    loyalty: 0.5,
    morality: 0.5,
    courage: 0.5,
    cunning: 0.5,
};

/**
 * 기본 감정 (중립)
 */
const DEFAULT_EMOTION: Emotion = {
    trust: 0.5,
    fear: 0,
    anger: 0,
    joy: 0.3,
    despair: 0,
};

/**
 * 인물 생성 팩토리
 */
export function createCharacter(options: CharacterCreateOptions): Character {
    return {
        id: generateId('char'),
        name: options.name,
        title: options.title,

        personality: { ...DEFAULT_PERSONALITY, ...options.personality },
        emotion: { ...DEFAULT_EMOTION, ...options.emotion },

        location: options.location,
        resources: options.resources ?? 100,
        power: options.power ?? 10,

        memory: [],
        beliefs: new Map(),

        isPlayer: options.isPlayer ?? false,
    };
}

/**
 * 인물 관련 유틸리티 함수들
 */
export const CharacterUtils = {
    /**
     * 감정 업데이트 (클램프 포함)
     */
    updateEmotion(character: Character, delta: Partial<Emotion>): void {
        for (const [key, value] of Object.entries(delta)) {
            const k = key as keyof Emotion;
            character.emotion[k] = Math.max(0, Math.min(1, character.emotion[k] + value));
        }
    },

    /**
     * 기억 추가 (해석 포함)
     */
    addMemory(
        character: Character,
        eventId: EntityId,
        interpretation: string,
        emotionalImpact: Partial<Emotion>,
        timestamp: number
    ): void {
        character.memory.push({
            eventId,
            interpretation,
            emotionalImpact,
            timestamp,
        });

        // 감정 영향 적용
        this.updateEmotion(character, emotionalImpact);
    },

    /**
     * 믿음 업데이트 (베이지안 스타일)
     * P(H|E) = P(E|H) * P(H) / P(E)
     * 단순화: 새 증거에 따라 확률 조정
     */
    updateBelief(
        character: Character,
        beliefKey: string,
        evidence: number,  // -1 ~ 1 (음수: 반증, 양수: 증거)
        strength: number = 0.1  // 증거 강도
    ): void {
        const currentBelief = character.beliefs.get(beliefKey) ?? 0.5;
        const newBelief = currentBelief + evidence * strength * (1 - Math.abs(currentBelief - 0.5) * 2);
        character.beliefs.set(beliefKey, Math.max(0, Math.min(1, newBelief)));
    },

    /**
     * 특정 인물에 대한 믿음 키 생성
     */
    beliefKey(subject: EntityId, trait: string): string {
        return `${subject}:${trait}`;
    },

    /**
     * 지배적 감정 반환
     */
    getDominantEmotion(character: Character): keyof Emotion {
        const emotions = character.emotion;
        let max: keyof Emotion = 'trust';
        let maxValue = 0;

        for (const [key, value] of Object.entries(emotions)) {
            if (value > maxValue) {
                maxValue = value;
                max = key as keyof Emotion;
            }
        }

        return max;
    },

    /**
     * 행동 성향 계산 (성격 + 감정 기반)
     */
    getBehaviorTendency(character: Character): {
        aggressive: number;
        cooperative: number;
        cautious: number;
    } {
        const { personality: p, emotion: e } = character;

        return {
            aggressive: (p.ambition * 0.3 + p.courage * 0.3 + e.anger * 0.4)
                - (p.morality * 0.2 + e.fear * 0.2),
            cooperative: (p.loyalty * 0.3 + p.morality * 0.3 + e.trust * 0.4)
                - (e.anger * 0.2),
            cautious: (e.fear * 0.4 + (1 - p.courage) * 0.3 + p.cunning * 0.3),
        };
    },

    /**
     * 최근 기억에서 특정 인물 관련 기억 검색
     */
    getMemoriesAbout(character: Character, targetId: EntityId, limit: number = 5): InterpretedEvent[] {
        return character.memory
            .filter(m => m.interpretation.includes(targetId))
            .slice(-limit);
    },
};

/**
 * 성격 프리셋
 */
export const PersonalityPresets = {
    noble: {
        ambition: 0.7,
        loyalty: 0.6,
        morality: 0.6,
        courage: 0.7,
        cunning: 0.5,
    } as Personality,

    merchant: {
        ambition: 0.8,
        loyalty: 0.4,
        morality: 0.5,
        courage: 0.3,
        cunning: 0.8,
    } as Personality,

    soldier: {
        ambition: 0.4,
        loyalty: 0.8,
        morality: 0.5,
        courage: 0.9,
        cunning: 0.3,
    } as Personality,

    schemer: {
        ambition: 0.9,
        loyalty: 0.2,
        morality: 0.2,
        courage: 0.4,
        cunning: 0.9,
    } as Personality,

    peasant: {
        ambition: 0.3,
        loyalty: 0.6,
        morality: 0.6,
        courage: 0.4,
        cunning: 0.3,
    } as Personality,
};

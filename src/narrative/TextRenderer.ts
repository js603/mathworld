/**
 * 텍스트 렌더러
 * 
 * 핵심: 텍스트는 세계가 아니라, 세계 상태를 인간이 이해하게 번역한 것
 * - 의도 유도 원칙: 숫자를 숨기고 행동/관계로 표현
 * - ❌ "신뢰 +5" → ⭕ "이전엔 침묵하던 인물이 먼저 말을 건다"
 */

import {
    EntityId,
    Character,
    GameEvent,
    Relation,
    Location,
} from '../core/types';
import { WorldState } from '../core/WorldState';
import { CharacterUtils } from '../core/Character';
import { randomChoice } from '../utils';

/**
 * 텍스트 스타일
 */
type TextStyle = 'novel' | 'formal' | 'report' | 'dialogue';

/**
 * 텍스트 렌더러 클래스
 */
export class TextRenderer {
    private world: WorldState;

    constructor(world: WorldState) {
        this.world = world;
    }

    // ============ 세계 상태 서술 ============

    /**
     * 세계 상태를 텍스트로 렌더링
     */
    renderWorldState(style: TextStyle = 'novel'): string {
        const parts: string[] = [];
        const globalState = this.world.globalState;

        // 시간/계절
        parts.push(this.renderTime(style));

        // 전역 상태
        if (globalState.warActive) {
            parts.push(style === 'novel'
                ? '전쟁의 그림자가 온 땅을 뒤덮고 있다.'
                : '[전쟁 중]');
        }
        if (globalState.plagueActive) {
            parts.push(style === 'novel'
                ? '역병의 공포가 마을마다 퍼져 있다.'
                : '[역병 발생]');
        }

        return parts.join('\n');
    }

    private renderTime(style: TextStyle): string {
        const { season, dayOfYear } = this.world.globalState;
        const seasonNames = {
            spring: '봄',
            summer: '여름',
            autumn: '가을',
            winter: '겨울',
        };

        switch (style) {
            case 'novel':
                return `${seasonNames[season]}의 ${dayOfYear}일째 되는 날.`;
            case 'formal':
                return `${seasonNames[season]} ${dayOfYear}일`;
            case 'report':
                return `[Day ${dayOfYear}, ${season.toUpperCase()}]`;
            default:
                return `${seasonNames[season]} ${dayOfYear}일`;
        }
    }

    // ============ 관계 변화 서술 ============

    /**
     * 관계 변화를 행동으로 표현 (숫자 숨김)
     */
    describeRelationChange(
        characterId: EntityId,
        targetId: EntityId,
        before: Relation,
        after: Relation
    ): string {
        const character = this.world.getCharacter(characterId);
        const target = this.world.getCharacter(targetId);
        if (!character || !target) return '';

        const descriptions: string[] = [];
        const name = target.name;

        // 신뢰 변화
        const trustDelta = after.trust - before.trust;
        if (trustDelta > 0.1) {
            descriptions.push(randomChoice([
                `${name}이(가) 당신을 더 신뢰하는 눈빛이다.`,
                `${name}의 태도가 한결 부드러워졌다.`,
                `${name}이(가) 당신에게 먼저 말을 건다.`,
                `${name}의 경계심이 누그러졌다.`,
            ])!);
        } else if (trustDelta < -0.1) {
            descriptions.push(randomChoice([
                `${name}의 눈빛이 차가워졌다.`,
                `${name}이(가) 당신을 피하는 것 같다.`,
                `${name}의 말투가 딱딱해졌다.`,
                `${name}이(가) 당신을 경계한다.`,
            ])!);
        }

        // 공포 변화
        const fearDelta = after.fear - before.fear;
        if (fearDelta > 0.1) {
            descriptions.push(randomChoice([
                `${name}이(가) 당신 앞에서 움츠러든다.`,
                `${name}의 목소리가 떨린다.`,
                `${name}이(가) 당신의 눈을 피한다.`,
            ])!);
        } else if (fearDelta < -0.1) {
            descriptions.push(randomChoice([
                `${name}이(가) 더 이상 두려워하지 않는 것 같다.`,
                `${name}의 어깨가 펴졌다.`,
            ])!);
        }

        // 존경 변화
        const respectDelta = after.respect - before.respect;
        if (respectDelta > 0.1) {
            descriptions.push(randomChoice([
                `${name}의 눈에 존경이 담겼다.`,
                `${name}이(가) 당신을 다르게 보기 시작했다.`,
            ])!);
        } else if (respectDelta < -0.1) {
            descriptions.push(randomChoice([
                `${name}이(가) 당신을 가볍게 여기는 것 같다.`,
                `${name}의 태도에서 경멸이 느껴진다.`,
            ])!);
        }

        if (descriptions.length === 0) {
            return ''; // 변화 없음
        }

        return descriptions.join(' ');
    }

    // ============ 결과 서술 ============

    /**
     * 행동 결과 서술 (실패 비명시)
     */
    describeOutcome(
        success: boolean,
        actionName: string,
        targetName?: string
    ): string {
        if (success) {
            const successPhrases = [
                `${actionName}에 성공했다.`,
                `당신의 ${actionName}이(가) 효과가 있었다.`,
                `${targetName ? targetName + '이(가) 반응했다.' : '반응이 있었다.'}`,
            ];
            return randomChoice(successPhrases)!;
        } else {
            // 실패를 명시하지 않음 (의도 유도 원칙 4)
            const failurePhrases = [
                '아무 일도 일어나지 않았다.',
                '상황이 변하지 않았다.',
                '반응이 없었다.',
                `${targetName ? targetName + '이(가) 무관심해 보인다.' : '분위기가 어색하다.'}`,
                '다른 누군가가 먼저 움직인 것 같다.',
            ];
            return randomChoice(failurePhrases)!;
        }
    }

    // ============ 캐릭터 서술 ============

    /**
     * 캐릭터 상태 서술
     */
    describeCharacter(characterId: EntityId, style: TextStyle = 'novel'): string {
        const character = this.world.getCharacter(characterId);
        if (!character) return '알 수 없는 인물';

        const parts: string[] = [];

        // 이름과 직함
        if (character.title) {
            parts.push(`${character.title} ${character.name}`);
        } else {
            parts.push(character.name);
        }

        // 감정 상태 (지배적 감정)
        const dominantEmotion = CharacterUtils.getDominantEmotion(character);
        const emotionDesc = this.getEmotionDescription(dominantEmotion, character.emotion[dominantEmotion]);
        if (emotionDesc) {
            parts.push(emotionDesc);
        }

        // 행동 성향
        const tendency = CharacterUtils.getBehaviorTendency(character);
        if (tendency.aggressive > 0.6) {
            parts.push(style === 'novel' ? '공격적인 기운이 느껴진다.' : '[공격적]');
        } else if (tendency.cautious > 0.6) {
            parts.push(style === 'novel' ? '조심스러운 태도를 보인다.' : '[경계 중]');
        } else if (tendency.cooperative > 0.6) {
            parts.push(style === 'novel' ? '협조적인 모습이다.' : '[우호적]');
        }

        return parts.join(' - ');
    }

    private getEmotionDescription(emotion: string, value: number): string {
        if (value < 0.3) return '';

        const descriptions: Record<string, string[]> = {
            trust: ['믿음직스러운 눈빛', '신뢰하는 표정'],
            fear: ['두려움에 떨고 있다', '공포에 질린 모습'],
            anger: ['분노가 끓어오르고 있다', '화가 난 표정'],
            joy: ['밝은 표정', '행복해 보인다'],
            despair: ['절망에 빠져 있다', '희망을 잃은 모습'],
        };

        return randomChoice(descriptions[emotion] || []) || '';
    }

    // ============ 이벤트 서술 ============

    /**
     * 이벤트를 소설체로 서술
     */
    describeEvent(event: GameEvent, style: TextStyle = 'novel'): string {
        const participants = event.participants
            .map(id => this.world.getCharacter(id)?.name || '누군가')
            .join(', ');

        if (style === 'novel') {
            return this.describeEventNovel(event, participants);
        } else if (style === 'report') {
            return `[${event.type.toUpperCase()}] ${event.description} (${participants})`;
        }

        return event.description;
    }

    private describeEventNovel(event: GameEvent, participants: string): string {
        switch (event.type) {
            case 'betrayal':
                return `어둠 속에서 칼이 번뜩였다. ${participants}의 이야기가 세간에 퍼지기 시작했다.`;
            case 'alliance':
                return `${participants}이(가) 손을 맞잡았다. 새로운 동맹의 소식이 전해졌다.`;
            case 'combat':
                return `칼날이 부딪히는 소리가 울려 퍼졌다. ${participants}이(가) 충돌했다.`;
            case 'trade':
                return `${participants}이(가) 거래를 성사시켰다.`;
            case 'death':
                return `${participants}이(가) 숨을 거두었다. 세상이 한 사람을 잃었다.`;
            case 'war_declared':
                return '전쟁의 북소리가 울려 퍼졌다. 평화의 시대가 끝났다.';
            case 'plague':
                return '역병이 창궐하기 시작했다. 사람들이 두려움에 떨었다.';
            case 'natural_disaster':
                return '자연이 분노했다. 재앙이 덮쳤다.';
            default:
                return event.description;
        }
    }

    // ============ 장소 서술 ============

    /**
     * 장소 서술
     */
    describeLocation(locationId: EntityId, style: TextStyle = 'novel'): string {
        const location = this.world.getLocation(locationId);
        if (!location) return '알 수 없는 장소';

        const parts: string[] = [];

        // 기본 정보
        parts.push(location.name);

        // 안정도에 따른 분위기
        if (location.stability < 0.3) {
            parts.push(style === 'novel'
                ? '불안한 기운이 감돈다.'
                : '[불안정]');
        } else if (location.stability > 0.8) {
            parts.push(style === 'novel'
                ? '평화로운 분위기다.'
                : '[안정]');
        }

        // 인구에 따른 묘사
        if (location.population > 10000) {
            parts.push(style === 'novel' ? '번화한 곳이다.' : '[대도시]');
        } else if (location.population < 500) {
            parts.push(style === 'novel' ? '조용한 곳이다.' : '[소규모]');
        }

        return parts.join(' ');
    }

    // ============ 선택지 서술 ============

    /**
     * 선택지 목록 포맷팅
     */
    formatChoices(choices: Array<{ text: string; context: string }>): string {
        return choices.map((c, i) =>
            `${i + 1}. ${c.text}\n   └ ${c.context}`
        ).join('\n');
    }

    // ============ 전체 턴 요약 ============

    /**
     * 턴 시작 시 상황 요약
     */
    renderTurnSummary(playerId: EntityId): string {
        const player = this.world.getCharacter(playerId);
        if (!player) return '';

        const parts: string[] = [];

        // 시간/장소
        parts.push(this.renderTime('novel'));
        parts.push(`당신은 ${this.describeLocation(player.location, 'novel')}에 있다.`);

        // 최근 사건
        const recentEvents = this.world.getRecentEvents(3);
        if (recentEvents.length > 0) {
            parts.push('\n[최근 소식]');
            for (const event of recentEvents) {
                if (event.isPublic) {
                    parts.push(`- ${this.describeEvent(event, 'novel')}`);
                }
            }
        }

        // 주변 인물
        const nearbyCharacters = this.world.getCharactersAt(player.location)
            .filter(c => c.id !== playerId);
        if (nearbyCharacters.length > 0) {
            parts.push('\n[주변 인물]');
            for (const char of nearbyCharacters.slice(0, 3)) {
                parts.push(`- ${this.describeCharacter(char.id, 'novel')}`);
            }
        }

        return parts.join('\n');
    }
}

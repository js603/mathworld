/**
 * EventGenerator 단위 테스트
 */

import { WorldState } from '../../src/core/WorldState';
import { EventGenerator } from '../../src/narrative/EventGenerator';
import { createCharacter, PersonalityPresets } from '../../src/core/Character';

describe('EventGenerator', () => {
    let world: WorldState;
    let eventGen: EventGenerator;

    beforeEach(() => {
        world = new WorldState();
        eventGen = new EventGenerator(world);

        // 기본 캐릭터 추가
        const king = createCharacter({
            name: '왕',
            location: 'capital',
            personality: PersonalityPresets.noble,
            power: 100,
        });
        const rival = createCharacter({
            name: '경쟁자',
            location: 'capital',
            personality: PersonalityPresets.schemer,
            power: 80,
        });

        world.addCharacter(king);
        world.addCharacter(rival);
    });

    describe('불안정 감지', () => {
        it('권력 불균형을 감지해야 함', () => {
            const chars = world.getAllCharacters();
            const king = chars[0];
            const rival = chars[1];

            // 권력 격차 크게 만들기 (2배 초과)
            king.power = 300;
            rival.power = 100;

            // 관계 설정 (getMostInfluential이 작동하도록)
            world.relations.updateRelation(king.id, rival.id, { trust: 0.1 });
            world.relations.updateRelation(rival.id, king.id, { trust: 0.1 });

            const instabilities = eventGen.detectInstability();
            expect(instabilities).toContain('power_imbalance');
        });

        it('신뢰 붕괴를 감지해야 함', () => {
            const chars = world.getAllCharacters();
            world.relations.updateRelation(chars[0].id, chars[1].id, { trust: -0.5 });
            world.relations.updateRelation(chars[1].id, chars[0].id, { trust: -0.5 });

            const instabilities = eventGen.detectInstability();
            expect(instabilities).toContain('trust_collapse');
        });
    });

    describe('사건 생성', () => {
        it('사건 생성 시 배열을 반환해야 함', () => {
            const events = eventGen.generateEvents();
            expect(Array.isArray(events)).toBe(true);
        });
    });

    describe('NPC 자발적 행동', () => {
        it('예외 없이 실행되어야 함', () => {
            expect(() => eventGen.generateNPCActions()).not.toThrow();
        });
    });
});

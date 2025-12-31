/**
 * WorldState 단위 테스트
 */

import { WorldState } from '../../src/core/WorldState';
import { createCharacter, PersonalityPresets } from '../../src/core/Character';

describe('WorldState', () => {
    let world: WorldState;

    beforeEach(() => {
        world = new WorldState();
    });

    describe('시간 진행', () => {
        it('advanceTime으로 시간이 증가해야 함', () => {
            expect(world.time).toBe(0);
            world.advanceTime();
            expect(world.time).toBe(1);
        });

        it('계절이 올바르게 변경되어야 함', () => {
            expect(world.globalState.season).toBe('spring');

            // 91일 진행 → 여름
            for (let i = 0; i < 91; i++) world.advanceTime();
            expect(world.globalState.season).toBe('summer');
        });
    });

    describe('캐릭터 관리', () => {
        it('캐릭터를 추가하고 조회할 수 있어야 함', () => {
            const char = createCharacter({
                name: '테스트',
                location: 'loc1',
                personality: PersonalityPresets.noble,
            });

            world.addCharacter(char);
            const retrieved = world.getCharacter(char.id);

            expect(retrieved).toBeDefined();
            expect(retrieved?.name).toBe('테스트');
        });

        it('장소별 캐릭터를 조회할 수 있어야 함', () => {
            const char1 = createCharacter({ name: '캐릭터1', location: 'loc1' });
            const char2 = createCharacter({ name: '캐릭터2', location: 'loc2' });

            world.addCharacter(char1);
            world.addCharacter(char2);

            const atLoc1 = world.getCharactersAt('loc1');
            expect(atLoc1).toHaveLength(1);
            expect(atLoc1[0].name).toBe('캐릭터1');
        });
    });

    describe('감정 감쇠', () => {
        it('시간이 지나면 감정이 감쇠해야 함', () => {
            const char = createCharacter({
                name: '테스트',
                location: 'loc1',
                emotion: { trust: 0.5, fear: 0.5, anger: 0.5, joy: 0.5, despair: 0.5 },
            });

            world.addCharacter(char);
            const initialAnger = char.emotion.anger;

            world.advanceTime();

            expect(char.emotion.anger).toBeLessThan(initialAnger);
        });
    });
});

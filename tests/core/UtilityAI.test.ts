/**
 * UtilityAI 단위 테스트
 */

import { WorldState } from '../../src/core/WorldState';
import { UtilityAI, BaseActions } from '../../src/core/UtilityAI';
import { createCharacter, PersonalityPresets } from '../../src/core/Character';

describe('UtilityAI', () => {
    let world: WorldState;
    let ai: UtilityAI;

    beforeEach(() => {
        world = new WorldState();
        ai = new UtilityAI(world);
    });

    describe('효용 계산', () => {
        it('조건을 만족하지 않으면 효용이 -Infinity여야 함', () => {
            const char = createCharacter({
                name: '테스트',
                location: 'loc1',
                resources: 5, // 10 미만
            });
            world.addCharacter(char);

            const tradeAction = BaseActions.find(a => a.id === 'trade');
            if (tradeAction) {
                const result = ai.calculateUtility(char, tradeAction);
                expect(result.utility).toBe(-Infinity);
            }
        });
    });

    describe('행동 선택', () => {
        it('가능한 행동 중 하나를 선택해야 함', () => {
            const char = createCharacter({
                name: '테스트',
                location: 'loc1',
                resources: 100,
                power: 20,
            });
            world.addCharacter(char);

            const decision = ai.selectAction(char, BaseActions);
            expect(decision).not.toBeNull();
            expect(decision?.action).toBeDefined();
        });

        it('행동이 없으면 null을 반환해야 함', () => {
            const char = createCharacter({
                name: '테스트',
                location: 'loc1',
            });
            world.addCharacter(char);

            const decision = ai.selectAction(char, []);
            expect(decision).toBeNull();
        });
    });

    describe('성격 영향', () => {
        it('야망이 높은 캐릭터는 공격적 행동의 효용이 높아야 함', () => {
            const ambitious = createCharacter({
                name: '야망가',
                location: 'loc1',
                personality: { ...PersonalityPresets.schemer },
                resources: 100,
                power: 30,
            });
            world.addCharacter(ambitious);

            // 공격적 행동의 효용 계산
            const attackAction = BaseActions.find(a => a.id === 'attack');
            const talkAction = BaseActions.find(a => a.id === 'talk_friendly');

            if (attackAction && talkAction) {
                const attackResult = ai.calculateUtility(ambitious, attackAction);
                const talkResult = ai.calculateUtility(ambitious, talkAction);

                // 공격 행동의 성격 적합도가 우호적 대화보다 높아야 함
                expect(attackResult.breakdown.personalityFit).toBeGreaterThan(
                    talkResult.breakdown.personalityFit
                );
            }
        });
    });
});

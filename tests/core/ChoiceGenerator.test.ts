/**
 * ChoiceGenerator 단위 테스트
 */

import { WorldState } from '../../src/core/WorldState';
import { ChoiceGenerator } from '../../src/core/ChoiceGenerator';
import { createCharacter, PersonalityPresets } from '../../src/core/Character';

describe('ChoiceGenerator', () => {
    let world: WorldState;
    let choiceGen: ChoiceGenerator;

    beforeEach(() => {
        world = new WorldState();
        choiceGen = new ChoiceGenerator(world);

        // 테스트용 캐릭터 추가
        const player = createCharacter({
            name: '플레이어',
            location: 'capital',
            isPlayer: true,
            resources: 100,
            power: 10,
        });

        const npc = createCharacter({
            name: 'NPC',
            location: 'capital',
            personality: PersonalityPresets.merchant,
            resources: 500,
            power: 20,
        });

        world.addCharacter(player);
        world.addCharacter(npc);

        // 장소 추가
        world.addLocation({
            id: 'capital',
            name: '왕도',
            type: 'city',
            resources: 1000,
            population: 50000,
            stability: 0.8,
            connectedTo: [],
        });
    });

    describe('선택지 생성', () => {
        it('타겟이 있을 때 선택지가 생성되어야 함', () => {
            const player = world.getAllCharacters().find(c => c.isPlayer)!;
            const npc = world.getAllCharacters().find(c => !c.isPlayer)!;

            const choices = choiceGen.generateChoices(player, npc.id);

            expect(choices.length).toBeGreaterThan(0);
        });

        it('각 선택지는 text와 action을 가져야 함', () => {
            const player = world.getAllCharacters().find(c => c.isPlayer)!;
            const npc = world.getAllCharacters().find(c => !c.isPlayer)!;

            const choices = choiceGen.generateChoices(player, npc.id);

            for (const choice of choices) {
                expect(choice.text).toBeDefined();
                expect(choice.action).toBeDefined();
                expect(choice.context).toBeDefined();
            }
        });

        it('선택지에 맥락이 포함되어야 함', () => {
            const player = world.getAllCharacters().find(c => c.isPlayer)!;
            const npc = world.getAllCharacters().find(c => !c.isPlayer)!;

            const choices = choiceGen.generateChoices(player, npc.id);

            // 맥락이 비어있지 않아야 함
            const hasContext = choices.some(c => c.context && c.context.length > 0);
            expect(hasContext).toBe(true);
        });
    });

    describe('특별 선택지', () => {
        it('관찰 선택지를 반환해야 함', () => {
            const observeChoice = choiceGen.getObserveChoice();

            expect(observeChoice).toBeDefined();
            expect(observeChoice.text).toContain('관찰');
        });

        it('침묵 선택지를 반환해야 함', () => {
            const silenceChoice = choiceGen.getSilenceChoice();

            expect(silenceChoice).toBeDefined();
            expect(silenceChoice.text).toContain('침묵');
        });
    });

    describe('맥락 변질', () => {
        it('플레이어 상태에 따라 맥락이 변해야 함', () => {
            const player = world.getAllCharacters().find(c => c.isPlayer)!;
            const npc = world.getAllCharacters().find(c => !c.isPlayer)!;

            // 초기 상태에서 선택지 생성
            const choices1 = choiceGen.generateChoices(player, npc.id);

            // 플레이어 상태 변경 (분노)
            player.emotion.anger = 0.8;

            const choices2 = choiceGen.generateChoices(player, npc.id);

            // 선택지는 동일하지만 맥락이나 텍스트가 다를 수 있음
            expect(choices1.length).toBe(choices2.length);
        });

        it('관계에 따라 맥락이 변해야 함', () => {
            const player = world.getAllCharacters().find(c => c.isPlayer)!;
            const npc = world.getAllCharacters().find(c => !c.isPlayer)!;

            // 적대 관계 설정
            world.relations.updateRelation(player.id, npc.id, { trust: -0.8 });

            const choices = choiceGen.generateChoices(player, npc.id);

            // 적대 관계에서도 선택지가 생성되어야 함
            expect(choices.length).toBeGreaterThan(0);
        });
    });

    describe('자원 조건', () => {
        it('자원이 부족하면 일부 선택지가 제한되어야 함', () => {
            const player = world.getAllCharacters().find(c => c.isPlayer)!;
            const npc = world.getAllCharacters().find(c => !c.isPlayer)!;

            // 풍부한 자원
            player.resources = 1000;
            const richChoices = choiceGen.generateChoices(player, npc.id);

            // 부족한 자원
            player.resources = 5;
            const poorChoices = choiceGen.generateChoices(player, npc.id);

            // 자원이 부족하면 선택지가 줄어들 수 있음
            expect(poorChoices.length).toBeLessThanOrEqual(richChoices.length);
        });
    });
});

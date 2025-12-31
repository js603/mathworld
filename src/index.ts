/**
 * MathWorld - 텍스트 소설형 MMO RPG 엔진
 * 
 * 진입점
 */

import {
    WorldState,
    createCharacter,
    PersonalityPresets,
    ChoiceGenerator,
} from './core';

export function createGame() {
    const world = new WorldState();

    // 초기 장소 생성
    world.addLocation({
        id: 'capital',
        name: '왕도',
        type: 'city',
        resources: 1000,
        population: 50000,
        stability: 0.8,
        connectedTo: ['village1', 'castle'],
        owner: 'king',
    });

    world.addLocation({
        id: 'village1',
        name: '변방 마을',
        type: 'village',
        resources: 200,
        population: 500,
        stability: 0.6,
        connectedTo: ['capital', 'wilderness'],
    });

    // 초기 인물 생성
    const king = createCharacter({
        name: '왕',
        title: '아르테미스 왕',
        location: 'capital',
        personality: PersonalityPresets.noble,
        power: 100,
        resources: 10000,
    });

    const merchant = createCharacter({
        name: '마르코',
        title: '대상인',
        location: 'capital',
        personality: PersonalityPresets.merchant,
        power: 30,
        resources: 5000,
    });

    const player = createCharacter({
        name: '모험가',
        location: 'village1',
        isPlayer: true,
        power: 10,
        resources: 100,
    });

    world.addCharacter(king);
    world.addCharacter(merchant);
    world.addCharacter(player);

    // 초기 관계 설정
    world.relations.updateRelation(king.id, merchant.id, { trust: 0.3, respect: 0.2 });
    world.relations.updateRelation(merchant.id, king.id, { trust: 0.2, fear: 0.3 });

    return { world, player, king, merchant };
}

// CLI에서 직접 실행 시
if (typeof require !== 'undefined' && require.main === module) {
    console.log('MathWorld 엔진 초기화...');
    const { world, player } = createGame();
    console.log('세계 상태:', world.snapshot());
    console.log('플레이어:', player.name);
}

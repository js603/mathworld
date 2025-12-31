/**
 * RelationGraph 단위 테스트
 */

import { RelationGraph } from '../../src/core/RelationGraph';

describe('RelationGraph', () => {
    let graph: RelationGraph;

    beforeEach(() => {
        graph = new RelationGraph();
    });

    describe('관계 관리', () => {
        it('관계를 조회하면 기본값이 반환되어야 함', () => {
            const relation = graph.getRelation('a', 'b');
            expect(relation.trust).toBe(0);
            expect(relation.fear).toBe(0);
        });

        it('관계를 업데이트할 수 있어야 함', () => {
            graph.updateRelation('a', 'b', { trust: 0.5 });
            const relation = graph.getRelation('a', 'b');
            expect(relation.trust).toBe(0.5);
        });

        it('관계 변화량을 적용할 수 있어야 함', () => {
            graph.modifyRelation('a', 'b', { trust: 0.3 });
            graph.modifyRelation('a', 'b', { trust: 0.2 });
            const relation = graph.getRelation('a', 'b');
            expect(relation.trust).toBe(0.5);
        });

        it('관계값이 범위 내로 클램프되어야 함', () => {
            graph.modifyRelation('a', 'b', { trust: 2 });
            expect(graph.getRelation('a', 'b').trust).toBe(1);

            graph.modifyRelation('a', 'b', { trust: -5 });
            expect(graph.getRelation('a', 'b').trust).toBe(-1);
        });
    });

    describe('친구/적 목록', () => {
        it('친구 목록을 조회할 수 있어야 함', () => {
            graph.updateRelation('a', 'b', { trust: 0.5 });
            graph.updateRelation('a', 'c', { trust: -0.5 });

            const friends = graph.getFriends('a');
            expect(friends).toContain('b');
            expect(friends).not.toContain('c');
        });

        it('적 목록을 조회할 수 있어야 함', () => {
            graph.updateRelation('a', 'b', { trust: -0.5 });

            const enemies = graph.getEnemies('a');
            expect(enemies).toContain('b');
        });
    });

    describe('공통 친구', () => {
        it('공통 친구를 찾을 수 있어야 함', () => {
            graph.updateRelation('a', 'c', { trust: 0.5 });
            graph.updateRelation('b', 'c', { trust: 0.5 });

            const mutual = graph.getMutualFriends('a', 'b');
            expect(mutual).toContain('c');
        });
    });

    describe('파벌 감지', () => {
        it('상호 신뢰가 높은 그룹을 파벌로 감지해야 함', () => {
            graph.updateRelation('a', 'b', { trust: 0.6 });
            graph.updateRelation('b', 'a', { trust: 0.6 });

            const clusters = graph.getClusters(0.4);
            expect(clusters.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('중심성', () => {
        it('연결이 많은 노드의 중심성이 높아야 함', () => {
            graph.updateRelation('a', 'b', { trust: 0.5 });
            graph.updateRelation('a', 'c', { trust: 0.5 });
            graph.updateRelation('a', 'd', { trust: 0.5 });

            const centrality = graph.getCentrality('a');
            expect(centrality).toBeGreaterThan(0);
        });
    });
});

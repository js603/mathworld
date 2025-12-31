/**
 * 관계 그래프 모듈
 * 
 * 핵심: 인간 사회 = 그래프 구조
 * - 노드: 인물
 * - 엣지: 관계 (방향성, 가중치 있음)
 */

import { EntityId, Relation } from './types';

/**
 * 기본 관계 (처음 만난 상태)
 */
const DEFAULT_RELATION: Relation = {
    trust: 0,
    fear: 0,
    respect: 0,
    debt: 0,
    secretShared: false,
    history: [],
};

/**
 * 관계 그래프 클래스
 * 
 * 방향성 가중 그래프로 인물 간 관계를 표현
 */
export class RelationGraph {
    // edges[from][to] = Relation
    private edges: Map<EntityId, Map<EntityId, Relation>> = new Map();

    /**
     * 두 인물 간의 관계 가져오기
     * 관계가 없으면 기본 관계 생성
     */
    getRelation(from: EntityId, to: EntityId): Relation {
        if (!this.edges.has(from)) {
            this.edges.set(from, new Map());
        }

        const fromEdges = this.edges.get(from)!;
        if (!fromEdges.has(to)) {
            fromEdges.set(to, { ...DEFAULT_RELATION });
        }

        return fromEdges.get(to)!;
    }

    /**
     * 관계 업데이트
     */
    updateRelation(from: EntityId, to: EntityId, updates: Partial<Relation>): void {
        const relation = this.getRelation(from, to);
        Object.assign(relation, updates);

        // 값 범위 클램프
        relation.trust = Math.max(-1, Math.min(1, relation.trust));
        relation.fear = Math.max(0, Math.min(1, relation.fear));
        relation.respect = Math.max(-1, Math.min(1, relation.respect));
    }

    /**
     * 관계 변화량 적용 (상대값)
     */
    modifyRelation(from: EntityId, to: EntityId, delta: Partial<Relation>): void {
        const relation = this.getRelation(from, to);

        if (delta.trust !== undefined) relation.trust += delta.trust;
        if (delta.fear !== undefined) relation.fear += delta.fear;
        if (delta.respect !== undefined) relation.respect += delta.respect;
        if (delta.debt !== undefined) relation.debt += delta.debt;
        if (delta.secretShared !== undefined) relation.secretShared = delta.secretShared;

        // 값 범위 클램프
        relation.trust = Math.max(-1, Math.min(1, relation.trust));
        relation.fear = Math.max(0, Math.min(1, relation.fear));
        relation.respect = Math.max(-1, Math.min(1, relation.respect));
    }

    /**
     * 이벤트 기록 추가
     */
    addHistory(from: EntityId, to: EntityId, eventId: EntityId): void {
        const relation = this.getRelation(from, to);
        relation.history.push(eventId);
    }

    /**
     * 공통 친구 찾기
     * A와 B 모두와 양호한 관계(trust > 0)를 가진 인물 목록
     */
    getMutualFriends(a: EntityId, b: EntityId): EntityId[] {
        const aFriends = this.getFriends(a);
        const bFriends = this.getFriends(b);

        return aFriends.filter(f => bFriends.includes(f));
    }

    /**
     * 친구 목록 (trust > 0인 관계)
     */
    getFriends(id: EntityId): EntityId[] {
        const friends: EntityId[] = [];
        const edges = this.edges.get(id);

        if (edges) {
            for (const [targetId, relation] of edges) {
                if (relation.trust > 0) {
                    friends.push(targetId);
                }
            }
        }

        return friends;
    }

    /**
     * 적 목록 (trust < -0.3인 관계)
     */
    getEnemies(id: EntityId): EntityId[] {
        const enemies: EntityId[] = [];
        const edges = this.edges.get(id);

        if (edges) {
            for (const [targetId, relation] of edges) {
                if (relation.trust < -0.3) {
                    enemies.push(targetId);
                }
            }
        }

        return enemies;
    }

    /**
     * 파벌 감지 (클러스터링)
     * 상호 신뢰가 높은 그룹을 찾음
     */
    getClusters(threshold: number = 0.3): EntityId[][] {
        const allNodes = new Set<EntityId>();

        // 모든 노드 수집
        for (const [from, edges] of this.edges) {
            allNodes.add(from);
            for (const to of edges.keys()) {
                allNodes.add(to);
            }
        }

        const visited = new Set<EntityId>();
        const clusters: EntityId[][] = [];

        for (const node of allNodes) {
            if (visited.has(node)) continue;

            // BFS로 연결된 친구 그룹 찾기
            const cluster: EntityId[] = [];
            const queue = [node];

            while (queue.length > 0) {
                const current = queue.shift()!;
                if (visited.has(current)) continue;

                visited.add(current);
                cluster.push(current);

                // 상호 신뢰가 높은 노드 추가
                const friends = this.getFriends(current);
                for (const friend of friends) {
                    const reverseRelation = this.getRelation(friend, current);
                    if (reverseRelation.trust > threshold && !visited.has(friend)) {
                        queue.push(friend);
                    }
                }
            }

            if (cluster.length > 1) {
                clusters.push(cluster);
            }
        }

        return clusters;
    }

    /**
     * 중심성 계산 (영향력 측정)
     * 단순 차수 중심성 사용
     */
    getCentrality(id: EntityId): number {
        let centrality = 0;

        // 나가는 엣지
        const outEdges = this.edges.get(id);
        if (outEdges) {
            centrality += outEdges.size;
        }

        // 들어오는 엣지 (다른 사람이 나를 아는 경우)
        for (const [, edges] of this.edges) {
            if (edges.has(id)) {
                centrality += 1;
            }
        }

        return centrality;
    }

    /**
     * 관계 열 계산 (전체적인 우호도)
     * 높을수록 우호적
     */
    getRelationHeat(from: EntityId, to: EntityId): number {
        const relation = this.getRelation(from, to);
        return relation.trust + relation.respect * 0.5 - relation.fear * 0.3;
    }

    /**
     * 가장 영향력 있는 인물 찾기
     */
    getMostInfluential(limit: number = 5): EntityId[] {
        const allNodes = new Set<EntityId>();

        for (const [from, edges] of this.edges) {
            allNodes.add(from);
            for (const to of edges.keys()) {
                allNodes.add(to);
            }
        }

        const centralityList = Array.from(allNodes).map(id => ({
            id,
            centrality: this.getCentrality(id),
        }));

        centralityList.sort((a, b) => b.centrality - a.centrality);

        return centralityList.slice(0, limit).map(c => c.id);
    }

    /**
     * 소문/정보 확산 시뮬레이션
     * 특정 인물에서 시작하여 정보가 퍼지는 경로 계산
     */
    simulateRumorSpread(
        source: EntityId,
        turns: number,
        spreadProbability: (relation: Relation) => number
    ): Set<EntityId> {
        const informed = new Set<EntityId>([source]);
        const frontier = new Set<EntityId>([source]);

        for (let t = 0; t < turns; t++) {
            const newlyInformed = new Set<EntityId>();

            for (const person of frontier) {
                const edges = this.edges.get(person);
                if (!edges) continue;

                for (const [target, relation] of edges) {
                    if (informed.has(target)) continue;

                    const prob = spreadProbability(relation);
                    if (Math.random() < prob) {
                        newlyInformed.add(target);
                        informed.add(target);
                    }
                }
            }

            frontier.clear();
            for (const person of newlyInformed) {
                frontier.add(person);
            }
        }

        return informed;
    }

    /**
     * 그래프 통계
     */
    getStats(): {
        nodeCount: number;
        edgeCount: number;
        avgTrust: number;
        avgFear: number;
    } {
        let nodeCount = 0;
        let edgeCount = 0;
        let totalTrust = 0;
        let totalFear = 0;

        const nodes = new Set<EntityId>();

        for (const [from, edges] of this.edges) {
            nodes.add(from);
            for (const [to, relation] of edges) {
                nodes.add(to);
                edgeCount++;
                totalTrust += relation.trust;
                totalFear += relation.fear;
            }
        }

        nodeCount = nodes.size;

        return {
            nodeCount,
            edgeCount,
            avgTrust: edgeCount > 0 ? totalTrust / edgeCount : 0,
            avgFear: edgeCount > 0 ? totalFear / edgeCount : 0,
        };
    }
}

/**
 * 그래프 알고리즘 모듈
 * 
 * 범용 그래프 연산 함수들 (RelationGraph에서 사용)
 */

/**
 * 노드 타입
 */
export type NodeId = string;

/**
 * 엣지 정의
 */
export interface Edge<T> {
    from: NodeId;
    to: NodeId;
    weight: number;
    data?: T;
}

/**
 * 그래프 통계
 */
export interface GraphStats {
    nodeCount: number;
    edgeCount: number;
    avgDegree: number;
    density: number;
}

/**
 * BFS (너비 우선 탐색)
 */
export function bfs<T>(
    startNode: NodeId,
    getNeighbors: (node: NodeId) => NodeId[],
    visit: (node: NodeId, depth: number) => boolean | void
): Set<NodeId> {
    const visited = new Set<NodeId>();
    const queue: Array<{ node: NodeId; depth: number }> = [{ node: startNode, depth: 0 }];

    while (queue.length > 0) {
        const { node, depth } = queue.shift()!;

        if (visited.has(node)) continue;
        visited.add(node);

        const shouldStop = visit(node, depth);
        if (shouldStop === true) break;

        const neighbors = getNeighbors(node);
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
                queue.push({ node: neighbor, depth: depth + 1 });
            }
        }
    }

    return visited;
}

/**
 * DFS (깊이 우선 탐색)
 */
export function dfs<T>(
    startNode: NodeId,
    getNeighbors: (node: NodeId) => NodeId[],
    visit: (node: NodeId, depth: number) => boolean | void
): Set<NodeId> {
    const visited = new Set<NodeId>();

    function recurse(node: NodeId, depth: number): boolean {
        if (visited.has(node)) return false;
        visited.add(node);

        const shouldStop = visit(node, depth);
        if (shouldStop === true) return true;

        const neighbors = getNeighbors(node);
        for (const neighbor of neighbors) {
            if (recurse(neighbor, depth + 1)) return true;
        }

        return false;
    }

    recurse(startNode, 0);
    return visited;
}

/**
 * 최단 경로 (Dijkstra)
 */
export function dijkstra(
    startNode: NodeId,
    endNode: NodeId,
    getNeighbors: (node: NodeId) => Array<{ node: NodeId; weight: number }>
): { path: NodeId[]; distance: number } | null {
    const distances = new Map<NodeId, number>();
    const previous = new Map<NodeId, NodeId>();
    const unvisited = new Set<NodeId>([startNode]);

    distances.set(startNode, 0);

    while (unvisited.size > 0) {
        // 가장 가까운 노드 선택
        let current: NodeId | null = null;
        let minDist = Infinity;

        for (const node of unvisited) {
            const dist = distances.get(node) ?? Infinity;
            if (dist < minDist) {
                minDist = dist;
                current = node;
            }
        }

        if (current === null || minDist === Infinity) break;
        if (current === endNode) break;

        unvisited.delete(current);

        const neighbors = getNeighbors(current);
        for (const { node, weight } of neighbors) {
            const newDist = minDist + weight;
            const oldDist = distances.get(node) ?? Infinity;

            if (newDist < oldDist) {
                distances.set(node, newDist);
                previous.set(node, current);
                unvisited.add(node);
            }
        }
    }

    // 경로 재구성
    if (!distances.has(endNode)) return null;

    const path: NodeId[] = [];
    let current: NodeId | undefined = endNode;

    while (current !== undefined) {
        path.unshift(current);
        current = previous.get(current);
    }

    return {
        path,
        distance: distances.get(endNode)!,
    };
}

/**
 * 연결 요소 탐지 (Connected Components)
 */
export function findConnectedComponents(
    nodes: NodeId[],
    getNeighbors: (node: NodeId) => NodeId[]
): NodeId[][] {
    const visited = new Set<NodeId>();
    const components: NodeId[][] = [];

    for (const node of nodes) {
        if (visited.has(node)) continue;

        const component: NodeId[] = [];
        bfs(node, getNeighbors, (n) => {
            component.push(n);
            visited.add(n);
        });

        if (component.length > 0) {
            components.push(component);
        }
    }

    return components;
}

/**
 * 그래프 밀도 계산
 */
export function calculateDensity(nodeCount: number, edgeCount: number, directed: boolean = true): number {
    if (nodeCount <= 1) return 0;
    const maxEdges = directed
        ? nodeCount * (nodeCount - 1)
        : nodeCount * (nodeCount - 1) / 2;
    return edgeCount / maxEdges;
}

/**
 * 차수 중심성 (Degree Centrality)
 */
export function degreeCentrality(
    node: NodeId,
    getIncoming: (node: NodeId) => NodeId[],
    getOutgoing: (node: NodeId) => NodeId[]
): number {
    return getIncoming(node).length + getOutgoing(node).length;
}

/**
 * 페이지랭크 (단순화 버전)
 */
export function pageRank(
    nodes: NodeId[],
    getOutgoing: (node: NodeId) => NodeId[],
    damping: number = 0.85,
    iterations: number = 20
): Map<NodeId, number> {
    const n = nodes.length;
    if (n === 0) return new Map();

    const ranks = new Map<NodeId, number>();
    const initialRank = 1 / n;

    // 초기화
    for (const node of nodes) {
        ranks.set(node, initialRank);
    }

    // 역방향 인덱스 생성
    const incoming = new Map<NodeId, NodeId[]>();
    for (const node of nodes) {
        incoming.set(node, []);
    }
    for (const node of nodes) {
        for (const target of getOutgoing(node)) {
            incoming.get(target)?.push(node);
        }
    }

    // 반복 계산
    for (let i = 0; i < iterations; i++) {
        const newRanks = new Map<NodeId, number>();

        for (const node of nodes) {
            let sum = 0;
            for (const source of incoming.get(node) || []) {
                const outDegree = getOutgoing(source).length;
                if (outDegree > 0) {
                    sum += (ranks.get(source) || 0) / outDegree;
                }
            }
            newRanks.set(node, (1 - damping) / n + damping * sum);
        }

        for (const [node, rank] of newRanks) {
            ranks.set(node, rank);
        }
    }

    return ranks;
}

/**
 * 유틸리티 함수 모듈
 */

/**
 * 고유 ID 생성
 */
export function generateId(prefix: string = 'id'): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 0~1 사이 난수 생성
 */
export function random(): number {
    return Math.random();
}

/**
 * min~max 사이 난수 생성
 */
export function randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

/**
 * min~max 사이 정수 난수 생성
 */
export function randomInt(min: number, max: number): number {
    return Math.floor(randomRange(min, max + 1));
}

/**
 * 배열에서 랜덤 요소 선택
 */
export function randomChoice<T>(array: T[]): T | undefined {
    if (array.length === 0) return undefined;
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * 가중치 기반 랜덤 선택
 */
export function weightedChoice<T>(items: T[], weights: number[]): T | undefined {
    if (items.length === 0 || items.length !== weights.length) return undefined;

    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < items.length; i++) {
        random -= weights[i];
        if (random <= 0) return items[i];
    }

    return items[items.length - 1];
}

/**
 * 정규분포 난수 (Box-Muller 변환)
 */
export function randomNormal(mean: number = 0, stdDev: number = 1): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * stdDev;
}

/**
 * 확률 기반 성공 체크
 */
export function rollSuccess(probability: number): boolean {
    return Math.random() < probability;
}


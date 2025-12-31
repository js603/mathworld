/**
 * 수학 함수 모듈
 * 
 * 순수 수학 연산 함수들
 */

/**
 * 값을 min~max 범위로 클램프
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/**
 * 선형 보간
 */
export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/**
 * 역선형 보간 (값이 a~b 범위에서 어디에 있는지)
 */
export function inverseLerp(a: number, b: number, value: number): number {
    if (a === b) return 0;
    return (value - a) / (b - a);
}

/**
 * 시그모이드 함수 (0~1 범위 부드러운 전환)
 */
export function sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
}

/**
 * 부드러운 스텝 (0~1 부드러운 전환)
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

/**
 * 거리 계산 (2D)
 */
export function distance2D(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 각도를 라디안으로 변환
 */
export function degToRad(degrees: number): number {
    return degrees * (Math.PI / 180);
}

/**
 * 라디안을 각도로 변환
 */
export function radToDeg(radians: number): number {
    return radians * (180 / Math.PI);
}

/**
 * 값을 특정 범위로 매핑
 */
export function mapRange(
    value: number,
    inMin: number,
    inMax: number,
    outMin: number,
    outMax: number
): number {
    return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/**
 * 두 값의 평균
 */
export function average(...values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * 표준편차
 */
export function standardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = average(...values);
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(average(...squareDiffs));
}

/**
 * 수치 감쇠 (시간에 따라 0으로 수렴)
 */
export function decay(value: number, rate: number, deltaTime: number = 1): number {
    return value * Math.pow(rate, deltaTime);
}

/**
 * 지수 이동 평균
 */
export function exponentialMovingAverage(
    current: number,
    previous: number,
    alpha: number
): number {
    return alpha * current + (1 - alpha) * previous;
}

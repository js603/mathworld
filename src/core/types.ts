/**
 * 게임 전역 타입 정의
 */

// ============ 기본 타입 ============

export type EntityId = string;

// ============ 인물 관련 ============

/** 성격 (거의 변하지 않음) */
export interface Personality {
    ambition: number;    // 야망 0~1
    loyalty: number;     // 충성심 0~1
    morality: number;    // 도덕성 0~1
    courage: number;     // 용기 0~1
    cunning: number;     // 교활함 0~1
}

/** 감정 (사건에 따라 변화) */
export interface Emotion {
    trust: number;       // 신뢰 0~1
    fear: number;        // 공포 0~1
    anger: number;       // 분노 0~1
    joy: number;         // 기쁨 0~1
    despair: number;     // 절망 0~1
}

/** 해석된 과거 사건 */
export interface InterpretedEvent {
    eventId: EntityId;
    interpretation: string;  // "그는 나를 배신했다" 등
    emotionalImpact: Partial<Emotion>;
    timestamp: number;
}

/** 인물 */
export interface Character {
    id: EntityId;
    name: string;
    title?: string;

    personality: Personality;
    emotion: Emotion;

    location: EntityId;
    resources: number;
    power: number;        // 권력/영향력

    memory: InterpretedEvent[];
    beliefs: Map<string, number>;  // 믿음 (확률)

    isPlayer: boolean;
}

// ============ 관계 ============

export interface Relation {
    trust: number;        // -1 ~ 1
    fear: number;         // 0 ~ 1
    respect: number;      // -1 ~ 1
    debt: number;         // 숫자 (음수 = 빚진 상태)
    secretShared: boolean;
    history: EntityId[];  // 과거 상호작용 이벤트 ID
}

// ============ 장소 ============

export interface Location {
    id: EntityId;
    name: string;
    type: 'city' | 'village' | 'wilderness' | 'dungeon' | 'castle';

    resources: number;
    population: number;
    stability: number;    // 0~1 안정도

    connectedTo: EntityId[];  // 연결된 장소
    owner?: EntityId;         // 소유자 (인물/세력)
}

// ============ 사건 ============

export type EventType =
    | 'dialogue'
    | 'trade'
    | 'combat'
    | 'betrayal'
    | 'alliance'
    | 'death'
    | 'discovery'
    | 'natural_disaster'
    | 'plague'
    | 'war_declared'
    | 'custom';

export interface GameEvent {
    id: EntityId;
    type: EventType;
    timestamp: number;

    participants: EntityId[];
    location: EntityId;

    description: string;
    effects: Effect[];

    isPublic: boolean;    // 모든 캐릭터가 알 수 있는지
    witnesses: EntityId[];
}

// ============ 행동/선택지 ============

export interface Condition {
    type: 'stat' | 'relation' | 'location' | 'resource' | 'event' | 'custom';
    target?: EntityId;
    operator: '>' | '<' | '==' | '>=' | '<=' | '!=';
    value: number | string | boolean;
    field?: string;
}

export interface Effect {
    type: 'emotion' | 'relation' | 'resource' | 'location' | 'event' | 'stat';
    target: EntityId;
    field: string;
    change: number | string | boolean;
    isRelative: boolean;  // true: +5, false: =5
}

export interface Action {
    id: EntityId;
    name: string;
    category: 'dialogue' | 'physical' | 'social' | 'economic' | 'combat';

    conditions: Condition[];
    effects: Effect[];

    baseSuccessRate: number;  // 0~1

    // 효용 계산용 가중치
    weights: {
        selfBenefit: number;
        targetBenefit: number;
        riskFactor: number;
    };
}

export interface Choice {
    id: EntityId;
    text: string;
    action: Action;
    context: string;  // 의미/맥락 (같은 행동도 다른 맥락)

    // 계산된 값 (플레이어에게 직접 보여주지 않음)
    calculatedSuccess?: number;
    calculatedUtility?: number;
}

// ============ 전역 상태 ============

export interface GlobalState {
    warActive: boolean;
    economyIndex: number;     // 0~2 (1=정상)
    plagueActive: boolean;
    season: 'spring' | 'summer' | 'autumn' | 'winter';
    dayOfYear: number;
}

// ============ 불안정 타입 ============

export type InstabilityType =
    | 'power_imbalance'      // 권력 격차
    | 'resource_scarcity'    // 자원 부족
    | 'trust_collapse'       // 신뢰 붕괴
    | 'information_asymmetry' // 정보 비대칭
    | 'fear_spike';          // 공포 급등

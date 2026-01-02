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

// ============ 전투/성장 관련 ============

/** 전투 능력치 */
export interface CombatStats {
    maxHp: number;
    currentHp: number;
    maxMp: number;
    currentMp: number;
    attack: number;
    defense: number;
    speed: number;
    critRate: number;      // 치명타 확률 0~1
    critDamage: number;    // 치명타 배율 (예: 1.5 = 150%)
}

/** 아이템 */
export interface Item {
    id: EntityId;
    name: string;
    type: 'weapon' | 'armor' | 'accessory' | 'consumable';
    description: string;
    stats?: Partial<CombatStats>;
    effect?: {
        type: 'heal' | 'buff' | 'damage';
        value: number;
        duration?: number;
    };
    price: number;
}

/** 장비 */
export interface Equipment {
    weapon?: Item;
    armor?: Item;
    accessory?: Item;
}

/** 스킬 */
export interface Skill {
    id: EntityId;
    name: string;
    type: 'attack' | 'heal' | 'buff' | 'debuff';
    description: string;
    baseDamage?: number;
    healAmount?: number;
    buffStats?: Partial<CombatStats>;
    mpCost: number;
    cooldown: number;
    currentCooldown?: number;
    requiredLevel: number;
    level: number;
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

    // 전투/성장 관련 (선택적)
    stats?: CombatStats;
    equipment?: Equipment;
    skills?: Skill[];
    level?: number;
    experience?: number;
    expToNextLevel?: number;
    statPoints?: number;
    skillPoints?: number;
    inventory?: Item[];
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
    type: 'city' | 'village' | 'wilderness' | 'dungeon' | 'castle' | 'forest' | 'farm' | 'temple' | 'island' | 'building';

    resources: number;
    population: number;
    stability: number;    // 0~1 안정도

    connectedTo: EntityId[];  // 연결된 장소
    owner?: EntityId;         // 소유자 (인물/세력)
    dangerLevel?: number;     // 위험도 0~1 (전투 발생 확률)
    description?: string;     // 장소 설명
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

// ============ 퀘스트 시스템 ============

export type QuestStatus = 'available' | 'active' | 'completed' | 'failed';

export type QuestObjectiveType =
    | 'kill'           // 몬스터 처치
    | 'gather'         // 자원 수집
    | 'deliver'        // 아이템 전달
    | 'talk'           // NPC와 대화
    | 'explore'        // 장소 탐험
    | 'survive';       // 생존

export interface QuestObjective {
    type: QuestObjectiveType;
    target: string;      // 목표 대상 (몬스터명, NPC ID, 장소 ID 등)
    required: number;    // 필요 수량
    current: number;     // 현재 진행도
    description: string; // 목표 설명
}

export interface Quest {
    id: EntityId;
    title: string;
    description: string;
    giver?: EntityId;    // 퀘스트 의뢰인 NPC

    status: QuestStatus;
    objectives: QuestObjective[];

    rewards: {
        exp?: number;
        resources?: number;
        items?: EntityId[];
        reputation?: number;
    };

    level: number;       // 권장 레벨
    timeLimit?: number;  // 턴 제한 (없으면 무제한)
    turnsRemaining?: number;
}


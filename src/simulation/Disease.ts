/**
 * 전염병/역병 시스템
 * 
 * 핵심 모델:
 * - SIR 모델: Susceptible → Infected → Recovered
 *   dS/dt = -βSI
 *   dI/dt = βSI - γI
 *   dR/dt = γI
 * - 네트워크 기반 확산 (관계 그래프 활용)
 */

import { EntityId, Character } from '../core/types';
import { WorldState } from '../core/WorldState';
import { clamp } from '../utils/Math';
import { rollSuccess, randomRange } from '../utils/Random';

/**
 * 질병 상태
 */
export type DiseaseState = 'susceptible' | 'exposed' | 'infected' | 'recovered' | 'dead';

/**
 * 질병 유형
 */
export interface DiseaseType {
    id: string;
    name: string;
    transmissionRate: number;  // β: 전파율
    recoveryRate: number;      // γ: 회복률
    mortalityRate: number;     // 사망률
    incubationPeriod: number;  // 잠복기 (턴)
    immunityDuration: number;  // 면역 지속 (턴, 0 = 영구)
}

/**
 * 개인 건강 상태
 */
export interface HealthStatus {
    characterId: EntityId;
    state: DiseaseState;
    diseaseId: string | null;
    infectedTurn: number;
    exposedTurn: number;
    recoveredTurn: number;
}

/**
 * 역병 통계
 */
export interface PlagueStats {
    susceptible: number;
    exposed: number;
    infected: number;
    recovered: number;
    dead: number;
    r0: number;  // 기초감염재생산수
}

/**
 * 기본 질병 정의
 */
const DEFAULT_DISEASES: DiseaseType[] = [
    {
        id: 'common_cold',
        name: '감기',
        transmissionRate: 0.3,
        recoveryRate: 0.5,
        mortalityRate: 0.001,
        incubationPeriod: 1,
        immunityDuration: 30,
    },
    {
        id: 'plague',
        name: '흑사병',
        transmissionRate: 0.5,
        recoveryRate: 0.1,
        mortalityRate: 0.3,
        incubationPeriod: 3,
        immunityDuration: 365,
    },
    {
        id: 'fever',
        name: '열병',
        transmissionRate: 0.7,    // 전파율 증가 (0.4 → 0.7)
        recoveryRate: 0.1,        // 회복률 감소 (0.3 → 0.1)
        mortalityRate: 0.02,      // 사망률 감소 (0.05 → 0.02)
        incubationPeriod: 1,      // 잠복기 감소 (2 → 1)
        immunityDuration: 60,
    },
];

/**
 * 질병/역병 시스템 클래스
 */
export class Disease {
    private world: WorldState;
    private healthStatuses: Map<EntityId, HealthStatus> = new Map();
    private diseases: Map<string, DiseaseType> = new Map();
    private activeOutbreaks: Set<string> = new Set();

    constructor(world: WorldState) {
        this.world = world;
        this.initializeDiseases();
        this.initializeHealthStatuses();
    }

    private initializeDiseases(): void {
        for (const disease of DEFAULT_DISEASES) {
            this.diseases.set(disease.id, disease);
        }
    }

    private initializeHealthStatuses(): void {
        const characters = this.world.getAllCharacters();
        for (const character of characters) {
            this.healthStatuses.set(character.id, {
                characterId: character.id,
                state: 'susceptible',
                diseaseId: null,
                infectedTurn: 0,
                exposedTurn: 0,
                recoveredTurn: 0,
            });
        }
    }

    /**
     * 질병 시뮬레이션 업데이트 (매 턴)
     */
    update(): void {
        const currentTurn = this.world.time;

        for (const [characterId, status] of this.healthStatuses) {
            this.updateIndividualHealth(characterId, status, currentTurn);
        }

        // 질병 확산
        this.spreadDisease();

        // 전역 상태 업데이트
        this.updateGlobalPlagueState();
    }

    /**
     * 개인 건강 상태 업데이트
     */
    private updateIndividualHealth(characterId: EntityId, status: HealthStatus, currentTurn: number): void {
        if (!status.diseaseId) return;

        const disease = this.diseases.get(status.diseaseId);
        if (!disease) return;

        switch (status.state) {
            case 'exposed':
                // 잠복기 경과 → 감염
                if (currentTurn - status.exposedTurn >= disease.incubationPeriod) {
                    status.state = 'infected';
                    status.infectedTurn = currentTurn;
                }
                break;

            case 'infected':
                // 회복 또는 사망
                if (rollSuccess(disease.recoveryRate)) {
                    status.state = 'recovered';
                    status.recoveredTurn = currentTurn;
                } else if (rollSuccess(disease.mortalityRate)) {
                    status.state = 'dead';
                    this.handleDeath(characterId);
                }
                break;

            case 'recovered':
                // 면역 소실
                if (disease.immunityDuration > 0) {
                    if (currentTurn - status.recoveredTurn >= disease.immunityDuration) {
                        status.state = 'susceptible';
                        status.diseaseId = null;
                    }
                }
                break;
        }
    }

    /**
     * 질병 확산 (SIR + 네트워크)
     */
    private spreadDisease(): void {
        const characters = this.world.getAllCharacters();
        const newInfections: Array<{ characterId: EntityId; diseaseId: string }> = [];

        for (const character of characters) {
            const status = this.healthStatuses.get(character.id);
            if (!status || status.state !== 'infected') continue;

            const disease = this.diseases.get(status.diseaseId || '');
            if (!disease) continue;

            // 같은 장소에 있는 사람들에게 전파
            const nearbyCharacters = this.world.getCharactersAt(character.location);

            for (const nearby of nearbyCharacters) {
                if (nearby.id === character.id) continue;

                const nearbyStatus = this.healthStatuses.get(nearby.id);
                if (!nearbyStatus || nearbyStatus.state !== 'susceptible') continue;

                // 전파 확률 = β × 접촉 정도
                const relation = this.world.relations.getRelation(character.id, nearby.id);
                const contactFactor = 0.5 + (relation.trust + 1) * 0.25; // 친밀할수록 접촉 많음

                if (rollSuccess(disease.transmissionRate * contactFactor)) {
                    newInfections.push({ characterId: nearby.id, diseaseId: disease.id });
                }
            }
        }

        // 새 감염 적용
        for (const { characterId, diseaseId } of newInfections) {
            this.infect(characterId, diseaseId);
        }
    }

    /**
     * 감염 처리
     */
    infect(characterId: EntityId, diseaseId: string): boolean {
        const status = this.healthStatuses.get(characterId);
        if (!status || status.state !== 'susceptible') return false;

        status.state = 'exposed';
        status.diseaseId = diseaseId;
        status.exposedTurn = this.world.time;

        this.activeOutbreaks.add(diseaseId);
        return true;
    }

    /**
     * 사망 처리
     */
    private handleDeath(characterId: EntityId): void {
        // 게임에서 캐릭터 사망 이벤트 처리
        // (WorldState에서 캐릭터 제거는 하지 않고 상태만 표시)
    }

    /**
     * 전역 역병 상태 업데이트
     */
    private updateGlobalPlagueState(): void {
        const stats = this.getStats();

        // 감염자가 일정 수 이상이면 전역 역병 상태
        const totalPopulation = stats.susceptible + stats.exposed + stats.infected + stats.recovered;
        const infectionRate = (stats.exposed + stats.infected) / Math.max(1, totalPopulation);

        this.world.updateGlobalState({
            plagueActive: infectionRate > 0.1,
        });
    }

    /**
     * 역병 발생 (강제)
     */
    startOutbreak(diseaseId: string, initialCarrierId?: EntityId): boolean {
        const disease = this.diseases.get(diseaseId);
        if (!disease) return false;

        // 초기 감염자 선택
        let carrier = initialCarrierId;
        if (!carrier) {
            const characters = this.world.getAllCharacters();
            const susceptible = characters.filter(c => {
                const status = this.healthStatuses.get(c.id);
                return status?.state === 'susceptible';
            });
            if (susceptible.length > 0) {
                carrier = susceptible[Math.floor(Math.random() * susceptible.length)].id;
            }
        }

        if (carrier) {
            return this.infect(carrier, diseaseId);
        }

        return false;
    }

    /**
     * 치료 시도
     */
    treat(characterId: EntityId, effectiveness: number = 0.5): boolean {
        const status = this.healthStatuses.get(characterId);
        if (!status || status.state !== 'infected') return false;

        if (rollSuccess(effectiveness)) {
            status.state = 'recovered';
            status.recoveredTurn = this.world.time;
            return true;
        }

        return false;
    }

    /**
     * 건강 상태 조회
     */
    getHealthStatus(characterId: EntityId): HealthStatus | null {
        return this.healthStatuses.get(characterId) || null;
    }

    /**
     * 통계
     */
    getStats(): PlagueStats {
        let susceptible = 0;
        let exposed = 0;
        let infected = 0;
        let recovered = 0;
        let dead = 0;

        for (const status of this.healthStatuses.values()) {
            switch (status.state) {
                case 'susceptible': susceptible++; break;
                case 'exposed': exposed++; break;
                case 'infected': infected++; break;
                case 'recovered': recovered++; break;
                case 'dead': dead++; break;
            }
        }

        // R0 계산 (간략화)
        let r0 = 0;
        for (const diseaseId of this.activeOutbreaks) {
            const disease = this.diseases.get(diseaseId);
            if (disease) {
                r0 = Math.max(r0, disease.transmissionRate / disease.recoveryRate);
            }
        }

        return { susceptible, exposed, infected, recovered, dead, r0 };
    }

    /**
     * 역병 상황 설명
     */
    describe(): string {
        const stats = this.getStats();
        const total = stats.susceptible + stats.exposed + stats.infected + stats.recovered;

        if (stats.infected === 0 && stats.exposed === 0) {
            return '현재 질병이 유행하고 있지 않다.';
        }

        const infectionRate = ((stats.infected + stats.exposed) / total * 100).toFixed(1);

        let severity = '';
        if (stats.infected > total * 0.3) {
            severity = '역병이 창궐하고 있다!';
        } else if (stats.infected > total * 0.1) {
            severity = '질병이 퍼지고 있다.';
        } else {
            severity = '일부 지역에서 질병이 발생했다.';
        }

        return `${severity} (감염률: ${infectionRate}%, 사망: ${stats.dead}명)`;
    }

    /**
     * 새 캐릭터 등록
     */
    registerCharacter(characterId: EntityId): void {
        if (!this.healthStatuses.has(characterId)) {
            this.healthStatuses.set(characterId, {
                characterId,
                state: 'susceptible',
                diseaseId: null,
                infectedTurn: 0,
                exposedTurn: 0,
                recoveredTurn: 0,
            });
        }
    }
}

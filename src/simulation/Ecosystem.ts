/**
 * 생태계 시뮬레이션
 * 
 * 핵심 모델:
 * - Lotka-Volterra 방정식: 포식자-피식자 관계
 *   dN/dt = rN - aNP (피식자)
 *   dP/dt = baNP - mP (포식자)
 * - 로지스틱 성장: dN/dt = rN(1 - N/K)
 */

import { EntityId, Location } from '../core/types';
import { WorldState } from '../core/WorldState';
import { clamp } from '../utils/Math';
import { randomRange, rollSuccess } from '../utils/Random';

/**
 * 생물 유형
 */
export type CreatureType = 'prey' | 'predator' | 'plant';

/**
 * 생물 종
 */
export interface Species {
    id: string;
    name: string;
    type: CreatureType;
    population: number;
    growthRate: number;        // r: 내재 성장률
    carryingCapacity: number;  // K: 환경 수용력
    predationRate?: number;    // a: 포식률 (포식자만)
    conversionRate?: number;   // b: 전환 효율 (포식자만)
    mortalityRate?: number;    // m: 사망률
}

/**
 * 생태계 (장소별)
 */
export interface Ecosystem {
    locationId: EntityId;
    species: Map<string, Species>;
    resources: number;         // 기초 자원 (햇빛, 물 등)
    stability: number;         // 생태계 안정성 0~1
}

/**
 * 생태계 시뮬레이션 클래스
 */
export class EcosystemSimulation {
    private world: WorldState;
    private ecosystems: Map<EntityId, Ecosystem> = new Map();

    constructor(world: WorldState) {
        this.world = world;
        this.initializeEcosystems();
    }

    /**
     * 생태계 초기화
     */
    private initializeEcosystems(): void {
        const locations = this.world.getAllLocations();

        for (const location of locations) {
            if (location.type === 'wilderness' || location.type === 'village') {
                this.ecosystems.set(location.id, this.createEcosystem(location));
            }
        }
    }

    private createEcosystem(location: Location): Ecosystem {
        const species = new Map<string, Species>();

        // 기본 종 추가
        species.set('grass', {
            id: 'grass',
            name: '풀',
            type: 'plant',
            population: 1000,
            growthRate: 0.1,
            carryingCapacity: 2000,
        });

        species.set('deer', {
            id: 'deer',
            name: '사슴',
            type: 'prey',
            population: 150,          // 초기 개체수 증가 (100 → 150)
            growthRate: 0.15,         // 성장률 증가 (0.05 → 0.15)
            carryingCapacity: 500,
        });

        species.set('wolf', {
            id: 'wolf',
            name: '늑대',
            type: 'predator',
            population: 40,           // 초기 개체수 증가 (30 → 40)
            growthRate: 0.01,         // 약간의 자연 성장 추가
            carryingCapacity: 100,
            predationRate: 0.005,     // 포식률 증가 (0.003 → 0.005)
            conversionRate: 0.15,     // 전환율 대폭 증가 (0.08 → 0.15)
            mortalityRate: 0.02,      // 사망률 감소 (0.03 → 0.02)
        });

        // 던전에는 몬스터 추가
        if (location.type === 'dungeon' || location.id === 'dungeon') {
            species.set('goblin', {
                id: 'goblin',
                name: '고블린',
                type: 'predator',
                population: 30,
                growthRate: 0.02,
                carryingCapacity: 100,
                predationRate: 0.005,
                conversionRate: 0.01,
                mortalityRate: 0.05,
            });
        }

        return {
            locationId: location.id,
            species,
            resources: location.resources,
            stability: location.stability,
        };
    }

    /**
     * 생태계 업데이트 (매 턴)
     */
    update(): void {
        for (const ecosystem of this.ecosystems.values()) {
            this.updateEcosystem(ecosystem);
        }
    }

    /**
     * 개별 생태계 업데이트
     */
    private updateEcosystem(ecosystem: Ecosystem): void {
        const season = this.world.globalState.season;

        // 계절에 따른 자원 변동
        let resourceMultiplier = 1;
        switch (season) {
            case 'spring': resourceMultiplier = 1.2; break;
            case 'summer': resourceMultiplier = 1.0; break;
            case 'autumn': resourceMultiplier = 0.8; break;
            case 'winter': resourceMultiplier = 0.5; break;
        }

        // 식물 성장 (로지스틱 모델)
        const plants = Array.from(ecosystem.species.values()).filter(s => s.type === 'plant');
        for (const plant of plants) {
            this.updateLogisticGrowth(plant, resourceMultiplier);
        }

        // 피식자 성장
        const preys = Array.from(ecosystem.species.values()).filter(s => s.type === 'prey');
        const predators = Array.from(ecosystem.species.values()).filter(s => s.type === 'predator');

        for (const prey of preys) {
            this.updatePreyPopulation(prey, predators, plants);
        }

        // 포식자 성장 (Lotka-Volterra)
        for (const predator of predators) {
            this.updatePredatorPopulation(predator, preys);
        }

        // 생태계 안정성 계산
        this.updateStability(ecosystem);
    }

    /**
     * 로지스틱 성장 모델
     * dN/dt = rN(1 - N/K)
     */
    private updateLogisticGrowth(species: Species, resourceMultiplier: number): void {
        const N = species.population;
        const r = species.growthRate * resourceMultiplier;
        const K = species.carryingCapacity;

        const growth = r * N * (1 - N / K);
        species.population = Math.max(0, N + growth);
    }

    /**
     * 피식자 개체수 업데이트
     * dN/dt = rN - Σ(aNP) for each predator
     */
    private updatePreyPopulation(prey: Species, predators: Species[], plants: Species[]): void {
        const N = prey.population;

        // 자연 성장 (식물 자원에 의존)
        const plantBiomass = plants.reduce((sum, p) => sum + p.population, 0);
        const foodAvailability = Math.min(1, plantBiomass / 1000);
        const naturalGrowth = prey.growthRate * N * foodAvailability;

        // 포식 손실
        let predationLoss = 0;
        for (const predator of predators) {
            const a = predator.predationRate || 0;
            predationLoss += a * N * predator.population;
        }

        prey.population = Math.max(0, N + naturalGrowth - predationLoss);

        // 식물 소비
        for (const plant of plants) {
            plant.population = Math.max(0, plant.population - N * 0.01);
        }
    }

    /**
     * 포식자 개체수 업데이트
     * dP/dt = baNP - mP
     */
    private updatePredatorPopulation(predator: Species, preys: Species[]): void {
        const P = predator.population;
        const a = predator.predationRate || 0;
        const b = predator.conversionRate || 0;
        const m = predator.mortalityRate || 0.1;

        // 포식으로 인한 성장
        let growth = 0;
        for (const prey of preys) {
            growth += b * a * prey.population * P;
        }

        // 자연 사망
        const death = m * P;

        predator.population = Math.max(0, P + growth - death);
    }

    /**
     * 생태계 안정성 업데이트
     */
    private updateStability(ecosystem: Ecosystem): void {
        const species = Array.from(ecosystem.species.values());

        // 멸종 위기 종 확인
        const endangered = species.filter(s => s.population < s.carryingCapacity * 0.1).length;
        const overpopulated = species.filter(s => s.population > s.carryingCapacity * 0.9).length;

        // 안정성 = 1 - (문제 종 비율)
        ecosystem.stability = clamp(
            1 - (endangered + overpopulated) / (species.length || 1) * 0.5,
            0,
            1
        );
    }

    /**
     * 사냥 (플레이어/NPC가 생물 사냥)
     */
    hunt(locationId: EntityId, speciesId: string, quantity: number): { success: boolean; caught: number } {
        const ecosystem = this.ecosystems.get(locationId);
        if (!ecosystem) return { success: false, caught: 0 };

        const species = ecosystem.species.get(speciesId);
        if (!species || species.type === 'plant') return { success: false, caught: 0 };

        const available = species.population;
        const caught = Math.min(quantity, available * 0.1); // 최대 10%만 사냥 가능

        if (caught < 1) return { success: false, caught: 0 };

        species.population -= caught;
        return { success: true, caught: Math.floor(caught) };
    }

    /**
     * 특정 장소의 생태계 정보
     */
    getEcosystemInfo(locationId: EntityId): {
        species: Array<{ name: string; population: number; type: CreatureType }>;
        stability: number;
    } | null {
        const ecosystem = this.ecosystems.get(locationId);
        if (!ecosystem) return null;

        return {
            species: Array.from(ecosystem.species.values()).map(s => ({
                name: s.name,
                population: Math.floor(s.population),
                type: s.type,
            })),
            stability: ecosystem.stability,
        };
    }

    /**
     * 전체 생태계 요약
     */
    getSummary(): {
        totalLocations: number;
        avgStability: number;
        endangeredSpecies: string[];
    } {
        let totalStability = 0;
        const endangered: string[] = [];

        for (const ecosystem of this.ecosystems.values()) {
            totalStability += ecosystem.stability;

            for (const species of ecosystem.species.values()) {
                if (species.population < species.carryingCapacity * 0.1 && species.population > 0) {
                    if (!endangered.includes(species.name)) {
                        endangered.push(species.name);
                    }
                }
            }
        }

        return {
            totalLocations: this.ecosystems.size,
            avgStability: this.ecosystems.size > 0 ? totalStability / this.ecosystems.size : 1,
            endangeredSpecies: endangered,
        };
    }
}

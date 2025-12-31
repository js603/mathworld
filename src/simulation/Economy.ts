/**
 * 경제 시뮬레이션 시스템
 * 
 * 핵심 모델:
 * - 수요-공급 법칙: Price = BasePrice × (Demand/Supply)^elasticity
 * - 인플레이션: M × V = P × Q (화폐수량설)
 * - 지역별 시장 연동
 */

import { EntityId, Location } from '../core/types';
import { WorldState } from '../core/WorldState';
import { clamp, lerp } from '../utils/Math';
import { randomRange, rollSuccess } from '../utils/Random';

/**
 * 상품 유형
 */
export type GoodsType = 'food' | 'weapons' | 'luxury' | 'materials' | 'medicine';

/**
 * 시장 정보
 */
export interface Market {
    locationId: EntityId;
    prices: Map<GoodsType, number>;
    supply: Map<GoodsType, number>;
    demand: Map<GoodsType, number>;
    tradeVolume: number;
}

/**
 * 기본 가격
 */
const BASE_PRICES: Record<GoodsType, number> = {
    food: 10,
    weapons: 50,
    luxury: 100,
    materials: 20,
    medicine: 30,
};

/**
 * 경제 시스템 클래스
 */
export class Economy {
    private world: WorldState;
    private markets: Map<EntityId, Market> = new Map();
    private globalMoneySupply: number = 100000;
    private inflationRate: number = 0;

    constructor(world: WorldState) {
        this.world = world;
        this.initializeMarkets();
    }

    /**
     * 시장 초기화
     */
    private initializeMarkets(): void {
        const locations = this.world.getAllLocations();

        for (const location of locations) {
            if (location.type === 'city' || location.type === 'village') {
                this.markets.set(location.id, this.createMarket(location));
            }
        }
    }

    private createMarket(location: Location): Market {
        const prices = new Map<GoodsType, number>();
        const supply = new Map<GoodsType, number>();
        const demand = new Map<GoodsType, number>();

        const goodsTypes: GoodsType[] = ['food', 'weapons', 'luxury', 'materials', 'medicine'];

        for (const goods of goodsTypes) {
            prices.set(goods, BASE_PRICES[goods]);

            // 장소 유형에 따른 초기 공급/수요
            const baseSupply = location.type === 'city' ? 100 : 30;
            const baseDemand = location.population / 100;

            supply.set(goods, baseSupply * randomRange(0.8, 1.2));
            demand.set(goods, baseDemand * randomRange(0.8, 1.2));
        }

        return {
            locationId: location.id,
            prices,
            supply,
            demand,
            tradeVolume: 0,
        };
    }

    /**
     * 경제 시뮬레이션 업데이트 (매 턴)
     */
    update(): void {
        this.updatePrices();
        this.updateSupplyDemand();
        this.calculateInflation();
        this.updateTradeRoutes();
    }

    /**
     * 가격 업데이트 (수요-공급 법칙)
     * Price = BasePrice × (Demand/Supply)^elasticity
     */
    private updatePrices(): void {
        const elasticity = 0.3; // 가격 탄력성

        for (const market of this.markets.values()) {
            for (const [goods, basePrice] of Object.entries(BASE_PRICES)) {
                const goodsType = goods as GoodsType;
                const supply = market.supply.get(goodsType) || 1;
                const demand = market.demand.get(goodsType) || 1;

                // 수요-공급 비율에 따른 가격 조정
                const ratio = demand / Math.max(1, supply);
                const priceMultiplier = Math.pow(ratio, elasticity);

                // 인플레이션 반영
                const inflationMultiplier = 1 + this.inflationRate;

                const newPrice = basePrice * priceMultiplier * inflationMultiplier;
                market.prices.set(goodsType, clamp(newPrice, basePrice * 0.5, basePrice * 3));
            }
        }
    }

    /**
     * 공급/수요 업데이트
     */
    private updateSupplyDemand(): void {
        for (const market of this.markets.values()) {
            const location = this.world.getLocation(market.locationId);
            if (!location) continue;

            for (const goods of ['food', 'weapons', 'luxury', 'materials', 'medicine'] as GoodsType[]) {
                // 공급 재생 (생산)
                const production = this.calculateProduction(location, goods);
                const currentSupply = market.supply.get(goods) || 0;
                market.supply.set(goods, currentSupply + production);

                // 수요 변화 (인구, 계절, 이벤트 기반)
                const demandChange = this.calculateDemandChange(location, goods);
                const currentDemand = market.demand.get(goods) || 0;
                market.demand.set(goods, Math.max(0, currentDemand + demandChange));

                // 소비 (공급 감소)
                const consumption = Math.min(currentSupply, currentDemand * 0.1);
                market.supply.set(goods, Math.max(0, currentSupply - consumption));
            }
        }
    }

    private calculateProduction(location: Location, goods: GoodsType): number {
        const baseProduction = location.resources / 100;

        // 상품별 생산 계수
        const productionFactors: Record<GoodsType, number> = {
            food: location.type === 'village' ? 2 : 0.5,
            weapons: location.type === 'city' ? 1 : 0.2,
            luxury: location.type === 'city' ? 1 : 0,
            materials: 1,
            medicine: 0.5,
        };

        return baseProduction * productionFactors[goods] * randomRange(0.8, 1.2);
    }

    private calculateDemandChange(location: Location, goods: GoodsType): number {
        const populationFactor = location.population / 10000;
        const season = this.world.globalState.season;

        // 계절별 수요 변화
        let seasonalFactor = 1;
        if (goods === 'food') {
            seasonalFactor = season === 'winter' ? 1.5 : 1;
        }
        if (goods === 'medicine' && this.world.globalState.plagueActive) {
            seasonalFactor = 3;
        }

        return populationFactor * seasonalFactor * randomRange(-0.5, 0.5);
    }

    /**
     * 인플레이션 계산
     */
    private calculateInflation(): void {
        // 단순화된 화폐수량설: 통화량 증가 → 물가 상승
        const economyIndex = this.world.globalState.economyIndex;

        if (economyIndex < 1) {
            this.inflationRate = lerp(this.inflationRate, 0.1, 0.1);
        } else {
            this.inflationRate = lerp(this.inflationRate, 0, 0.1);
        }

        this.inflationRate = clamp(this.inflationRate, -0.1, 0.5);
    }

    /**
     * 교역로 업데이트 (지역 간 가격 차이 조정)
     */
    private updateTradeRoutes(): void {
        const locations = this.world.getAllLocations();

        for (const location of locations) {
            const market = this.markets.get(location.id);
            if (!market) continue;

            for (const connectedId of location.connectedTo) {
                const connectedMarket = this.markets.get(connectedId);
                if (!connectedMarket) continue;

                // 가격 차이가 크면 상품 이동
                for (const goods of ['food', 'weapons', 'luxury', 'materials', 'medicine'] as GoodsType[]) {
                    const price1 = market.prices.get(goods) || 0;
                    const price2 = connectedMarket.prices.get(goods) || 0;

                    if (price1 > price2 * 1.3) {
                        // 가격이 낮은 곳에서 높은 곳으로 상품 이동
                        const transfer = 5;
                        const supply2 = connectedMarket.supply.get(goods) || 0;
                        if (supply2 > transfer) {
                            connectedMarket.supply.set(goods, supply2 - transfer);
                            market.supply.set(goods, (market.supply.get(goods) || 0) + transfer);
                            market.tradeVolume += transfer;
                        }
                    }
                }
            }
        }
    }

    /**
     * 특정 시장의 가격 조회
     */
    getPrice(locationId: EntityId, goods: GoodsType): number {
        return this.markets.get(locationId)?.prices.get(goods) || BASE_PRICES[goods];
    }

    /**
     * 구매 처리
     */
    buy(locationId: EntityId, goods: GoodsType, quantity: number): { success: boolean; cost: number } {
        const market = this.markets.get(locationId);
        if (!market) return { success: false, cost: 0 };

        const supply = market.supply.get(goods) || 0;
        if (supply < quantity) return { success: false, cost: 0 };

        const price = market.prices.get(goods) || BASE_PRICES[goods];
        const cost = price * quantity;

        market.supply.set(goods, supply - quantity);
        market.demand.set(goods, (market.demand.get(goods) || 0) + quantity * 0.5);

        return { success: true, cost };
    }

    /**
     * 판매 처리
     */
    sell(locationId: EntityId, goods: GoodsType, quantity: number): { success: boolean; revenue: number } {
        const market = this.markets.get(locationId);
        if (!market) return { success: false, revenue: 0 };

        const price = market.prices.get(goods) || BASE_PRICES[goods];
        const revenue = price * quantity * 0.8; // 판매 수수료 20%

        market.supply.set(goods, (market.supply.get(goods) || 0) + quantity);

        return { success: true, revenue };
    }

    /**
     * 경제 상태 요약
     */
    getSummary(): { avgPrices: Record<GoodsType, number>; inflationRate: number; marketCount: number } {
        const goodsTypes: GoodsType[] = ['food', 'weapons', 'luxury', 'materials', 'medicine'];
        const avgPrices = {} as Record<GoodsType, number>;

        for (const goods of goodsTypes) {
            let total = 0;
            let count = 0;
            for (const market of this.markets.values()) {
                total += market.prices.get(goods) || 0;
                count++;
            }
            avgPrices[goods] = count > 0 ? total / count : BASE_PRICES[goods];
        }

        return {
            avgPrices,
            inflationRate: this.inflationRate,
            marketCount: this.markets.size,
        };
    }
}

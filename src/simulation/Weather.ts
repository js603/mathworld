/**
 * 날씨 시스템
 * 
 * 핵심 모델:
 * - 마르코프 체인: 상태 전이 확률 행렬
 * - 사인파 조합: 계절/일교차 변화
 * - 기온 = 기본기온 + 계절진폭 × sin(2π × 일수/365) + 일교차 × sin(2π × 시간/24)
 */

import { EntityId, Location } from '../core/types';
import { WorldState } from '../core/WorldState';
import { clamp } from '../utils/Math';
import { randomChoice, rollSuccess, randomRange } from '../utils/Random';

/**
 * 날씨 유형
 */
export type WeatherType = 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';

/**
 * 날씨 상태
 */
export interface WeatherState {
    type: WeatherType;
    temperature: number;      // 섭씨
    humidity: number;         // 0~1
    windSpeed: number;        // km/h
    visibility: number;       // 0~1 (1 = 완전 clear)
    duration: number;         // 지속 시간 (턴)
}

/**
 * 마르코프 전이 확률 행렬
 * [현재 날씨][다음 날씨] = 확률
 */
const TRANSITION_MATRIX: Record<WeatherType, Record<WeatherType, number>> = {
    clear: { clear: 0.6, cloudy: 0.3, rain: 0.05, storm: 0.01, snow: 0.02, fog: 0.02 },
    cloudy: { clear: 0.3, cloudy: 0.4, rain: 0.2, storm: 0.05, snow: 0.03, fog: 0.02 },
    rain: { clear: 0.1, cloudy: 0.3, rain: 0.4, storm: 0.15, snow: 0.02, fog: 0.03 },
    storm: { clear: 0.05, cloudy: 0.2, rain: 0.5, storm: 0.2, snow: 0.02, fog: 0.03 },
    snow: { clear: 0.2, cloudy: 0.3, rain: 0.05, storm: 0.02, snow: 0.4, fog: 0.03 },
    fog: { clear: 0.4, cloudy: 0.3, rain: 0.1, storm: 0.02, snow: 0.03, fog: 0.15 },
};

/**
 * 계절별 기본 기온
 */
const SEASONAL_TEMPS: Record<string, { base: number; amplitude: number }> = {
    spring: { base: 15, amplitude: 10 },
    summer: { base: 25, amplitude: 8 },
    autumn: { base: 12, amplitude: 12 },
    winter: { base: -2, amplitude: 15 },
};

/**
 * 날씨 시스템 클래스
 */
export class Weather {
    private world: WorldState;
    private weatherByLocation: Map<EntityId, WeatherState> = new Map();
    private globalWeather: WeatherState;

    constructor(world: WorldState) {
        this.world = world;
        this.globalWeather = this.createInitialWeather();
        this.initializeLocations();
    }

    private createInitialWeather(): WeatherState {
        return {
            type: 'clear',
            temperature: 20,
            humidity: 0.5,
            windSpeed: 10,
            visibility: 1,
            duration: 3,
        };
    }

    private initializeLocations(): void {
        const locations = this.world.getAllLocations();
        for (const location of locations) {
            this.weatherByLocation.set(location.id, { ...this.globalWeather });
        }
    }

    /**
     * 날씨 업데이트 (매 턴)
     */
    update(): void {
        // 전역 날씨 상태 전이
        this.updateGlobalWeather();

        // 지역별 변동 적용
        for (const [locationId, weather] of this.weatherByLocation) {
            this.updateLocalWeather(locationId, weather);
        }
    }

    /**
     * 마르코프 체인 기반 날씨 전이
     */
    private updateGlobalWeather(): void {
        this.globalWeather.duration--;

        if (this.globalWeather.duration <= 0) {
            // 새 날씨로 전이
            this.globalWeather.type = this.getNextWeatherType(this.globalWeather.type);
            this.globalWeather.duration = Math.floor(randomRange(2, 6));
        }

        // 기온 계산
        this.globalWeather.temperature = this.calculateTemperature();

        // 날씨 유형별 속성 조정
        this.adjustWeatherProperties(this.globalWeather);
    }

    /**
     * 마르코프 체인 전이
     */
    private getNextWeatherType(current: WeatherType): WeatherType {
        const transitions = TRANSITION_MATRIX[current];
        const season = this.world.globalState.season;

        // 계절 보정
        const adjusted = { ...transitions };
        if (season === 'winter') {
            adjusted.snow = (adjusted.snow || 0) * 3;
            adjusted.rain = (adjusted.rain || 0) * 0.5;
        }
        if (season === 'summer') {
            adjusted.snow = 0;
            adjusted.storm = (adjusted.storm || 0) * 1.5;
        }

        // 정규화
        const total = Object.values(adjusted).reduce((sum, p) => sum + p, 0);

        // 확률적 선택
        let random = Math.random() * total;
        for (const [weather, prob] of Object.entries(adjusted)) {
            random -= prob;
            if (random <= 0) {
                return weather as WeatherType;
            }
        }

        return 'clear';
    }

    /**
     * 기온 계산 (사인파 조합)
     * 기온 = 기본기온 + 계절진폭 × sin(2π × 일수/365)
     */
    private calculateTemperature(): number {
        const season = this.world.globalState.season;
        const dayOfYear = this.world.globalState.dayOfYear;

        const { base, amplitude } = SEASONAL_TEMPS[season];

        // 연간 사인파
        const annualVariation = amplitude * Math.sin(2 * Math.PI * dayOfYear / 365);

        // 일교차 (랜덤 요소)
        const dailyVariation = randomRange(-5, 5);

        // 날씨 유형에 따른 보정
        let weatherMod = 0;
        switch (this.globalWeather.type) {
            case 'rain': weatherMod = -3; break;
            case 'storm': weatherMod = -5; break;
            case 'snow': weatherMod = -10; break;
            case 'clear': weatherMod = 2; break;
        }

        return base + annualVariation + dailyVariation + weatherMod;
    }

    /**
     * 날씨 유형별 속성 조정
     */
    private adjustWeatherProperties(weather: WeatherState): void {
        switch (weather.type) {
            case 'clear':
                weather.humidity = randomRange(0.3, 0.5);
                weather.windSpeed = randomRange(5, 15);
                weather.visibility = 1;
                break;
            case 'cloudy':
                weather.humidity = randomRange(0.5, 0.7);
                weather.windSpeed = randomRange(10, 20);
                weather.visibility = 0.8;
                break;
            case 'rain':
                weather.humidity = randomRange(0.7, 0.9);
                weather.windSpeed = randomRange(15, 30);
                weather.visibility = 0.5;
                break;
            case 'storm':
                weather.humidity = randomRange(0.8, 1);
                weather.windSpeed = randomRange(40, 80);
                weather.visibility = 0.2;
                break;
            case 'snow':
                weather.humidity = randomRange(0.6, 0.8);
                weather.windSpeed = randomRange(10, 25);
                weather.visibility = 0.4;
                break;
            case 'fog':
                weather.humidity = randomRange(0.9, 1);
                weather.windSpeed = randomRange(0, 5);
                weather.visibility = 0.1;
                break;
        }
    }

    /**
     * 지역별 날씨 변동
     */
    private updateLocalWeather(locationId: EntityId, weather: WeatherState): void {
        const location = this.world.getLocation(locationId);
        if (!location) return;

        // 기본적으로 전역 날씨 따르되 약간의 변동
        weather.type = this.globalWeather.type;
        weather.temperature = this.globalWeather.temperature + randomRange(-3, 3);
        weather.humidity = clamp(this.globalWeather.humidity + randomRange(-0.1, 0.1), 0, 1);
        weather.windSpeed = Math.max(0, this.globalWeather.windSpeed + randomRange(-5, 5));
        weather.visibility = clamp(this.globalWeather.visibility + randomRange(-0.1, 0.1), 0, 1);

        // 장소 유형별 보정
        if (location.type === 'dungeon') {
            weather.type = 'clear'; // 던전은 실내
            weather.windSpeed = 0;
            weather.temperature = 15; // 일정한 온도
        }
    }

    /**
     * 특정 장소의 날씨 조회
     */
    getWeather(locationId: EntityId): WeatherState {
        return this.weatherByLocation.get(locationId) || this.globalWeather;
    }

    /**
     * 날씨 효과 (게임플레이 영향)
     */
    getEffects(locationId: EntityId): {
        combatModifier: number;     // 전투 효율 (1 = 정상)
        travelModifier: number;     // 이동 효율
        visibilityModifier: number; // 탐지 효율
        healthRisk: boolean;        // 건강 위험
    } {
        const weather = this.getWeather(locationId);

        let combatModifier = 1;
        let travelModifier = 1;
        let visibilityModifier = weather.visibility;
        let healthRisk = false;

        switch (weather.type) {
            case 'rain':
                combatModifier = 0.9;
                travelModifier = 0.8;
                break;
            case 'storm':
                combatModifier = 0.7;
                travelModifier = 0.5;
                healthRisk = true;
                break;
            case 'snow':
                combatModifier = 0.85;
                travelModifier = 0.6;
                if (weather.temperature < -10) healthRisk = true;
                break;
            case 'fog':
                combatModifier = 0.9;
                travelModifier = 0.7;
                break;
        }

        // 극한 기온
        if (weather.temperature > 35 || weather.temperature < -15) {
            healthRisk = true;
        }

        return { combatModifier, travelModifier, visibilityModifier, healthRisk };
    }

    /**
     * 날씨 설명 텍스트
     */
    describe(locationId: EntityId): string {
        const weather = this.getWeather(locationId);

        const typeDescriptions: Record<WeatherType, string> = {
            clear: '맑은 하늘이 펼쳐져 있다.',
            cloudy: '구름이 하늘을 덮고 있다.',
            rain: '비가 내리고 있다.',
            storm: '폭풍이 몰아치고 있다.',
            snow: '눈이 내리고 있다.',
            fog: '짙은 안개가 끼어 있다.',
        };

        const tempDesc = weather.temperature > 30 ? '무더운' :
            weather.temperature > 20 ? '따뜻한' :
                weather.temperature > 10 ? '선선한' :
                    weather.temperature > 0 ? '쌀쌀한' :
                        '얼어붙을 듯 추운';

        return `${typeDescriptions[weather.type]} ${tempDesc} 날씨다. (${weather.temperature.toFixed(0)}°C)`;
    }

    /**
     * 전역 날씨 요약
     */
    getSummary(): {
        globalType: WeatherType;
        avgTemperature: number;
        forecast: WeatherType[];
    } {
        // 간단한 예보 (다음 3턴)
        const forecast: WeatherType[] = [];
        let currentType = this.globalWeather.type;

        for (let i = 0; i < 3; i++) {
            currentType = this.getNextWeatherType(currentType);
            forecast.push(currentType);
        }

        return {
            globalType: this.globalWeather.type,
            avgTemperature: this.globalWeather.temperature,
            forecast,
        };
    }
}

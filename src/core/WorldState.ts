/**
 * 세계 상태 관리 모듈
 * 
 * 핵심 개념: S_t = (Characters, Locations, Relations, Events, Globals)
 * 세계는 한 순간에 하나의 상태 벡터로 표현됨
 */

import {
    EntityId,
    Character,
    Location,
    GameEvent,
    GlobalState,
    Effect,
} from './types';
import { RelationGraph } from './RelationGraph';

export class WorldState {
    private _time: number = 0;
    private _characters: Map<EntityId, Character> = new Map();
    private _locations: Map<EntityId, Location> = new Map();
    private _relations: RelationGraph;
    private _history: GameEvent[] = [];
    private _globalState: GlobalState;

    constructor() {
        this._relations = new RelationGraph();
        this._globalState = {
            warActive: false,
            economyIndex: 1.0,
            plagueActive: false,
            season: 'spring',
            dayOfYear: 1,
        };
    }

    // ============ Getters ============

    get time(): number {
        return this._time;
    }

    get globalState(): GlobalState {
        return { ...this._globalState };
    }

    get relations(): RelationGraph {
        return this._relations;
    }

    // ============ 시간 진행 ============

    /**
     * 시간을 1단위 진행
     * 계절 및 날짜 자동 업데이트
     */
    advanceTime(): void {
        this._time++;
        this._globalState.dayOfYear++;

        if (this._globalState.dayOfYear > 365) {
            this._globalState.dayOfYear = 1;
        }

        // 계절 업데이트 (90일 주기)
        const day = this._globalState.dayOfYear;
        if (day <= 90) {
            this._globalState.season = 'spring';
        } else if (day <= 180) {
            this._globalState.season = 'summer';
        } else if (day <= 270) {
            this._globalState.season = 'autumn';
        } else {
            this._globalState.season = 'winter';
        }

        // 감정 감쇠 적용
        this.applyEmotionDecay();
    }

    /**
     * 감정 감쇠 (시간이 지나면 감정이 중립으로 돌아감)
     */
    private applyEmotionDecay(): void {
        const DECAY_RATE = 0.95; // 5% 감쇠

        for (const character of this._characters.values()) {
            character.emotion.anger *= DECAY_RATE;
            character.emotion.fear *= DECAY_RATE;
            character.emotion.joy *= DECAY_RATE;
            character.emotion.despair *= DECAY_RATE;
            // trust는 감쇠하지 않음 (관계에 의해 변화)
        }
    }

    // ============ 캐릭터 관리 ============

    addCharacter(character: Character): void {
        this._characters.set(character.id, character);
    }

    getCharacter(id: EntityId): Character | undefined {
        return this._characters.get(id);
    }

    getAllCharacters(): Character[] {
        return Array.from(this._characters.values());
    }

    getCharactersAt(locationId: EntityId): Character[] {
        return this.getAllCharacters().filter(c => c.location === locationId);
    }

    updateCharacter(id: EntityId, updates: Partial<Character>): void {
        const character = this._characters.get(id);
        if (character) {
            Object.assign(character, updates);
        }
    }

    // ============ 장소 관리 ============

    addLocation(location: Location): void {
        this._locations.set(location.id, location);
    }

    getLocation(id: EntityId): Location | undefined {
        return this._locations.get(id);
    }

    getAllLocations(): Location[] {
        return Array.from(this._locations.values());
    }

    // ============ 이벤트/역사 ============

    addEvent(event: GameEvent): void {
        this._history.push(event);

        // 목격자들에게 기억 추가
        for (const witnessId of event.witnesses) {
            const witness = this._characters.get(witnessId);
            if (witness) {
                witness.memory.push({
                    eventId: event.id,
                    interpretation: event.description, // 기본 해석
                    emotionalImpact: {},
                    timestamp: this._time,
                });
            }
        }
    }

    getRecentEvents(count: number = 10): GameEvent[] {
        return this._history.slice(-count);
    }

    getEventsByParticipant(characterId: EntityId): GameEvent[] {
        return this._history.filter(e => e.participants.includes(characterId));
    }

    // ============ 효과 적용 ============

    /**
     * Effect를 세계 상태에 적용
     */
    applyEffect(effect: Effect): void {
        switch (effect.type) {
            case 'emotion':
                this.applyEmotionEffect(effect);
                break;
            case 'relation':
                this.applyRelationEffect(effect);
                break;
            case 'resource':
                this.applyResourceEffect(effect);
                break;
            case 'stat':
                this.applyStatEffect(effect);
                break;
        }
    }

    private applyEmotionEffect(effect: Effect): void {
        const character = this._characters.get(effect.target);
        if (!character) return;

        const field = effect.field as keyof Character['emotion'];
        if (field in character.emotion) {
            if (effect.isRelative) {
                character.emotion[field] += effect.change as number;
            } else {
                character.emotion[field] = effect.change as number;
            }
            // 0~1 범위로 클램프
            character.emotion[field] = Math.max(0, Math.min(1, character.emotion[field]));
        }
    }

    private applyRelationEffect(effect: Effect): void {
        // effect.target = "charA:charB" 형태
        const [fromId, toId] = effect.target.split(':');
        const relation = this._relations.getRelation(fromId, toId);
        if (!relation) return;

        const field = effect.field as keyof typeof relation;
        if (field in relation && typeof relation[field] === 'number') {
            if (effect.isRelative) {
                (relation[field] as number) += effect.change as number;
            } else {
                (relation[field] as number) = effect.change as number;
            }
        }

        this._relations.updateRelation(fromId, toId, relation);
    }

    private applyResourceEffect(effect: Effect): void {
        const character = this._characters.get(effect.target);
        if (!character) return;

        if (effect.isRelative) {
            character.resources += effect.change as number;
        } else {
            character.resources = effect.change as number;
        }
    }

    private applyStatEffect(effect: Effect): void {
        const character = this._characters.get(effect.target);
        if (!character) return;

        if (effect.field === 'power') {
            if (effect.isRelative) {
                character.power += effect.change as number;
            } else {
                character.power = effect.change as number;
            }
        }
    }

    // ============ 전역 상태 업데이트 ============

    updateGlobalState(updates: Partial<GlobalState>): void {
        Object.assign(this._globalState, updates);
    }

    // ============ 스냅샷 ============

    /**
     * 현재 세계 상태의 스냅샷 생성 (디버깅/저장용)
     */
    snapshot(): object {
        return {
            time: this._time,
            characterCount: this._characters.size,
            locationCount: this._locations.size,
            historyLength: this._history.length,
            globalState: this._globalState,
        };
    }
}

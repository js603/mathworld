/**
 * 전투 시스템
 * 
 * 턴제 전투 로직
 */

import { EntityId, Character, GameEvent } from '../core/types';
import { WorldState } from '../core/WorldState';
import { generateId, rollSuccess, randomRange, clamp } from '../utils';

/**
 * 전투 상태
 */
export type CombatState = 'active' | 'victory' | 'defeat' | 'fled' | 'draw';

/**
 * 전투 행동
 */
export type CombatAction = 'attack' | 'defend' | 'skill' | 'item' | 'flee';

/**
 * 전투 참가자 상태
 */
export interface Combatant {
    characterId: EntityId;
    hp: number;
    maxHp: number;
    isDefending: boolean;
    statusEffects: string[];
}

/**
 * 전투 로그 항목
 */
export interface CombatLogEntry {
    turn: number;
    actor: EntityId;
    action: CombatAction;
    target?: EntityId;
    damage?: number;
    message: string;
}

/**
 * 전투 결과
 */
export interface CombatResult {
    state: CombatState;
    winner?: EntityId;
    loser?: EntityId;
    log: CombatLogEntry[];
    rewards?: {
        experience: number;
        resources: number;
    };
}

/**
 * 전투 시스템 클래스
 */
export class Combat {
    private world: WorldState;
    private combatants: Map<EntityId, Combatant> = new Map();
    private turnOrder: EntityId[] = [];
    private currentTurn: number = 0;
    private log: CombatLogEntry[] = [];
    private state: CombatState = 'active';

    constructor(world: WorldState) {
        this.world = world;
    }

    /**
     * 전투 시작
     */
    startCombat(attackerId: EntityId, defenderId: EntityId): void {
        this.combatants.clear();
        this.log = [];
        this.currentTurn = 0;
        this.state = 'active';

        // 전투 참가자 초기화
        this.initCombatant(attackerId);
        this.initCombatant(defenderId);

        // 턴 순서 결정 (용기 기반)
        this.turnOrder = this.determineTurnOrder();

        this.addLog(attackerId, 'attack', undefined, undefined, '전투가 시작되었다!');
    }

    private initCombatant(characterId: EntityId): void {
        const character = this.world.getCharacter(characterId);
        if (!character) return;

        // HP = 권력 * 10 + 기본값
        const maxHp = character.power * 10 + 50;

        this.combatants.set(characterId, {
            characterId,
            hp: maxHp,
            maxHp,
            isDefending: false,
            statusEffects: [],
        });
    }

    private determineTurnOrder(): EntityId[] {
        const combatantList = Array.from(this.combatants.keys());

        // 용기가 높은 순으로 정렬
        combatantList.sort((a, b) => {
            const charA = this.world.getCharacter(a);
            const charB = this.world.getCharacter(b);
            const courageA = charA?.personality.courage ?? 0.5;
            const courageB = charB?.personality.courage ?? 0.5;
            return courageB - courageA;
        });

        return combatantList;
    }

    /**
     * 현재 행동할 차례인 캐릭터
     */
    getCurrentActor(): EntityId | null {
        if (this.state !== 'active') return null;
        const index = this.currentTurn % this.turnOrder.length;
        return this.turnOrder[index];
    }

    /**
     * 행동 실행
     */
    executeAction(
        actorId: EntityId,
        action: CombatAction,
        targetId?: EntityId
    ): string {
        if (this.state !== 'active') {
            return '전투가 이미 종료되었습니다.';
        }

        const actor = this.combatants.get(actorId);
        if (!actor) return '유효하지 않은 행동자입니다.';

        // 방어 상태 리셋
        actor.isDefending = false;

        let message = '';

        switch (action) {
            case 'attack':
                message = this.executeAttack(actorId, targetId);
                break;
            case 'defend':
                message = this.executeDefend(actorId);
                break;
            case 'flee':
                message = this.executeFlee(actorId);
                break;
            default:
                message = '알 수 없는 행동입니다.';
        }

        // 승패 체크
        this.checkCombatEnd();

        // 다음 턴으로
        if (this.state === 'active') {
            this.currentTurn++;
        }

        return message;
    }

    private executeAttack(actorId: EntityId, targetId?: EntityId): string {
        const actor = this.combatants.get(actorId);
        const target = targetId ? this.combatants.get(targetId) : this.getOpponent(actorId);

        if (!actor || !target) return '대상을 찾을 수 없습니다.';

        const actorChar = this.world.getCharacter(actorId);
        const targetChar = this.world.getCharacter(target.characterId);

        // 데미지 계산
        // 기본 데미지 = 권력 * (0.8~1.2) * (용기 보너스)
        const basePower = actorChar?.power ?? 10;
        const courageBonus = 1 + (actorChar?.personality.courage ?? 0.5) * 0.3;
        let damage = Math.floor(basePower * randomRange(0.8, 1.2) * courageBonus);

        // 방어 중이면 피해 50% 감소
        if (target.isDefending) {
            damage = Math.floor(damage * 0.5);
        }

        // 피해 적용
        target.hp = Math.max(0, target.hp - damage);

        const message = `${actorChar?.name || '공격자'}이(가) ${targetChar?.name || '대상'}에게 ${damage}의 피해를 입혔다!`;
        this.addLog(actorId, 'attack', target.characterId, damage, message);

        return message;
    }

    private executeDefend(actorId: EntityId): string {
        const actor = this.combatants.get(actorId);
        if (!actor) return '';

        actor.isDefending = true;

        const actorChar = this.world.getCharacter(actorId);
        const message = `${actorChar?.name || '방어자'}이(가) 방어 태세를 취했다.`;
        this.addLog(actorId, 'defend', undefined, undefined, message);

        return message;
    }

    private executeFlee(actorId: EntityId): string {
        const actorChar = this.world.getCharacter(actorId);

        // 도주 성공률 = 40% + 교활함 * 30%
        const cunningBonus = (actorChar?.personality.cunning ?? 0.5) * 0.3;
        const fleeChance = 0.4 + cunningBonus;

        if (rollSuccess(fleeChance)) {
            this.state = 'fled';
            const message = `${actorChar?.name || '도주자'}이(가) 전투에서 도망쳤다!`;
            this.addLog(actorId, 'flee', undefined, undefined, message);
            return message;
        } else {
            const message = `${actorChar?.name || '도주자'}의 도주 시도가 실패했다!`;
            this.addLog(actorId, 'flee', undefined, undefined, message);
            return message;
        }
    }

    private getOpponent(actorId: EntityId): Combatant | undefined {
        for (const [id, combatant] of this.combatants) {
            if (id !== actorId && combatant.hp > 0) {
                return combatant;
            }
        }
        return undefined;
    }

    private checkCombatEnd(): void {
        const alive = Array.from(this.combatants.values()).filter(c => c.hp > 0);

        if (alive.length <= 1) {
            if (alive.length === 1) {
                this.state = 'victory';
            } else {
                this.state = 'draw';
            }
        }
    }

    private addLog(
        actor: EntityId,
        action: CombatAction,
        target?: EntityId,
        damage?: number,
        message?: string
    ): void {
        this.log.push({
            turn: this.currentTurn,
            actor,
            action,
            target,
            damage,
            message: message || '',
        });
    }

    /**
     * 전투 결과 반환
     */
    getResult(): CombatResult {
        const alive = Array.from(this.combatants.entries())
            .filter(([, c]) => c.hp > 0)
            .map(([id]) => id);

        const dead = Array.from(this.combatants.entries())
            .filter(([, c]) => c.hp <= 0)
            .map(([id]) => id);

        return {
            state: this.state,
            winner: alive[0],
            loser: dead[0],
            log: this.log,
            rewards: this.state === 'victory' ? {
                experience: 50,
                resources: 20,
            } : undefined,
        };
    }

    /**
     * 전투 상태 요약
     */
    getSummary(): string {
        const lines: string[] = [`[전투 턴 ${this.currentTurn}]`];

        for (const [id, combatant] of this.combatants) {
            const char = this.world.getCharacter(id);
            const status = combatant.isDefending ? ' (방어 중)' : '';
            lines.push(`${char?.name || id}: HP ${combatant.hp}/${combatant.maxHp}${status}`);
        }

        return lines.join('\n');
    }

    /**
     * AI 행동 결정 (NPC용)
     */
    getAIAction(npcId: EntityId): { action: CombatAction; targetId?: EntityId } {
        const npc = this.combatants.get(npcId);
        const npcChar = this.world.getCharacter(npcId);

        if (!npc || !npcChar) {
            return { action: 'attack' };
        }

        const opponent = this.getOpponent(npcId);

        // HP가 30% 이하이고 용기가 낮으면 도주 시도
        if (npc.hp / npc.maxHp < 0.3 && npcChar.personality.courage < 0.4) {
            if (rollSuccess(0.5)) {
                return { action: 'flee' };
            }
        }

        // HP가 50% 이하면 방어 고려
        if (npc.hp / npc.maxHp < 0.5 && !npc.isDefending && rollSuccess(0.3)) {
            return { action: 'defend' };
        }

        // 기본: 공격
        return { action: 'attack', targetId: opponent?.characterId };
    }
}

/**
 * 레벨 및 성장 시스템
 * 
 * 경험치 획득, 레벨업, 능력치 분배 관리
 */

import { Character, CombatStats, Skill } from '../core/types';
import { clamp } from '../utils';

/**
 * 레벨업 보상
 */
export interface LevelUpReward {
    level: number;
    statPoints: number;
    skillPoints: number;
    hpBonus: number;
    mpBonus: number;
}

/**
 * 능력치 타입
 */
export type StatType = 'attack' | 'defense' | 'speed' | 'maxHp' | 'maxMp' | 'critRate';

/**
 * 레벨 시스템 클래스
 */
export class LevelSystem {
    private static readonly BASE_EXP = 100;
    private static readonly EXP_EXPONENT = 1.5;
    private static readonly STAT_POINTS_PER_LEVEL = 5;
    private static readonly SKILL_POINTS_PER_LEVEL = 1;
    private static readonly HP_PER_LEVEL = 10;
    private static readonly MP_PER_LEVEL = 5;

    /**
     * 플레이어 초기화 (전투/성장 시스템)
     */
    static initializePlayerStats(character: Character): void {
        if (!character.stats) {
            character.stats = {
                maxHp: 100,
                currentHp: 100,
                maxMp: 50,
                currentMp: 50,
                attack: 10,
                defense: 5,
                speed: 10,
                critRate: 0.05,
                critDamage: 1.5,
            };
        }

        if (character.level === undefined) {
            character.level = 1;
        }
        if (character.experience === undefined) {
            character.experience = 0;
        }
        if (character.expToNextLevel === undefined) {
            character.expToNextLevel = this.getExpForLevel(2);
        }
        if (character.statPoints === undefined) {
            character.statPoints = 0;
        }
        if (character.skillPoints === undefined) {
            character.skillPoints = 0;
        }
        if (!character.skills) {
            character.skills = [];
        }
        if (!character.inventory) {
            character.inventory = [];
        }
        if (!character.equipment) {
            character.equipment = {};
        }
    }

    /**
     * 특정 레벨에 필요한 경험치 계산
     */
    static getExpForLevel(level: number): number {
        return Math.floor(this.BASE_EXP * Math.pow(level, this.EXP_EXPONENT));
    }

    /**
     * 경험치 획득
     */
    static addExperience(character: Character, amount: number): LevelUpReward | null {
        if (!character.experience || !character.expToNextLevel || !character.level) {
            return null;
        }

        character.experience += amount;

        // 레벨업 체크
        if (character.experience >= character.expToNextLevel) {
            return this.levelUp(character);
        }

        return null;
    }

    /**
     * 레벨업 처리
     */
    static levelUp(character: Character): LevelUpReward {
        if (!character.level || !character.stats) {
            throw new Error('Character not initialized for leveling');
        }

        // 남은 경험치 계산
        const excessExp = (character.experience || 0) - (character.expToNextLevel || 0);

        // 레벨 증가
        character.level++;

        // 다음 레벨 경험치 설정
        character.expToNextLevel = this.getExpForLevel(character.level + 1);
        character.experience = Math.max(0, excessExp);

        // 보상 지급
        const reward: LevelUpReward = {
            level: character.level,
            statPoints: this.STAT_POINTS_PER_LEVEL,
            skillPoints: this.SKILL_POINTS_PER_LEVEL,
            hpBonus: this.HP_PER_LEVEL,
            mpBonus: this.MP_PER_LEVEL,
        };

        // 능력치/스킬 포인트 지급
        character.statPoints = (character.statPoints || 0) + reward.statPoints;
        character.skillPoints = (character.skillPoints || 0) + reward.skillPoints;

        // HP/MP 증가
        character.stats.maxHp += reward.hpBonus;
        character.stats.maxMp += reward.mpBonus;

        // 체력/마나 전체 회복
        character.stats.currentHp = character.stats.maxHp;
        character.stats.currentMp = character.stats.maxMp;

        // 연속 레벨업 체크
        if (character.experience >= character.expToNextLevel) {
            const nextReward = this.levelUp(character);
            reward.statPoints += nextReward.statPoints;
            reward.skillPoints += nextReward.skillPoints;
            reward.hpBonus += nextReward.hpBonus;
            reward.mpBonus += nextReward.mpBonus;
        }

        return reward;
    }

    /**
     * 능력치 포인트 분배
     */
    static distributeStat(character: Character, stat: StatType, points: number = 1): boolean {
        if (!character.stats || !character.statPoints || character.statPoints < points) {
            return false;
        }

        const statBonus: Record<StatType, number> = {
            attack: 2,
            defense: 2,
            speed: 1,
            maxHp: 10,
            maxMp: 5,
            critRate: 0.01,
        };

        const bonus = statBonus[stat] * points;

        switch (stat) {
            case 'attack':
                character.stats.attack += bonus;
                break;
            case 'defense':
                character.stats.defense += bonus;
                break;
            case 'speed':
                character.stats.speed += bonus;
                break;
            case 'maxHp':
                character.stats.maxHp += bonus;
                break;
            case 'maxMp':
                character.stats.maxMp += bonus;
                break;
            case 'critRate':
                character.stats.critRate = clamp(character.stats.critRate + bonus, 0, 1);
                break;
        }

        character.statPoints -= points;
        return true;
    }

    /**
     * 스킬 습득
     */
    static learnSkill(character: Character, skill: Skill): boolean {
        if (!character.skills) {
            character.skills = [];
        }

        // 이미 습득한 스킬인지 확인
        if (character.skills.some(s => s.id === skill.id)) {
            return false;
        }

        // 레벨 요구사항 확인
        if ((character.level || 1) < skill.requiredLevel) {
            return false;
        }

        // 스킬 포인트 확인
        if ((character.skillPoints || 0) < 1) {
            return false;
        }

        character.skills.push({ ...skill });
        character.skillPoints = (character.skillPoints || 0) - 1;

        return true;
    }

    /**
     * 스킬 레벨업
     */
    static upgradeSkill(character: Character, skillId: string): boolean {
        if (!character.skills || !character.skillPoints) {
            return false;
        }

        const skill = character.skills.find(s => s.id === skillId);
        if (!skill) {
            return false;
        }

        // 스킬 포인트 소모
        if (character.skillPoints < 1) {
            return false;
        }

        skill.level++;
        character.skillPoints--;

        // 스킬 효과 증가
        if (skill.baseDamage) {
            skill.baseDamage = Math.floor(skill.baseDamage * 1.15);
        }
        if (skill.healAmount) {
            skill.healAmount = Math.floor(skill.healAmount * 1.15);
        }

        return true;
    }

    /**
     * 현재 레벨 진행률 (0~1)
     */
    static getLevelProgress(character: Character): number {
        if (!character.experience || !character.expToNextLevel) {
            return 0;
        }

        const prevLevelExp = this.getExpForLevel(character.level || 1);
        const totalNeeded = character.expToNextLevel - prevLevelExp;
        const current = character.experience - prevLevelExp;

        return clamp(current / totalNeeded, 0, 1);
    }

    /**
     * 적 처치 시 획득 경험치 계산
     */
    static getEnemyExpReward(enemyLevel: number, playerLevel: number): number {
        const baseExp = this.getExpForLevel(enemyLevel) * 0.3;
        const levelDiff = enemyLevel - playerLevel;

        // 레벨 차이에 따른 보정
        let modifier = 1.0;
        if (levelDiff > 0) {
            modifier = 1 + levelDiff * 0.1; // 높은 레벨 적 = 더 많은 경험치
        } else if (levelDiff < 0) {
            modifier = Math.max(0.1, 1 + levelDiff * 0.15); // 낮은 레벨 적 = 적은 경험치
        }

        return Math.floor(baseExp * modifier);
    }
}

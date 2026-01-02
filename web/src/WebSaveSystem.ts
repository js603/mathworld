/**
 * WebSaveSystem - 웹용 저장 시스템
 * 
 * localStorage를 사용하여 게임을 저장/불러오기 합니다.
 * CLI의 SaveSystem과 동일한 인터페이스를 제공합니다.
 */

import { GameSaveSystem, SaveInfo } from '../../src/game/GameIO';

export class WebSaveSystem implements GameSaveSystem {
    private readonly SAVE_PREFIX = 'mathworld_save_';
    private readonly SAVE_LIST_KEY = 'mathworld_saves';

    saveGame(slotName: string, turnCount: number, player: any, world: any): boolean {
        try {
            const saveData = {
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                turnCount,
                player: this.serializePlayer(player),
                worldState: this.serializeWorld(world),
            };

            localStorage.setItem(this.SAVE_PREFIX + slotName, JSON.stringify(saveData));
            this.updateSaveList(slotName, player.name, turnCount, saveData.timestamp);
            return true;
        } catch (error) {
            console.error('저장 실패:', error);
            return false;
        }
    }

    loadGame(slotName: string): any | null {
        try {
            const data = localStorage.getItem(this.SAVE_PREFIX + slotName);
            if (!data) return null;
            return JSON.parse(data);
        } catch (error) {
            console.error('불러오기 실패:', error);
            return null;
        }
    }

    listSaves(): SaveInfo[] {
        try {
            const listData = localStorage.getItem(this.SAVE_LIST_KEY);
            if (!listData) return [];
            return JSON.parse(listData);
        } catch {
            return [];
        }
    }

    deleteSave(slotName: string): boolean {
        try {
            localStorage.removeItem(this.SAVE_PREFIX + slotName);

            const saves = this.listSaves().filter(s => s.slotName !== slotName);
            localStorage.setItem(this.SAVE_LIST_KEY, JSON.stringify(saves));
            return true;
        } catch {
            return false;
        }
    }

    formatTimestamp(timestamp: string): string {
        try {
            const date = new Date(timestamp);
            return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        } catch {
            return timestamp;
        }
    }

    restoreToWorld(saveData: any, world: any): void {
        if (saveData.worldState) {
            if (saveData.worldState.time !== undefined) {
                world.time = saveData.worldState.time;
            }
            if (saveData.worldState.globalState) {
                Object.assign(world.globalState, saveData.worldState.globalState);
            }
        }
    }

    private serializePlayer(player: any): any {
        return {
            id: player.id,
            name: player.name,
            title: player.title,
            location: player.location,
            power: player.power,
            resources: player.resources,
            personality: { ...player.personality },
            emotion: { ...player.emotion },
            stats: player.stats ? { ...player.stats } : undefined,
            level: player.level,
            experience: player.experience,
            expToNextLevel: player.expToNextLevel,
            statPoints: player.statPoints,
        };
    }

    private serializeWorld(world: any): any {
        return {
            time: world.time,
            globalState: { ...world.globalState },
        };
    }

    private updateSaveList(slotName: string, playerName: string, turnCount: number, timestamp: string): void {
        const saves = this.listSaves().filter(s => s.slotName !== slotName);
        saves.unshift({ slotName, playerName, turnCount, timestamp });
        localStorage.setItem(this.SAVE_LIST_KEY, JSON.stringify(saves));
    }
}

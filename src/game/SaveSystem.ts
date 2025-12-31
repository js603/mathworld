/**
 * 세이브/로드 시스템
 * 
 * 게임 상태를 JSON 파일로 저장하고 복원
 */

import * as fs from 'fs';
import * as path from 'path';
import { WorldState } from '../core/WorldState';
import { Character, EntityId } from '../core/types';

/**
 * 저장 데이터 구조
 */
export interface SaveData {
    version: string;
    timestamp: string;
    turnCount: number;
    player: Character;
    characters: Character[];
    worldState: {
        time: number;
        globalState: {
            warActive: boolean;
            economyIndex: number;
            plagueActive: boolean;
            season: 'spring' | 'summer' | 'autumn' | 'winter';
            dayOfYear: number;
        };
    };
    relations: Array<{
        from: EntityId;
        to: EntityId;
        trust: number;
        fear: number;
        debt: number;
    }>;
    playerLocation: string;
}

/**
 * 저장 슬롯 정보
 */
export interface SaveSlot {
    slotName: string;
    playerName: string;
    turnCount: number;
    timestamp: string;
    location: string;
}

/**
 * 세이브 시스템 클래스
 */
export class SaveSystem {
    private savesDir: string;
    private version: string = '1.0.0';

    constructor(savesDir?: string) {
        this.savesDir = savesDir || path.join(process.cwd(), 'saves');
        this.ensureSavesDir();
    }

    /**
     * saves 디렉토리 확인 및 생성
     */
    private ensureSavesDir(): void {
        if (!fs.existsSync(this.savesDir)) {
            fs.mkdirSync(this.savesDir, { recursive: true });
        }
    }

    /**
     * 게임 저장
     */
    saveGame(
        slotName: string,
        turnCount: number,
        player: Character,
        world: WorldState
    ): boolean {
        try {
            const saveData: SaveData = {
                version: this.version,
                timestamp: new Date().toISOString(),
                turnCount,
                player,
                characters: world.getAllCharacters(),
                worldState: {
                    time: world.time,
                    globalState: world.globalState,
                },
                relations: this.serializeRelations(world),
                playerLocation: player.location,
            };

            const filePath = path.join(this.savesDir, `${slotName}.json`);
            fs.writeFileSync(filePath, JSON.stringify(saveData, null, 2), 'utf-8');
            return true;
        } catch (error) {
            console.error('저장 실패:', error);
            return false;
        }
    }

    /**
     * 게임 불러오기
     */
    loadGame(slotName: string): SaveData | null {
        try {
            const filePath = path.join(this.savesDir, `${slotName}.json`);

            if (!fs.existsSync(filePath)) {
                return null;
            }

            const data = fs.readFileSync(filePath, 'utf-8');
            const saveData: SaveData = JSON.parse(data);

            // 버전 체크 (향후 마이그레이션용)
            if (saveData.version !== this.version) {
                console.warn(`저장 파일 버전 불일치: ${saveData.version} → ${this.version}`);
            }

            return saveData;
        } catch (error) {
            console.error('불러오기 실패:', error);
            return null;
        }
    }

    /**
     * 자동 저장
     */
    autoSave(turnCount: number, player: Character, world: WorldState): boolean {
        return this.saveGame('autosave', turnCount, player, world);
    }

    /**
     * 저장 슬롯 목록 조회
     */
    listSaves(): SaveSlot[] {
        try {
            const files = fs.readdirSync(this.savesDir)
                .filter(f => f.endsWith('.json'));

            const slots: SaveSlot[] = [];

            for (const file of files) {
                try {
                    const filePath = path.join(this.savesDir, file);
                    const data = fs.readFileSync(filePath, 'utf-8');
                    const saveData: SaveData = JSON.parse(data);

                    slots.push({
                        slotName: file.replace('.json', ''),
                        playerName: saveData.player.name,
                        turnCount: saveData.turnCount,
                        timestamp: saveData.timestamp,
                        location: saveData.playerLocation,
                    });
                } catch {
                    // 손상된 파일 무시
                }
            }

            // 최신순 정렬
            slots.sort((a, b) =>
                new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );

            return slots;
        } catch (error) {
            console.error('저장 목록 조회 실패:', error);
            return [];
        }
    }

    /**
     * 저장 삭제
     */
    deleteSave(slotName: string): boolean {
        try {
            const filePath = path.join(this.savesDir, `${slotName}.json`);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                return true;
            }
            return false;
        } catch (error) {
            console.error('저장 삭제 실패:', error);
            return false;
        }
    }

    /**
     * 저장 파일 존재 확인
     */
    hasSave(slotName: string): boolean {
        const filePath = path.join(this.savesDir, `${slotName}.json`);
        return fs.existsSync(filePath);
    }

    /**
     * 관계 그래프 직렬화
     */
    private serializeRelations(world: WorldState): SaveData['relations'] {
        const relations: SaveData['relations'] = [];
        const characters = world.getAllCharacters();

        for (const char1 of characters) {
            for (const char2 of characters) {
                if (char1.id !== char2.id) {
                    const rel = world.relations.getRelation(char1.id, char2.id);
                    if (rel.trust !== 0 || rel.fear !== 0 || rel.debt !== 0) {
                        relations.push({
                            from: char1.id,
                            to: char2.id,
                            trust: rel.trust,
                            fear: rel.fear,
                            debt: rel.debt,
                        });
                    }
                }
            }
        }

        return relations;
    }

    /**
     * 저장 데이터를 WorldState에 복원
     */
    restoreToWorld(saveData: SaveData, world: WorldState): void {
        // 시간 복원
        (world as any)._time = saveData.worldState.time;
        world.updateGlobalState(saveData.worldState.globalState);

        // 캐릭터 복원
        for (const char of saveData.characters) {
            const existing = world.getCharacter(char.id);
            if (existing) {
                Object.assign(existing, char);
            }
        }

        // 관계 복원
        for (const rel of saveData.relations) {
            world.relations.updateRelation(rel.from, rel.to, {
                trust: rel.trust,
                fear: rel.fear,
                debt: rel.debt,
            });
        }
    }

    /**
     * 타임스탬프 포맷팅
     */
    formatTimestamp(timestamp: string): string {
        const date = new Date(timestamp);
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
}

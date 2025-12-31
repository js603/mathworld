/**
 * 플레이어 입력 처리
 * 
 * 플레이어 입력을 파싱하고 적절한 행동으로 변환
 */

import { EntityId, Choice, Action, Character } from '../core/types';
import { WorldState } from '../core/WorldState';
import { ChoiceGenerator } from '../core/ChoiceGenerator';

/**
 * 입력 유형
 */
export type InputType =
    | 'choice_select'    // 선택지 번호
    | 'move'             // 이동
    | 'examine'          // 조사
    | 'talk'             // 대화
    | 'inventory'        // 인벤토리
    | 'status'           // 상태 확인
    | 'help'             // 도움말
    | 'unknown';         // 알 수 없음

/**
 * 파싱된 입력
 */
export interface ParsedInput {
    type: InputType;
    target?: string;
    value?: number | string;
    raw: string;
}

/**
 * 입력 처리 결과
 */
export interface InputResult {
    success: boolean;
    message: string;
    triggersAction: boolean;
    action?: Action;
    targetId?: EntityId;
}

/**
 * 플레이어 액션 핸들러
 */
export class PlayerAction {
    private world: WorldState;
    private choiceGenerator: ChoiceGenerator;
    private currentChoices: Choice[] = [];

    constructor(world: WorldState) {
        this.world = world;
        this.choiceGenerator = new ChoiceGenerator(world);
    }

    /**
     * 현재 선택지 설정
     */
    setCurrentChoices(choices: Choice[]): void {
        this.currentChoices = choices;
    }

    /**
     * 입력 파싱
     */
    parseInput(input: string): ParsedInput {
        const trimmed = input.trim().toLowerCase();
        const parts = trimmed.split(/\s+/);
        const command = parts[0];
        const rest = parts.slice(1).join(' ');

        // 숫자만 입력 → 선택지 선택
        if (/^\d+$/.test(trimmed)) {
            return {
                type: 'choice_select',
                value: parseInt(trimmed, 10),
                raw: input,
            };
        }

        // 명령어 파싱
        switch (command) {
            case 'go':
            case 'move':
            case '이동':
                return { type: 'move', target: rest, raw: input };

            case 'look':
            case 'examine':
            case '조사':
            case '살펴보기':
                return { type: 'examine', target: rest, raw: input };

            case 'talk':
            case '대화':
                return { type: 'talk', target: rest, raw: input };

            case 'inventory':
            case 'inv':
            case 'i':
            case '인벤토리':
                return { type: 'inventory', raw: input };

            case 'status':
            case 'stat':
            case '상태':
                return { type: 'status', raw: input };

            case 'help':
            case 'h':
            case '도움':
            case '?':
                return { type: 'help', raw: input };

            default:
                return { type: 'unknown', raw: input };
        }
    }

    /**
     * 입력 처리
     */
    handleInput(input: string, playerId: EntityId): InputResult {
        const parsed = this.parseInput(input);
        const player = this.world.getCharacter(playerId);

        if (!player) {
            return {
                success: false,
                message: '플레이어를 찾을 수 없습니다.',
                triggersAction: false,
            };
        }

        switch (parsed.type) {
            case 'choice_select':
                return this.handleChoiceSelect(parsed.value as number);

            case 'move':
                return this.handleMove(player, parsed.target);

            case 'examine':
                return this.handleExamine(player, parsed.target);

            case 'talk':
                return this.handleTalk(player, parsed.target);

            case 'inventory':
                return this.handleInventory(player);

            case 'status':
                return this.handleStatus(player);

            case 'help':
                return this.handleHelp();

            default:
                return {
                    success: false,
                    message: '알 수 없는 명령입니다. "도움"을 입력하세요.',
                    triggersAction: false,
                };
        }
    }

    private handleChoiceSelect(index: number): InputResult {
        const choiceIndex = index - 1; // 1-based → 0-based

        if (choiceIndex < 0 || choiceIndex >= this.currentChoices.length) {
            return {
                success: false,
                message: `1~${this.currentChoices.length} 사이의 숫자를 입력하세요.`,
                triggersAction: false,
            };
        }

        const choice = this.currentChoices[choiceIndex];
        return {
            success: true,
            message: choice.text,
            triggersAction: true,
            action: choice.action,
        };
    }

    private handleMove(player: Character, target?: string): InputResult {
        const location = this.world.getLocation(player.location);
        if (!location) {
            return {
                success: false,
                message: '현재 위치를 알 수 없습니다.',
                triggersAction: false,
            };
        }

        if (!target) {
            const connections = location.connectedTo
                .map(id => this.world.getLocation(id)?.name || id)
                .join(', ');
            return {
                success: true,
                message: `이동 가능한 장소: ${connections}`,
                triggersAction: false,
            };
        }

        // 타겟 장소 찾기
        const targetLocation = location.connectedTo.find(id => {
            const loc = this.world.getLocation(id);
            return loc?.name.toLowerCase().includes(target.toLowerCase());
        });

        if (!targetLocation) {
            return {
                success: false,
                message: `"${target}"(으)로 이동할 수 없습니다.`,
                triggersAction: false,
            };
        }

        return {
            success: true,
            message: `${this.world.getLocation(targetLocation)?.name}(으)로 이동합니다.`,
            triggersAction: true,
            targetId: targetLocation,
        };
    }

    private handleExamine(player: Character, target?: string): InputResult {
        if (!target) {
            const location = this.world.getLocation(player.location);
            return {
                success: true,
                message: location ? `${location.name} - ${location.type}` : '주변을 살펴봅니다.',
                triggersAction: false,
            };
        }

        // 대상 찾기 (캐릭터 또는 장소)
        const characters = this.world.getCharactersAt(player.location);
        const targetChar = characters.find(c =>
            c.name.toLowerCase().includes(target.toLowerCase())
        );

        if (targetChar) {
            return {
                success: true,
                message: `${targetChar.name}: ${targetChar.title || '특별한 정보 없음'}`,
                triggersAction: false,
            };
        }

        return {
            success: true,
            message: `"${target}"에 대한 정보를 찾을 수 없습니다.`,
            triggersAction: false,
        };
    }

    private handleTalk(player: Character, target?: string): InputResult {
        if (!target) {
            return {
                success: false,
                message: '누구와 대화할지 지정하세요.',
                triggersAction: false,
            };
        }

        const characters = this.world.getCharactersAt(player.location)
            .filter(c => c.id !== player.id);

        const targetChar = characters.find(c =>
            c.name.toLowerCase().includes(target.toLowerCase())
        );

        if (!targetChar) {
            return {
                success: false,
                message: `"${target}"을(를) 찾을 수 없습니다.`,
                triggersAction: false,
            };
        }

        return {
            success: true,
            message: `${targetChar.name}과(와) 대화를 시작합니다.`,
            triggersAction: true,
            targetId: targetChar.id,
        };
    }

    private handleInventory(player: Character): InputResult {
        return {
            success: true,
            message: `소지금: ${player.resources}`,
            triggersAction: false,
        };
    }

    private handleStatus(player: Character): InputResult {
        const dominant = Object.entries(player.emotion)
            .sort((a, b) => (b[1] as number) - (a[1] as number))[0];

        return {
            success: true,
            message: `이름: ${player.name}\n권력: ${player.power}\n주요 감정: ${dominant[0]} (${(dominant[1] as number).toFixed(2)})`,
            triggersAction: false,
        };
    }

    private handleHelp(): InputResult {
        return {
            success: true,
            message: `
명령어 목록:
  [숫자]      - 선택지 선택
  이동 [장소] - 다른 장소로 이동
  조사 [대상] - 대상 조사
  대화 [인물] - 인물과 대화
  인벤토리   - 소지품 확인
  상태       - 현재 상태 확인
  도움       - 도움말 표시
      `.trim(),
            triggersAction: false,
        };
    }
}

/**
 * CliIO - CLI용 게임 I/O
 * 
 * readline을 사용하여 GameIO 인터페이스를 구현합니다.
 * 기존 game_cli.ts의 입출력 방식과 동일합니다.
 */

import * as readline from 'readline';
import { GameIO } from './GameIO';

export class CliIO implements GameIO {
    private rl: readline.Interface;

    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
    }

    print(text: string): void {
        console.log(text);
    }

    clear(): void {
        console.clear();
    }

    prompt(question: string): Promise<string> {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                resolve(answer.trim());
            });
        });
    }

    promptChoice(options: string[]): Promise<number> {
        return new Promise(async (resolve) => {
            // 선택지 표시는 GameCore에서 이미 했으므로 입력만 받음
            const input = await this.prompt('\n선택: ');
            const index = parseInt(input) - 1;

            if (index >= 0 && index < options.length) {
                resolve(index);
            } else {
                // 잘못된 입력시 다시 시도
                resolve(await this.promptChoice(options));
            }
        });
    }

    printHeader(title: string): void {
        console.log('\n');
        this.printLine('═');
        console.log(`  ${title}`);
        this.printLine('═');
    }

    printSection(title: string): void {
        console.log(`\n【 ${title} 】`);
    }

    printLine(char: string = '─', length: number = 50): void {
        console.log(char.repeat(length));
    }

    close(): void {
        this.rl.close();
    }
}

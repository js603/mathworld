/**
 * WebIO - 웹용 게임 I/O
 * 
 * 터치 친화적 UI로 GameIO 인터페이스를 구현합니다.
 * 모바일 반응형 디자인을 지원합니다.
 */

import { GameIO } from '../../src/game/GameIO';

export class WebIO implements GameIO {
    private outputElement: HTMLElement;
    private choicesElement: HTMLElement;
    private statusElement: HTMLElement;
    private pendingPromise: { resolve: (value: string) => void } | null = null;
    private pendingChoicePromise: { resolve: (value: number) => void } | null = null;

    constructor() {
        this.outputElement = document.getElementById('game-output')!;
        this.choicesElement = document.getElementById('game-choices')!;
        this.statusElement = document.getElementById('game-status')!;

        // 스크롤 이벤트 설정
        this.setupAutoScroll();
    }

    private setupAutoScroll() {
        // MutationObserver로 새 콘텐츠 추가 시 자동 스크롤
        const observer = new MutationObserver(() => {
            this.scrollToBottom();
        });
        observer.observe(this.outputElement, { childList: true, subtree: true });
    }

    private scrollToBottom() {
        this.outputElement.scrollTop = this.outputElement.scrollHeight;
    }

    print(text: string): void {
        const line = document.createElement('div');
        line.className = 'log-line';
        line.textContent = text;
        this.outputElement.appendChild(line);
    }

    clear(): void {
        this.outputElement.innerHTML = '';
    }

    prompt(question: string): Promise<string> {
        return new Promise((resolve) => {
            this.print(question);

            // "계속" 버튼 생성
            this.choicesElement.innerHTML = '';
            const btn = document.createElement('button');
            btn.className = 'choice-button continue-button';
            btn.textContent = '계속 ▶';
            btn.onclick = () => {
                this.choicesElement.innerHTML = '';
                resolve('');
            };
            this.choicesElement.appendChild(btn);
        });
    }

    promptChoice(options: string[]): Promise<number> {
        return new Promise((resolve) => {
            this.choicesElement.innerHTML = '';

            options.forEach((option, index) => {
                const btn = document.createElement('button');
                btn.className = 'choice-button';
                btn.innerHTML = `<span class="choice-number">${index + 1}</span> ${option}`;
                btn.onclick = () => {
                    this.choicesElement.innerHTML = '';
                    resolve(index);
                };
                this.choicesElement.appendChild(btn);
            });
        });
    }

    printHeader(title: string): void {
        const header = document.createElement('div');
        header.className = 'log-header';
        header.innerHTML = `
            <div class="header-line">═══════════════════════════════════════</div>
            <div class="header-title">${title}</div>
            <div class="header-line">═══════════════════════════════════════</div>
        `;
        this.outputElement.appendChild(header);
    }

    printSection(title: string): void {
        const section = document.createElement('div');
        section.className = 'log-section';
        section.textContent = `【 ${title} 】`;
        this.outputElement.appendChild(section);
    }

    printLine(char: string = '─', length: number = 40): void {
        const line = document.createElement('div');
        line.className = 'log-divider';
        line.textContent = char.repeat(length);
        this.outputElement.appendChild(line);
    }

    // 상태바 업데이트 (옵션)
    updateStatus(hp: number, maxHp: number, mp: number, maxMp: number, location: string) {
        this.statusElement.innerHTML = `
            <div class="status-location">📍 ${location}</div>
            <div class="status-bars">
                <div class="hp-bar">
                    <span class="bar-label">HP</span>
                    <div class="bar-container">
                        <div class="bar-fill hp-fill" style="width: ${(hp / maxHp) * 100}%"></div>
                    </div>
                    <span class="bar-value">${hp}/${maxHp}</span>
                </div>
                <div class="mp-bar">
                    <span class="bar-label">MP</span>
                    <div class="bar-container">
                        <div class="bar-fill mp-fill" style="width: ${(mp / maxMp) * 100}%"></div>
                    </div>
                    <span class="bar-value">${mp}/${maxMp}</span>
                </div>
            </div>
        `;
    }
}

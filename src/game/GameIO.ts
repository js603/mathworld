/**
 * GameIO - 게임 입출력 추상화 인터페이스
 * 
 * CLI와 Web 모두에서 동일한 게임 로직을 사용할 수 있도록
 * 입출력을 추상화합니다.
 */

export interface GameIO {
    /**
     * 텍스트를 화면에 출력합니다.
     * CLI: console.log
     * Web: DOM에 텍스트 추가
     */
    print(text: string): void;

    /**
     * 화면을 초기화합니다.
     * CLI: console.clear
     * Web: 로그 영역 초기화
     */
    clear(): void;

    /**
     * 사용자에게 질문하고 응답을 받습니다.
     * CLI: readline.question
     * Web: 버튼 클릭 또는 입력 대기
     */
    prompt(question: string): Promise<string>;

    /**
     * 선택지 목록을 표시하고 사용자 선택을 받습니다.
     * CLI: 번호 입력
     * Web: 버튼 클릭
     */
    promptChoice(options: string[]): Promise<number>;

    /**
     * 헤더를 출력합니다.
     */
    printHeader(title: string): void;

    /**
     * 섹션 제목을 출력합니다.
     */
    printSection(title: string): void;

    /**
     * 구분선을 출력합니다.
     */
    printLine(char?: string, length?: number): void;
}

/**
 * 저장 시스템 인터페이스
 * CLI: fs 기반
 * Web: localStorage 기반
 */
export interface GameSaveSystem {
    saveGame(slotName: string, turnCount: number, player: any, world: any): boolean;
    loadGame(slotName: string): any | null;
    listSaves(): SaveInfo[];
    deleteSave(slotName: string): boolean;
    formatTimestamp(timestamp: string): string;
    restoreToWorld(saveData: any, world: any): void;
}

export interface SaveInfo {
    slotName: string;
    playerName: string;
    turnCount: number;
    timestamp: string;
}

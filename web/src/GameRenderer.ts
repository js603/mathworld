import { WorldState } from '../../src/core/WorldState';
import { Character } from '../../src/core/types';
import { PlayerInfo } from './MultiplayerManager';

export class GameRenderer {
    private outputElement: HTMLElement;
    private choicesElement: HTMLElement;
    private statusElements: {
        turn: HTMLElement;
        location: HTMLElement;
        weather: HTMLElement;
        hpFill: HTMLElement;
        mpFill: HTMLElement;
        hpText: HTMLElement;
        mpText: HTMLElement;
        playersList: HTMLElement;
        playersContainer: HTMLElement;
    };

    constructor() {
        this.outputElement = document.getElementById('game-output')!;
        this.choicesElement = document.getElementById('game-choices')!;
        this.statusElements = {
            turn: document.getElementById('status-turn')!,
            location: document.getElementById('status-location')!,
            weather: document.getElementById('status-weather')!,
            hpFill: document.querySelector('.hp-fill') as HTMLElement,
            mpFill: document.querySelector('.mp-fill') as HTMLElement,
            hpText: document.querySelector('#hp-bar .value') as HTMLElement,
            mpText: document.querySelector('#mp-bar .value') as HTMLElement,
            playersList: document.getElementById('players-list')!,
            playersContainer: document.getElementById('players')!,
        };

        // 스크롤 이벤트 리스너: 사용자가 수동으로 스크롤을 올렸는지 감지
        this.outputElement.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = this.outputElement;
            // 바닥에서 20px 이상 떨어져 있으면 '위로 스크롤 중'으로 판단
            const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
            this.isUserScrolledUp = !isAtBottom;
        });
    }

    private isUserScrolledUp: boolean = false;

    // 텍스트 출력
    print(text: string, type: 'normal' | 'system' | 'narrative' | 'combat' | 'novel' = 'normal') {
        const p = document.createElement('div');
        p.className = `log-${type}`;
        p.textContent = text;
        this.outputElement.appendChild(p);
        this.scrollToBottom(false); // 기본은 자동 스크롤 (사용자가 보고 있을 때만)
    }

    scrollToBottom(force: boolean = false) {
        // 강제 이동이거나, 사용자가 스크롤을 올리지 않은 상태(바닥)라면 스크롤 내림
        if (force || !this.isUserScrolledUp) {
            this.outputElement.scrollTop = this.outputElement.scrollHeight;
        }
    }

    clearOutput() {
        this.outputElement.innerHTML = '';
    }

    // 선택지 렌더링
    renderChoices(choices: { text: string, action: () => void }[]) {
        this.choicesElement.innerHTML = '';
        choices.forEach((choice, index) => {
            const btn = document.createElement('button');
            btn.textContent = `${index + 1}. ${choice.text}`;
            btn.onclick = () => {
                this.choicesElement.innerHTML = ''; // 선택 후 비우기
                this.scrollToBottom(true); // 선택 시 강제 스크롤 (새로운 상황 확인)
                choice.action();
            };
            this.choicesElement.appendChild(btn);
        });

        // 선택지 렌더링 후 레이아웃 변경(높이 변화)으로 인한 스크롤 틀어짐 보정
        // setTimeout으로 렌더링 직후 실행 보장
        setTimeout(() => {
            this.scrollToBottom(true);
        }, 10);
    }

    // 상태 업데이트
    updateStatus(world: WorldState, player: Character) {
        this.statusElements.turn.textContent = `턴 ${world.time}`;

        const loc = world.getLocation(player.location);
        this.statusElements.location.textContent = `📍 ${loc ? loc.name : '알 수 없음'}`;

        const season = world.globalState.season === 'spring' ? '🌸 봄' :
            world.globalState.season === 'summer' ? '☀️ 여름' :
                world.globalState.season === 'autumn' ? '🍂 가을' : '❄️ 겨울';
        this.statusElements.weather.textContent = `${season} ${world.globalState.dayOfYear}일`;

        if (player.stats) {
            const hpPercent = (player.stats.currentHp / player.stats.maxHp) * 100;
            const mpPercent = (player.stats.currentMp / player.stats.maxMp) * 100;

            this.statusElements.hpFill.style.width = `${hpPercent}%`;
            this.statusElements.mpFill.style.width = `${mpPercent}%`;

            this.statusElements.hpText.textContent = `${player.stats.currentHp}/${player.stats.maxHp}`;
            this.statusElements.mpText.textContent = `${player.stats.currentMp}/${player.stats.maxMp}`;
        }
    }

    // 플레이어 목록 업데이트
    updatePlayerList(players: PlayerInfo[]) {
        if (players.length > 1) {
            this.statusElements.playersList.classList.remove('hidden');
            this.statusElements.playersContainer.innerHTML = '';
            players.forEach(p => {
                const li = document.createElement('li');
                li.textContent = `${p.name}${p.isHost ? ' (방장)' : ''}${p.isMe ? ' (나)' : ''}`;
                this.statusElements.playersContainer.appendChild(li);
            });
        } else {
            this.statusElements.playersList.classList.add('hidden');
        }
    }

    // 화면 전환
    showScreen(screenId: 'start-menu' | 'game-screen') {
        document.getElementById('start-menu')!.classList.add('hidden');
        document.getElementById('game-screen')!.classList.add('hidden');
        document.getElementById(screenId)!.classList.remove('hidden');
    }

    // 전투 화면 렌더링
    renderCombatScreen(enemy: { name: string, hp: number, maxHp: number }) {
        // 기존 출력에 구분선 추가
        this.print(`\n⚔️ 전투 개시! vs ${enemy.name}`, 'combat');

        // 적 상태 표시를 위한 HTML 생성 (로그에 추가)
        const enemyStatusDiv = document.createElement('div');
        enemyStatusDiv.className = 'combat-status';

        const percent = Math.max(0, Math.min(100, (enemy.hp / enemy.maxHp) * 100));
        const barColor = percent > 50 ? '#ff4444' : percent > 20 ? '#ffaa00' : '#ff0000';

        enemyStatusDiv.innerHTML = `
            <div style="margin-bottom: 5px;"><strong>${enemy.name}</strong> (HP: ${enemy.hp}/${enemy.maxHp})</div>
            <div style="width: 200px; height: 15px; background: #330000; border: 1px solid #550000;">
                <div style="width: ${percent}%; height: 100%; background: ${barColor}; transition: width 0.3s;"></div>
            </div>
        `;

        this.outputElement.appendChild(enemyStatusDiv);
        this.scrollToBottom();
    }

    // 레벨업 화면 렌더링
    renderLevelUp(level: number, statPoints: number) {
        this.print(`\n🎉 레벨 업! (Lv.${level})`, 'system');
        this.print(`💪 사용할 수 있는 스탯 포인트: ${statPoints}`, 'system');
    }
}

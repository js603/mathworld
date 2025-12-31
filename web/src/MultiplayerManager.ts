import Peer, { DataConnection } from 'peerjs';

// 메시지 타입 정의
export type MessageType =
    | { type: 'join', playerId: string, playerName: string }
    | { type: 'welcome', players: { id: string, name: string }[], hostId: string }
    | { type: 'player_joined', player: { id: string, name: string } }
    | { type: 'player_left', playerId: string, newHostId?: string }
    | { type: 'chat', playerId: string, message: string }
    | { type: 'game_action', playerId: string, action: any };

export interface PlayerInfo {
    id: string;
    name: string;
    isHost: boolean;
    isMe: boolean;
}

export class MultiplayerManager {
    private peer: Peer;
    private connections: Map<string, DataConnection> = new Map();
    private players: Map<string, string> = new Map(); // id -> name
    private hostId: string | null = null;
    private myId: string;
    private myName: string;
    private callbacks: {
        onPlayerListUpdate?: (players: PlayerInfo[]) => void;
        onMessage?: (msg: MessageType) => void;
        onConnect?: (roomId: string) => void;
    } = {};

    constructor(name: string) {
        this.myName = name;
        this.peer = new Peer();

        this.peer.on('open', (id) => {
            this.myId = id;
            console.log('My Peer ID:', id);
        });

        this.peer.on('connection', (conn) => {
            this.handleConnection(conn);
        });
    }

    // 호스트로서 방 생성
    createRoom(callback: (roomId: string) => void) {
        if (!this.myId) {
            setTimeout(() => this.createRoom(callback), 100);
            return;
        }
        this.hostId = this.myId;
        this.players.set(this.myId, this.myName);
        this.updatePlayerList();
        callback(this.myId);
        if (this.callbacks.onConnect) this.callbacks.onConnect(this.myId);
    }

    // 방 참가
    joinRoom(hostId: string) {
        if (!this.myId) {
            setTimeout(() => this.joinRoom(hostId), 100);
            return;
        }

        const conn = this.peer.connect(hostId);

        conn.on('open', () => {
            this.handleConnection(conn);
            conn.send({ type: 'join', playerId: this.myId, playerName: this.myName });
            if (this.callbacks.onConnect) this.callbacks.onConnect(hostId);
        });
    }

    private handleConnection(conn: DataConnection) {
        this.connections.set(conn.peer, conn);

        conn.on('data', (data: any) => {
            this.handleMessage(data as MessageType, conn.peer);
        });

        conn.on('close', () => {
            this.handleDisconnect(conn.peer);
        });

        conn.on('error', (err) => {
            console.error('Connection error:', err);
            this.handleDisconnect(conn.peer);
        });
    }

    private handleMessage(msg: MessageType, senderId: string) {
        switch (msg.type) {
            case 'join':
                if (this.isHost()) {
                    // 새 플레이어에게 환영 메시지 및 기존 플레이어 목록 전송
                    this.connections.get(senderId)?.send({
                        type: 'welcome',
                        players: Array.from(this.players.entries()).map(([id, name]) => ({ id, name })),
                        hostId: this.myId
                    });

                    // 다른 플레이어들에게 새 플레이어 알림
                    this.broadcast({
                        type: 'player_joined',
                        player: { id: senderId, name: msg.playerName }
                    }, senderId);

                    this.players.set(senderId, msg.playerName);
                    this.updatePlayerList();
                }
                break;

            case 'welcome':
                this.hostId = msg.hostId;
                this.players.clear();
                msg.players.forEach(p => this.players.set(p.id, p.name));
                // 나 자신도 추가
                this.players.set(this.myId, this.myName);
                this.updatePlayerList();
                break;

            case 'player_joined':
                this.players.set(msg.player.id, msg.player.name);
                this.updatePlayerList();
                break;

            case 'player_left':
                this.players.delete(msg.playerId);
                if (msg.newHostId) {
                    this.hostId = msg.newHostId;
                    if (this.isHost()) {
                        console.log('You are now the HOST!');
                    }
                }
                this.updatePlayerList();
                break;

            case 'game_action':
                if (this.callbacks.onMessage) this.callbacks.onMessage(msg);
                break;
        }
    }

    private handleDisconnect(peerId: string) {
        console.log(`Player disconnected: ${peerId}`);
        this.players.delete(peerId);
        this.connections.delete(peerId);

        if (this.isHost()) {
            // 내가 호스트인데 누군가 나갔다면 다른 사람들에게 알림
            this.broadcast({ type: 'player_left', playerId: peerId });
        } else if (peerId === this.hostId) {
            // 호스트가 나갔다면? 호스트 마이그레이션 (간단히 두번째 사람이 호스트라고 가정)
            // 실제 P2P 환경에서는 복잡하지만 여기서는 단순화
            const remainingPlayers = Array.from(this.players.keys());
            if (remainingPlayers.length > 0) {
                // PeerJS ID의 알파벳 순서 등을 사용할 수 있으나, 
                // 여기서는 간단히 접속한 순서를 알기 어려우므로 알파벳 순으로 결정
                remainingPlayers.sort();
                const newHost = remainingPlayers[0];
                this.hostId = newHost;

                console.log(`Host migrated to: ${newHost}`);
                // 새 호스트가 나 자신이라면?
                // (실제 로직은 더 복잡해야 함: 서로 연결이 없는 게스트들끼리는 통신 불가할 수 있음)
                // Mesh 구조라면 괜찮음. 현재는 Star 구조(Host 중심)를 가정했으므로 호스트가 나가면 문제가 생김.
                // Star 구조에서 호스트가 나가면 네트워크가 끊어짐. 
                // 해결책: Full Mesh 구조를 사용하거나, 연결 끊김 감지 시 재접속 시도.
                // 이번 구현에서는 "호스트 연결 끊김" 알림만 띄우겠습니다.
                alert('호스트와의 연결이 끊어졌습니다.');
            }
        }

        this.updatePlayerList();
    }

    private isHost(): boolean {
        return this.myId === this.hostId;
    }

    broadcast(msg: MessageType, excludeId?: string) {
        this.connections.forEach((conn, id) => {
            if (id !== excludeId && conn.open) {
                conn.send(msg);
            }
        });
    }

    sendToHost(msg: MessageType) {
        if (this.isHost()) {
            // 내가 호스트면 나에게 바로 처리 (필요시)
            return;
        }
        if (this.hostId) {
            this.connections.get(this.hostId)?.send(msg);
        }
    }

    setPlayerListCallback(cb: (players: PlayerInfo[]) => void) {
        this.callbacks.onPlayerListUpdate = cb;
    }

    setMessageCallback(cb: (msg: MessageType) => void) {
        this.callbacks.onMessage = cb;
    }

    setConnectCallback(cb: (roomId: string) => void) {
        this.callbacks.onConnect = cb;
    }

    private updatePlayerList() {
        if (this.callbacks.onPlayerListUpdate) {
            const list: PlayerInfo[] = Array.from(this.players.entries()).map(([id, name]) => ({
                id,
                name,
                isHost: id === this.hostId,
                isMe: id === this.myId
            }));
            this.callbacks.onPlayerListUpdate(list);
        }
    }
}

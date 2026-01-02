# 텍스트 소설형 MMO RPG - 수학적 모델링 분석

## 작업 목록

- [x] 수학적 모델링 분석 보고서 작성
  - [x] 실제 세계 시뮬레이션을 위한 수학적 모델 조사
  - [x] 각 모델의 게임 적용 가능성 분석
  - [x] 보고서 작성 및 사용자 검토 요청
- [x] ChatGPT 자문 검토 및 통합 보고서 작성
- [x] 사용자 승인 후 구현 계획 수립
  - [x] 구현 계획서 작성
  - [x] 사용자 승인
- [x] Phase 1: 핵심 엔진 구현 ✅
  - [x] 프로젝트 초기화 (package.json, tsconfig.json)
  - [x] types.ts (핵심 타입 정의)
  - [x] WorldState.ts (세계 상태 관리)
  - [x] Character.ts (인물 모델)
  - [x] RelationGraph.ts (관계 그래프)
  - [x] UtilityAI.ts (효용 함수 AI)
  - [x] ChoiceGenerator.ts (동적 선택지)
  - [x] 데모 실행 성공
- [x] Phase 2: 서사 엔진 구현 ✅
  - [x] FeedbackLoop.ts
  - [x] EventGenerator.ts
  - [x] BeliefSystem.ts
  - [x] TextRenderer.ts
  - [x] 데모 실행 성공
- [x] Phase 3: 확장 시스템 구현 ✅
  - [x] Economy.ts (수요공급, 인플레이션)
  - [x] Ecosystem.ts (Lotka-Volterra)
  - [x] Weather.ts (마르코프 체인)
  - [x] Disease.ts (SIR 모델)
- [x] 프로젝트 구조 정비 ✅
  - [x] utils 분리 (Math.ts, Graph.ts)
  - [x] game/ 폴더 생성 (GameLoop, PlayerAction, Combat)
  - [x] data/ 폴더 생성 (characters.json, locations.json, templates/, rules/)
  - [x] tests/ 폴더 생성 (core/, narrative/, simulation/)
- [x] 검증 및 테스트 ✅
  - [x] 단위 테스트 30개 통과
  - [x] 100턴 시뮬레이션 분석 완료
  - [x] 파라미터 밸런싱 (생태계, 전염병)
  - [x] 레벨업/퀘스트 시스템 연동 및 경험치 버그 수정 ✅
- [x] CLI 인터랙티브 게임 ✅
  - [x] game_cli.ts 구현
  - [x] NPC 상호작용 버그 수정
  - [x] 게임 플레이 테스트 완료

---

## 확장 기능 구현

- [x] **1차: 세이브/로드 + NPC/장소** ✅
  - [x] SaveSystem.ts 구현
  - [x] saves/ 디렉토리 생성
  - [x] game_cli.ts에 저장/불러오기 메뉴 추가
  - [x] characters.json 확장 (+8 NPC)
  - [x] locations.json 확장 (+6 장소)
  - [x] npc_schedules.json 생성
  - [x] 저장/불러오기 테스트 완료

- [x] **2차: 전투 + 성장 시스템** ✅
  - [x] types.ts 확장 (CombatStats, Equipment, Skill, Item)
  - [x] Location 타입 확장 (dangerLevel, 새 장소 유형)
  - [x] LevelSystem.ts 구현
  - [x] enemies.json 생성 (7종)
  - [x] items.json 생성 (30+종)
  - [x] skills.json 생성 (16종)
  - [x] game_cli.ts에 전투/레벨업 UI 추가

- [x] **3차: 웹 버전 + 멀티플레이어** ✅
  - [x] web/ 디렉토리 구조 생성
  - [x] Vite + TypeScript 설정
  - [x] GameRenderer.ts (텍스트 UI)
  - [x] MultiplayerManager.ts (PeerJS)
  - [x] 호스트 마이그레이션 구현
  - [x] 전투 및 성장 시스템 웹 이식 (LevelSystem, Combat UI) ✅
  - [x] JSON 데이터 통합 (적, 아이템, 장소) ✅
  - [x] 자동 데모 및 시스템 분석 기능 (DemoRunner) ✅
  - [x] 전투 발생 로직 정상화 및 CLI 동기화 (데이터 덮어쓰기 + Fallback 적용) ✅
  - [x] 스마트 오토 스크롤 구현 (수동 감지 + 선택지 보정) ✅
  - [x] GitHub Pages 배포 준비 ✅

- [x] **4차: 웹 래퍼 재구축 (CLI 동일 플레이)** ✅
  - [x] GameIO.ts 인터페이스 정의
  - [x] GameCore.ts 추출 (game_cli.ts에서 로직 분리)
  - [x] WebSaveSystem.ts 구현 (localStorage 기반)
  - [x] WebIO.ts 구현 (터치 친화적 UI)
  - [x] 모바일 반응형 CSS
  - [x] CliIO.ts 생성 (readline 기반)
  - [x] game_cli.ts 리팩토링 (GameCore 사용)
  - [x] 통합 테스트 완료

- [x] **5차: 살아있는 세계 경험 개선** ✅
  - [x] 상점 시스템 (경제 시스템 연동)
  - [x] 질병/재해 알림 시스템
  - [x] NPC 인식 표시 (BeliefSystem 연동)

- [x] **6차: 깊이 있는 경험 (2순위)** 완료
  - [x] 파벌 시스템 활성화 (RelationGraph.getClusters)
  - [x] 소문 확산 표시 (simulateRumorSpread)
  - [x] NPC 자율 의사결정 (UtilityAI 활용)

- [x] **7차: 폴리싱 및 3순위** 완료
  - [x] 이모지/아이콘 전면 삭제
  - [x] 사냥/채집 시스템 (생태계 상호작용)
  - [x] 퀘스트 시스템 (장기 목표)

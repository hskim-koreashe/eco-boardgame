# 풀숲 기억교실 🌱

[환경아카이브 풀숲](https://ecoarchive.org/)의 실제 소장 사진으로 만든 실시간 멀티플레이어 기억력 게임.
관람객이 각자 휴대폰으로 접속해 **함께 사진을 들여다보고, 가려진 뒤 기억으로 맞히는** 전시장용 게임입니다.

**🔗 지금 해보기**
- https://eco-game-1234.web.app (Firebase Hosting)
- https://hskim-koreashe.github.io/eco-boardgame/ (GitHub Pages)

같은 Firebase 프로젝트를 쓰기 때문에 방 코드는 두 주소 중 어느 쪽에서 만들어도 서로 통합니다.

![학습 화면](docs/screenshots/study.png)

## 어떤 게임인가요

1. **학습 (한 장당 5초 × 8장)** — 방장이 시작하면 사건 카드가 오래된 순서로 한 장씩 크게 뜹니다(사진·연도·한 줄 이야기). 전원이 같은 순서, 같은 속도로 봅니다.
2. **정답 맞히기 (8문항)** — 카드가 사라지고, 방금 본 사진/사건을 4지선다로 묻습니다. 보기는 전부 방금 본 8건 안에서만 나와서 순수 상식이 아니라 진짜 기억을 시험합니다. 전원이 답하면 3초 뒤 바로 다음 문제로.
3. **순서로 줄 세우기 (35초)** — 방금 본 8건을 뒤섞어 보여주고, 오래된 순서대로 눌러 배열합니다. 낱개 사실이 아니라 흐름 전체를 기억해야 풀립니다.
4. **결과** — 점수 합산 후 오늘 함께 본 8건이 다시 보이고, 각각 풀숲 원문 소장자료로 이어집니다.

로그인도 앱 설치도 필요 없습니다. 방을 만들면 5자리 코드가 나오고, 나머지는 코드만 입력하면 됩니다. 1~10인, 한 판 3~4분.

자세한 규칙과 설계 의도는 [RULES.md](RULES.md)에 있습니다.

## 구조

```
public/            정적 사이트 (Firebase Hosting에 배포)
├─ index.html      방 만들기 / 참가하기
├─ room.html        대기실 → 학습 → 퀴즈 → 결과
├─ js/game.js       게임 진행 로직 (Firestore 트랜잭션 기반 상태 기계)
├─ css/style.css    파스텔톤 디자인
├─ data/cards.json  환경아카이브 사건 카드 47장 (연도·사진·해설·hook 문장)
└─ img/             카드별 소장자료 사진

firestore.rules     보안 규칙 (익명 로그인 사용자면 누구나 방 생성·참가)
firebase.json       Hosting/Firestore 배포 설정
RULES.md            게임 규칙과 설계 이유
SETUP.md            Firebase 프로젝트 연결·배포 가이드
design-drafts/      (참고용) 실물 보드게임 패키지 디자인 시안 3종
```

## 데이터 출처

사건 카드와 사진은 [ArchivelabEdu/ecoarchive-impact2026](https://github.com/ArchivelabEdu/ecoarchive-impact2026) 저장소가
정리한 [환경아카이브 풀숲](https://ecoarchive.org/) 소장자료를 바탕으로 합니다. 학습 카드의 한 줄 요약은
원문 해설을 자르지 않고, 사망·부상·반대·백지화 같은 핵심 사건 키워드가 담긴 문장을 골라 쓰는 방식으로
만들었습니다(내용을 새로 짓지 않고 원문에서 고르기만 합니다). 자세한 기준은 [RULES.md](RULES.md#카드-설명-문장--기계적-발췌-대신-가장-인상적인-한-줄)에 있습니다.

## 로컬에서 실행

```bash
cd public && python3 -m http.server 8080
```

`http://localhost:8080` 접속. 단, `public/js/firebase-config.js`에 본인 Firebase 프로젝트 값을 채워야
방 생성·참가가 동작합니다. 처음부터 배포하는 방법은 [SETUP.md](SETUP.md)를 참고하세요.

## 배포

```bash
# Firebase Hosting
npx firebase-tools deploy --project <프로젝트ID>

# GitHub Pages (public/ 폴더를 gh-pages 브랜치 루트로 올림)
git subtree push --prefix=public origin gh-pages
```

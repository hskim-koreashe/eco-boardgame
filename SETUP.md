# 배포 준비

## 1. Firebase 프로젝트 만들기

1. [console.firebase.google.com](https://console.firebase.google.com) → **프로젝트 추가**. 이름은 자유(예: `eco-game`).
2. 애널리틱스는 꺼도 됩니다.
3. 왼쪽 메뉴 **빌드 > Authentication** → 시작하기 → **로그인 방법** 탭 → **익명** 사용 설정.
4. 왼쪽 메뉴 **빌드 > Firestore Database** → 데이터베이스 만들기 → 위치는 `asia-northeast3`(서울) 추천 → **테스트 모드 없이** 시작(잠시 후 규칙을 이 저장소의 [firestore.rules](firestore.rules)로 덮어씁니다).
5. 프로젝트 개요 옆 톱니바퀴 → **프로젝트 설정 > 일반** → 아래로 스크롤해 **내 앱 추가 → 웹(</>)** → 앱 닉네임 아무거나 → Firebase Hosting 체크 안 해도 됨 → 등록.
6. 화면에 나오는 `firebaseConfig` 객체를 복사합니다.

## 2. 이 프로젝트에 설정 반영

[public/js/firebase-config.js](public/js/firebase-config.js) 를 열어 방금 복사한 값으로 채웁니다.
(이 파일은 공개 웹앱 식별자만 담아서 그대로 커밋해도 안전합니다 — 실제 접근 제어는 Firestore 규칙이 합니다.)

[.firebaserc](.firebaserc) 의 `"여기에-프로젝트-ID"` 를 Firebase 콘솔에 표시된 프로젝트 ID로 바꿉니다.

## 3. 배포

```bash
npx firebase-tools login
npx firebase-tools deploy
```

처음 배포 시 Hosting과 Firestore 규칙이 함께 올라갑니다. 완료되면 터미널에 나오는
`https://<프로젝트ID>.web.app` 주소가 실제 게임 링크입니다. 이 주소를 QR코드로 만들어
전시장에 두세요.

## 4. 로컬에서 미리 보기 (선택)

배포 전에 폰 없이 노트북에서 확인하려면:

```bash
cd public && python3 -m http.server 8080
```

`http://localhost:8080` 접속. 단, `firebase-config.js` 값을 채워야 방 생성/참가가 동작합니다.

## 규칙 관련 참고

[firestore.rules](firestore.rules) 는 전시장 키오스크용으로 **익명 로그인만 하면 누구나
방을 만들고 참가할 수 있게** 열려 있습니다. 개인정보나 결제가 없는 1회성 이벤트 게임이라
이 수준으로 충분하지만, 상시 운영하려면 규칙을 더 좁히는 걸 권합니다.

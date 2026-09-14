/* 방 하나(room.html)의 전체 로직: 대기실 → 학습(45초) → 정답 맞히기(8문항×10초) → 순서로 줄 세우기(35초) → 결과 */

const params = new URLSearchParams(location.search);
const CODE = (params.get("code") || "").toUpperCase();
const STUDY_MS = 45000;
const MC_MS = 10000;
const ORDER_MS = 35000;
const EARLY_ADVANCE_MS = 3000;
const N_CARDS = 8;

let CARDS = [];
let CARDS_BY_ID = {};
let ME = null;
let advancing = false; // 방장이 전환 트랜잭션을 중복 호출하지 않게 막는 플래그
let earlyScheduledFor = null; // 전원 답변 완료로 조기 전환을 예약한 quizIndex
let lastRoom = null; // 순서 맞히기 로컬 상호작용을 다시 그릴 때 쓰는 최신 room 스냅샷
let orderPick = []; // 내가 지금까지 순서대로 누른 카드 id들
let orderPickForIndex = null; // orderPick이 어느 quizIndex용인지

async function loadCards() {
  const r = await fetch("data/cards.json");
  const all = await r.json();
  CARDS = all.filter(c => c.year); // 연도 미상 카드는 "몇 년도 사건?" 퀴즈를 만들 수 없어 제외
  CARDS_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pick(a, n) { return shuffle(a).slice(0, n); }

function roomRef() { return db.collection("rooms").doc(CODE); }
const ts = ms => firebase.firestore.Timestamp.fromMillis(ms);

/* ---------- 퀴즈 생성: 정답 맞히기 8문항 + 마지막에 순서로 줄 세우기 1라운드 ---------- */
function buildQuiz(studyIds) {
  const mc = studyIds.map((id, i) => {
    const card = CARDS_BY_ID[id];
    const others = studyIds.filter(x => x !== id).map(x => CARDS_BY_ID[x]);
    const type = i % 2 === 0 ? "title" : "year";

    if (type === "title") {
      const options = shuffle([card.title, ...pick(others, 3).map(o => o.title)]);
      return { cardId: id, type, image: card.image, prompt: "이 사진은 어떤 사건인가요?", options, correctIndex: options.indexOf(card.title), timeMs: MC_MS };
    }

    const pool = [...new Set(others.map(o => o.year))].filter(y => y !== card.year);
    const distractors = pick(pool, Math.min(3, pool.length));
    while (distractors.length < 3) {
      const cand = card.year + (distractors.length + 1) * (Math.random() < 0.5 ? -1 : 1) * (2 + Math.floor(Math.random() * 6));
      if (cand !== card.year && !distractors.includes(cand)) distractors.push(cand);
    }
    const options = shuffle([card.year, ...distractors]).map(String);
    return { cardId: id, type, title: card.title, prompt: `"${card.title}"은 몇 년도 사건일까요?`, options, correctIndex: options.indexOf(String(card.year)), timeMs: MC_MS };
  });

  const orderRound = {
    type: "order",
    cardIds: shuffle(studyIds),
    correctOrder: [...studyIds].sort((a, b) => CARDS_BY_ID[a].year - CARDS_BY_ID[b].year),
    prompt: "오래된 것부터 순서대로 눌러 줄을 세워 보세요",
    timeMs: ORDER_MS
  };

  return [...mc, orderRound];
}

/* ---------- 방장: 단계 전환 ---------- */
async function startGame() {
  await db.runTransaction(async tx => {
    const snap = await tx.get(roomRef());
    const room = snap.data();
    if (room.status !== "lobby") return;

    const studyCards = pick(CARDS.map(c => c.id), N_CARDS);
    const players = {};
    for (const uid of room.baseOrder) players[`players.${uid}.answers`] = {};

    tx.update(roomRef(), {
      status: "study", studyCards,
      studyEndsAt: ts(Date.now() + STUDY_MS),
      ...players
    });
  });
}

async function advanceToQuiz() {
  await db.runTransaction(async tx => {
    const snap = await tx.get(roomRef());
    const room = snap.data();
    if (room.status !== "study") return;
    const quiz = buildQuiz(room.studyCards);
    tx.update(roomRef(), {
      status: "quiz", quiz, quizIndex: 0,
      questionEndsAt: ts(Date.now() + quiz[0].timeMs)
    });
  });
}

async function advanceQuiz() {
  await db.runTransaction(async tx => {
    const snap = await tx.get(roomRef());
    const room = snap.data();
    if (room.status !== "quiz") return;
    const next = room.quizIndex + 1;
    if (next >= room.quiz.length) {
      tx.update(roomRef(), { status: "finished" });
    } else {
      tx.update(roomRef(), { quizIndex: next, questionEndsAt: ts(Date.now() + room.quiz[next].timeMs) });
    }
  });
}

/* ---------- 참가자: 답 제출 ---------- */
async function answerQuiz(choiceIndex) {
  await db.runTransaction(async tx => {
    const snap = await tx.get(roomRef());
    const room = snap.data();
    if (room.status !== "quiz") return;
    const key = String(room.quizIndex);
    if (room.players[ME.uid]?.answers?.[key] !== undefined) return; // 이미 답함
    const q = room.quiz[room.quizIndex];
    const correct = choiceIndex === q.correctIndex;
    tx.update(roomRef(), { [`players.${ME.uid}.answers.${key}`]: { choice: choiceIndex, correct, points: correct ? 10 : 0 } });
  });
}

async function answerOrder(sequence) {
  await db.runTransaction(async tx => {
    const snap = await tx.get(roomRef());
    const room = snap.data();
    if (room.status !== "quiz") return;
    const key = String(room.quizIndex);
    if (room.players[ME.uid]?.answers?.[key] !== undefined) return;
    const q = room.quiz[room.quizIndex];
    const correctPositions = sequence.filter((id, i) => id === q.correctOrder[i]).length;
    tx.update(roomRef(), { [`players.${ME.uid}.answers.${key}`]: { sequence, correctPositions, points: correctPositions * 5 } });
  });
}

/* ---------- 순서로 줄 세우기: 탭 UI (제출 전까지는 로컬 상태) ---------- */
function orderTap(cardId) {
  if (orderPick.includes(cardId) || orderPick.length >= 8) return;
  orderPick = [...orderPick, cardId];
  if (orderPick.length === 8) answerOrder(orderPick).catch(() => {});
  if (lastRoom) renderQuiz(lastRoom);
}
function orderUndo() {
  orderPick = orderPick.slice(0, -1);
  if (lastRoom) renderQuiz(lastRoom);
}

/* ---------- 렌더링 ---------- */
let lastStatus = null;
function render(room) {
  lastRoom = room;
  document.getElementById("roomcode").textContent = CODE;
  if (room.status !== lastStatus) advancing = false;
  lastStatus = room.status;

  if (room.status === "lobby") renderLobby(room);
  else if (room.status === "study") renderStudy(room);
  else if (room.status === "quiz") renderQuiz(room);
  else renderFinished(room);
}

function renderLobby(room) {
  show("lobby"); hide("study"); hide("quiz"); hide("finished");
  const names = room.baseOrder.map(uid => room.players[uid]?.name || "?");
  document.getElementById("lobbyPlayers").innerHTML = names.map(n => `<span class="pl">${esc(n)}</span>`).join("");
  const isHost = ME.uid === room.hostUid;
  const startBtn = document.getElementById("startBtn");
  startBtn.hidden = !isHost;
  startBtn.disabled = false;
  document.getElementById("lobbyHint").textContent = isHost
    ? "혼자여도, 열 명이 모여도 시작할 수 있어요."
    : "방장이 시작하기를 기다리는 중...";
}

function renderStudy(room) {
  hide("lobby"); show("study"); hide("quiz"); hide("finished");
  document.getElementById("studyGrid").innerHTML = room.studyCards.map(id => {
    const c = CARDS_BY_ID[id];
    return `<div class="scard"><img src="${c.image}" alt="">
      <div class="b"><span class="yr">${c.year}</span><div class="ti">${esc(c.title)}</div><div class="de">${esc(c.hook || c.desc || "")}</div></div>
    </div>`;
  }).join("");

  const tick = () => {
    if (document.getElementById("study").hidden) return;
    const remain = room.studyEndsAt.toMillis() - Date.now();
    const pct = Math.max(0, Math.min(100, remain / STUDY_MS * 100));
    const bar = document.getElementById("studyBar");
    bar.querySelector("i").style.width = pct + "%";
    bar.classList.toggle("warn", remain < 15000);
    document.getElementById("studySec").textContent = Math.max(0, Math.ceil(remain / 1000));
    if (remain <= 0) {
      if (ME.uid === room.hostUid && !advancing) { advancing = true; advanceToQuiz().catch(() => {}).finally(() => { advancing = false; }); }
    } else {
      requestAnimationFrame(tick);
    }
  };
  tick();
}

function renderQuiz(room) {
  hide("lobby"); hide("study"); show("quiz"); hide("finished");
  const q = room.quiz[room.quizIndex];
  document.getElementById("qNo").textContent = room.quizIndex + 1;

  document.getElementById("players2").innerHTML = room.baseOrder.map(uid => {
    const p = room.players[uid];
    const answered = p.answers?.[String(room.quizIndex)] !== undefined;
    const cls = ["pl"];
    if (uid === ME.uid) cls.push("you");
    if (answered) cls.push("turn");
    return `<span class="${cls.join(" ")}">${answered ? "✅ " : "⏳ "}${esc(p.name)}</span>`;
  }).join("");

  const mine = room.players[ME.uid]?.answers?.[String(room.quizIndex)];

  if (q.type === "order") {
    if (orderPickForIndex !== room.quizIndex) { orderPick = []; orderPickForIndex = room.quizIndex; }
    const picked = mine ? mine.sequence : orderPick;
    const slots = Array.from({ length: 8 }, (_, i) => {
      const id = picked[i];
      const c = id != null ? CARDS_BY_ID[id] : null;
      let cls = "oslot";
      if (mine && id != null) cls += id === q.correctOrder[i] ? " ok" : " bad";
      return `<div class="${cls}">${c ? `<img src="${c.image}"><span class="oy">${mine ? c.year : "?"}</span>` : `<span class="on">${i + 1}</span>`}</div>`;
    }).join("");

    const pool = q.cardIds.map(id => {
      const c = CARDS_BY_ID[id];
      const used = picked.includes(id);
      return `<button class="opick" ${used || mine ? "disabled" : ""} onclick="orderTap(${id})"><img src="${c.image}"><div class="ot">${esc(c.title)}</div></button>`;
    }).join("");

    document.getElementById("qcard").innerHTML = `
      <div class="qtext">${esc(q.prompt)}</div>
      <div class="oslots">${slots}</div>
      ${!mine ? `<button class="btn ghost" ${orderPick.length ? "" : "disabled"} onclick="orderUndo()" style="margin-bottom:10px">← 마지막 하나 되돌리기</button>` : ""}
      <div class="opool">${pool}</div>
      ${mine ? `<div class="msg ${mine.correctPositions >= 5 ? "ok" : "bad"}">${mine.correctPositions}/8 정확한 자리 · +${mine.points}점</div>` : `<div class="waitchip"><span class="spin"></span> 8장을 다 놓으면 자동 제출됩니다</div>`}
    `;
  } else {
    const img = q.type === "title" ? `<img src="${q.image}" alt="">` : "";
    document.getElementById("qcard").innerHTML = `
      ${img}
      <div class="qtext">${esc(q.prompt)}</div>
      <div class="opts">${q.options.map((o, i) => {
        let cls = "opt";
        let dis = mine ? "disabled" : "";
        if (mine) {
          if (i === q.correctIndex) cls += " ok";
          else if (i === mine.choice) cls += " bad";
        }
        return `<button class="${cls}" ${dis} onclick="answerQuiz(${i}).catch(e=>{})">${esc(o)}${q.type === "year" ? "년" : ""}</button>`;
      }).join("")}</div>
      ${mine ? `<div class="msg ${mine.correct ? "ok" : "bad"}">${mine.correct ? "정답!" : "아쉽습니다."}</div>` : `<div class="waitchip"><span class="spin"></span> ${q.timeMs / 1000}초 안에 골라 보세요</div>`}
    `;
  }

  const answeredCount = room.baseOrder.filter(uid => room.players[uid]?.answers?.[String(room.quizIndex)] !== undefined).length;
  if (ME.uid === room.hostUid && answeredCount === room.baseOrder.length && earlyScheduledFor !== room.quizIndex) {
    earlyScheduledFor = room.quizIndex;
    const atIndex = room.quizIndex;
    setTimeout(async () => {
      const snap = await roomRef().get();
      const r = snap.data();
      if (r.status === "quiz" && r.quizIndex === atIndex) advanceQuiz().catch(() => {});
    }, EARLY_ADVANCE_MS);
  }

  const tick = () => {
    if (document.getElementById("quiz").hidden) return;
    const remain = room.questionEndsAt.toMillis() - Date.now();
    const pct = Math.max(0, Math.min(100, remain / q.timeMs * 100));
    const bar = document.getElementById("quizBar");
    bar.querySelector("i").style.width = pct + "%";
    bar.classList.toggle("warn", remain < 5000);
    document.getElementById("qTimer").textContent = Math.max(0, Math.ceil(remain / 1000));
    if (remain <= 0) {
      if (ME.uid === room.hostUid && !advancing) { advancing = true; advanceQuiz().catch(() => {}).finally(() => { advancing = false; }); }
    } else {
      requestAnimationFrame(tick);
    }
  };
  tick();
}

function renderFinished(room) {
  hide("lobby"); hide("study"); hide("quiz"); show("finished");
  const orderIdx = room.quiz.findIndex(q => q.type === "order");
  const mcCount = orderIdx; // 그 앞까지가 전부 객관식 문항

  const rows = room.baseOrder.map(uid => {
    const p = room.players[uid];
    const answers = p.answers || {};
    const mcCorrect = Object.entries(answers).filter(([k, a]) => Number(k) !== orderIdx && a.correct).length;
    const orderCorrect = answers[String(orderIdx)]?.correctPositions ?? 0;
    const points = Object.values(answers).reduce((s, a) => s + (a.points || 0), 0);
    return { uid, name: p.name, mcCorrect, orderCorrect, points };
  }).sort((a, b) => b.points - a.points);

  document.getElementById("leaderboard").innerHTML = rows.map((r, i) => `
    <div class="rowp"><span class="rank">${i === 0 ? "🏆" : i + 1}</span><span class="nm">${esc(r.name)}${r.uid === ME.uid ? " (나)" : ""} · 정답 ${r.mcCorrect}/${mcCount} · 순서 ${r.orderCorrect}/8</span><span class="pts">${r.points}점</span></div>
  `).join("");

  document.getElementById("studied").innerHTML = room.studyCards.map(id => {
    const c = CARDS_BY_ID[id];
    return `<a href="${c.url}" target="_blank" rel="noopener"><img src="${c.image}"><div class="t">${c.year} · ${esc(c.title)}</div></a>`;
  }).join("");
}

function show(id) { document.getElementById(id).hidden = false; }
function hide(id) { document.getElementById(id).hidden = true; }

/* ---------- 시작 ---------- */
(async function init() {
  if (!/^[A-Z0-9]{5}$/.test(CODE)) { document.body.innerHTML = "<p style='padding:20px'>잘못된 방 코드입니다.</p>"; return; }
  await loadCards();
  ME = await ensureSignedIn();

  document.getElementById("startBtn").onclick = () => startGame().catch(e => alert(e.message));

  roomRef().onSnapshot(snap => {
    if (!snap.exists) { document.body.innerHTML = "<p style='padding:20px'>방이 사라졌습니다.</p>"; return; }
    const room = snap.data();
    if (!room.players[ME.uid]) { location.href = "index.html"; return; }
    render(room);
  });
})();

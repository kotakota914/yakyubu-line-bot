// db.js
// ネイティブ依存なしのシンプルなJSONファイルDB。
// 同時アクセスが少ない部内利用を想定しているため、都度ファイルを
// 読み書きするシンプルな方式にしている（Renderの無料枠でもそのまま動く）。

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

const EMPTY_DB = {
  tournaments: {}, // { [大会名]: { members: string[], createdAt: string } }
  games: [],       // { id, opponent, date, time, place, createdAt }
  practices: [],   // { id, date, time, place, content, createdAt }
  announcements: [], // { id, body, createdAt }
  admins: [],      // string[] (LINE userId)
  nextId: 1
};

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    saveDB(EMPTY_DB);
    return JSON.parse(JSON.stringify(EMPTY_DB));
  }
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    // 欠けているキーがあれば補完(将来の項目追加に強くするため)
    return { ...JSON.parse(JSON.stringify(EMPTY_DB)), ...parsed };
  } catch (e) {
    console.error('[db] JSON parse error, backing up and resetting:', e.message);
    fs.copyFileSync(DB_PATH, DB_PATH + '.broken-' + Date.now());
    saveDB(EMPTY_DB);
    return JSON.parse(JSON.stringify(EMPTY_DB));
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
}

function nextId(db) {
  const id = db.nextId || 1;
  db.nextId = id + 1;
  return id;
}

// ---------- 管理者 ----------
function isAdmin(userId) {
  const db = loadDB();
  return db.admins.includes(userId);
}

function addAdmin(userId) {
  const db = loadDB();
  if (!db.admins.includes(userId)) {
    db.admins.push(userId);
    saveDB(db);
    return true;
  }
  return false;
}

function listAdmins() {
  return loadDB().admins;
}

// ---------- 大会・メンバー ----------
function createTournament(name) {
  const db = loadDB();
  if (db.tournaments[name]) return false;
  db.tournaments[name] = { members: [], createdAt: new Date().toISOString() };
  saveDB(db);
  return true;
}

function deleteTournament(name) {
  const db = loadDB();
  if (!db.tournaments[name]) return false;
  delete db.tournaments[name];
  saveDB(db);
  return true;
}

function listTournaments() {
  const db = loadDB();
  return Object.entries(db.tournaments)
    .map(([name, v]) => ({ name, count: v.members.length, createdAt: v.createdAt }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getLatestTournamentName() {
  const list = listTournaments();
  return list.length > 0 ? list[0].name : null;
}

function addMembers(name, members) {
  const db = loadDB();
  if (!db.tournaments[name]) return null;
  const set = new Set(db.tournaments[name].members);
  members.forEach((m) => set.add(m));
  db.tournaments[name].members = Array.from(set);
  saveDB(db);
  return db.tournaments[name].members;
}

function removeMember(name, member) {
  const db = loadDB();
  if (!db.tournaments[name]) return null;
  const before = db.tournaments[name].members.length;
  db.tournaments[name].members = db.tournaments[name].members.filter((m) => m !== member);
  saveDB(db);
  return before !== db.tournaments[name].members.length;
}

function getMembers(name) {
  const db = loadDB();
  return db.tournaments[name] ? db.tournaments[name].members : null;
}

// ---------- 試合日程 ----------
function addGame({ opponent, date, time, place }) {
  const db = loadDB();
  const game = { id: nextId(db), opponent, date, time, place, createdAt: new Date().toISOString() };
  db.games.push(game);
  saveDB(db);
  return game;
}

function listGames() {
  const db = loadDB();
  return [...db.games].sort((a, b) => parseDateForSort(a.date) - parseDateForSort(b.date));
}

function removeGame(id) {
  const db = loadDB();
  const before = db.games.length;
  db.games = db.games.filter((g) => g.id !== id);
  saveDB(db);
  return before !== db.games.length;
}

// ---------- 練習日程 ----------
function addPractice({ date, time, place, content }) {
  const db = loadDB();
  const practice = { id: nextId(db), date, time, place, content, createdAt: new Date().toISOString() };
  db.practices.push(practice);
  saveDB(db);
  return practice;
}

function listPractices() {
  const db = loadDB();
  return [...db.practices].sort((a, b) => parseDateForSort(a.date) - parseDateForSort(b.date));
}

function removePractice(id) {
  const db = loadDB();
  const before = db.practices.length;
  db.practices = db.practices.filter((p) => p.id !== id);
  saveDB(db);
  return before !== db.practices.length;
}

// ---------- お知らせ・連絡 ----------
function addAnnouncement(body) {
  const db = loadDB();
  const item = { id: nextId(db), body, createdAt: new Date().toISOString() };
  db.announcements.push(item);
  saveDB(db);
  return item;
}

function listAnnouncements(limit = 10) {
  const db = loadDB();
  return [...db.announcements]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

// "7/20" のような日付文字列を今年基準でDateに変換(ソート用)。
// 過去日付(今日より30日以上前)は来年の日付とみなし、年をまたぐ大会日程も自然に並ぶようにする。
function parseDateForSort(dateStr) {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec((dateStr || '').trim());
  if (!m) return new Date(8640000000000000); // パース不能な値は末尾に送る
  const now = new Date();
  let year = now.getFullYear();
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  let candidate = new Date(year, month - 1, day);
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  if (candidate.getTime() < now.getTime() - THIRTY_DAYS) {
    candidate = new Date(year + 1, month - 1, day);
  }
  return candidate;
}

module.exports = {
  loadDB,
  saveDB,
  isAdmin,
  addAdmin,
  listAdmins,
  createTournament,
  deleteTournament,
  listTournaments,
  getLatestTournamentName,
  addMembers,
  removeMember,
  getMembers,
  addGame,
  listGames,
  removeGame,
  addPractice,
  listPractices,
  removePractice,
  addAnnouncement,
  listAnnouncements,
  parseDateForSort
};

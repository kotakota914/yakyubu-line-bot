// index.js
// 野球部公式LINEアカウントのWebhookサーバー本体。
// タブ切り替えリッチメニュー(大会メンバー/試合日程/練習日程/連絡)から
// 送られてくる定型テキストと、部員が直接打つコマンドの両方をここで処理する。

require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const cron = require('node-cron');
const db = require('./db');
const { parseCommand } = require('./parser');

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

if (!config.channelAccessToken || !config.channelSecret) {
  console.error('[FATAL] .env に LINE_CHANNEL_ACCESS_TOKEN / LINE_CHANNEL_SECRET を設定してください');
  process.exit(1);
}

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

const app = express();

app.get('/', (_req, res) => res.send('yakyubu-line-bot is running'));

app.post('/webhook', line.middleware(config), (req, res) => {
  Promise.all((req.body.events || []).map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error('[webhook error]', err);
      res.status(500).end();
    });
});

async function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return null;
  }
  const userId = event.source && event.source.userId;
  const cmd = parseCommand(event.message.text);
  let replyText;
  try {
    replyText = await routeCommand(cmd, userId);
  } catch (err) {
    console.error('[routeCommand error]', err);
    replyText = '⚠️ 処理中にエラーが発生しました。もう一度お試しください。';
  }
  if (!replyText) return null;
  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [{ type: 'text', text: replyText }]
  });
}

function requireAdmin(userId, fn) {
  if (!userId || !db.isAdmin(userId)) {
    return '⚠️ この操作は監督・マネージャーなど登録済みの管理者のみ行えます。\n「管理者登録 合言葉」で登録してください。';
  }
  return fn();
}

async function routeCommand(cmd, userId) {
  switch (cmd.type) {
    case 'help_general':
      return HELP_GENERAL;
    case 'help_tournament':
      return HELP_TOURNAMENT;
    case 'help_game':
      return HELP_GAME;
    case 'help_practice':
      return HELP_PRACTICE;
    case 'help_announcement':
      return HELP_ANNOUNCEMENT;

    case 'admin_register': {
      if (!process.env.ADMIN_SECRET) {
        return '⚠️ サーバー側で合言葉(ADMIN_SECRET)が未設定です。管理者に確認してください。';
      }
      if (!cmd.secret || cmd.secret !== process.env.ADMIN_SECRET) {
        return '❌ 合言葉が違います。';
      }
      const added = db.addAdmin(userId);
      return added ? '✅ 管理者として登録しました。' : 'すでに管理者として登録済みです。';
    }
    case 'admin_list':
      return requireAdmin(userId, () => `現在の管理者数: ${db.listAdmins().length}人`);

    // ---- 大会・メンバー ----
    case 'tournament_create':
      return requireAdmin(userId, () => {
        if (!cmd.name) return '大会名を指定してください。例: 大会登録 夏季大会';
        const ok = db.createTournament(cmd.name);
        return ok
          ? `✅「${cmd.name}」を登録しました。続けて「大会メンバー登録 ${cmd.name}」でメンバーを登録できます。`
          : `「${cmd.name}」はすでに存在します。`;
      });
    case 'tournament_delete':
      return requireAdmin(userId, () => {
        const ok = db.deleteTournament(cmd.name);
        return ok ? `🗑「${cmd.name}」を削除しました。` : `「${cmd.name}」が見つかりません。`;
      });
    case 'tournament_list': {
      const list = db.listTournaments();
      if (list.length === 0) return 'まだ大会が登録されていません。「大会登録 大会名」で登録できます。';
      const body = list.map((t) => `・${t.name}（${t.count}名）`).join('\n');
      return `📋 大会一覧\n${body}`;
    }
    case 'tournament_member_add':
      return requireAdmin(userId, () => {
        if (!cmd.name) return '大会名を指定してください。例: 大会メンバー登録 夏季大会';
        if (!cmd.members || cmd.members.length === 0) {
          return '登録するメンバー名を2行目以降に1人ずつ入力してください。\n例:\n大会メンバー登録 夏季大会\n永井\n中川';
        }
        const members = db.addMembers(cmd.name, cmd.members);
        if (members === null) return `「${cmd.name}」が見つかりません。先に「大会登録 ${cmd.name}」を実行してください。`;
        return `✅「${cmd.name}」に${cmd.members.length}名追加しました。\n現在${members.length}名: ${members.join('、')}`;
      });
    case 'tournament_member_remove':
      return requireAdmin(userId, () => {
        if (!cmd.name || !cmd.member) return '入力形式: 大会メンバー削除 大会名 名前';
        const ok = db.removeMember(cmd.name, cmd.member);
        return ok ? `🗑「${cmd.name}」から${cmd.member}を削除しました。` : '該当するメンバーが見つかりませんでした。';
      });
    case 'tournament_member_list': {
      const name = cmd.name || db.getLatestTournamentName();
      if (!name) return 'まだ大会が登録されていません。「大会一覧」で確認できます。';
      const members = db.getMembers(name);
      if (members === null) return `「${name}」が見つかりません。「大会一覧」で名前を確認してください。`;
      if (members.length === 0) return `「${name}」にはまだメンバーが登録されていません。`;
      return `👥「${name}」メンバー（${members.length}名）\n${members.join('、')}`;
    }

    // ---- 試合 ----
    case 'game_add':
      return requireAdmin(userId, () => {
        if (!cmd.opponent || !cmd.date || !cmd.time) {
          return '入力形式: 試合登録 対戦相手 日付 時間 場所\n例: 試合登録 金沢工業高校 7/20 9:00 県営球場';
        }
        const g = db.addGame(cmd);
        return `✅ 試合を登録しました（No.${g.id}）\n${formatGame(g)}`;
      });
    case 'game_list': {
      const games = db.listGames();
      if (games.length === 0) return 'まだ試合が登録されていません。';
      return `⚾️ 試合日程\n${games.map((g) => `No.${g.id} ${formatGame(g)}`).join('\n')}`;
    }
    case 'game_remove':
      return requireAdmin(userId, () => {
        if (isNaN(cmd.id)) return '削除する試合の番号を指定してください。例: 試合削除 3';
        const ok = db.removeGame(cmd.id);
        return ok ? `🗑 No.${cmd.id} を削除しました。` : '該当する試合が見つかりませんでした。';
      });

    // ---- 練習 ----
    case 'practice_add':
      return requireAdmin(userId, () => {
        if (!cmd.date || !cmd.time || !cmd.place) {
          return '入力形式: 練習登録 日付 時間 場所 内容\n例: 練習登録 7/12 16:00 グラウンド 紅白戦';
        }
        const p = db.addPractice(cmd);
        return `✅ 練習を登録しました（No.${p.id}）\n${formatPractice(p)}`;
      });
    case 'practice_list': {
      const practices = db.listPractices();
      if (practices.length === 0) return 'まだ練習予定が登録されていません。';
      return `🏃 練習日程\n${practices.map((p) => `No.${p.id} ${formatPractice(p)}`).join('\n')}`;
    }
    case 'practice_remove':
      return requireAdmin(userId, () => {
        if (isNaN(cmd.id)) return '削除する練習の番号を指定してください。例: 練習削除 2';
        const ok = db.removePractice(cmd.id);
        return ok ? `🗑 No.${cmd.id} を削除しました。` : '該当する練習が見つかりませんでした。';
      });

    // ---- 連絡 ----
    case 'announcement_add':
      return requireAdmin(userId, () => {
        if (!cmd.body) return '連絡内容を入力してください。例: 連絡 明日の練習は10時開始に変更です';
        const a = db.addAnnouncement(cmd.body);
        return `📣 連絡を投稿しました\n${formatAnnouncement(a)}`;
      });
    case 'announcement_list': {
      const list = db.listAnnouncements(10);
      if (list.length === 0) return 'まだ連絡はありません。';
      return `📣 連絡一覧（新しい順）\n\n${list.map(formatAnnouncement).join('\n\n')}`;
    }

    default:
      return 'コマンドが認識できませんでした。\n「ヘルプ」と送ると使い方が見られます。';
  }
}

function formatGame(g) {
  return `${g.date} ${g.time}〜 vs ${g.opponent}${g.place ? '（' + g.place + '）' : ''}`;
}
function formatPractice(p) {
  return `${p.date} ${p.time}〜 ${p.place}｜${p.content}`;
}
function formatAnnouncement(a) {
  const d = new Date(a.createdAt);
  const label = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `[${label}]\n${a.body}`;
}

const HELP_GENERAL = `⚾️ 野球部公式LINE ヘルプ

下部メニューのタブで「大会メンバー」「試合日程」「練習日程」「連絡」を切り替えられます。

■見るだけなら誰でもOK
・大会一覧 / 大会メンバー [大会名]
・試合一覧
・練習一覧
・連絡一覧

■登録・編集は監督・マネージャーなど管理者のみ
各タブの「使い方」ボタン、または
「大会ヘルプ」「試合ヘルプ」「練習ヘルプ」「連絡ヘルプ」
と送ってください。

まだ管理者登録がお済みでない方は
「管理者登録 合言葉」
と送ってください（合言葉は監督・マネージャーにご確認ください）。`;

const HELP_TOURNAMENT = `【大会メンバー タブの使い方】

見る（誰でもOK）
・大会一覧
・大会メンバー 大会名
　例: 大会メンバー 夏季大会
　※大会名を省略すると最新の大会を表示します

登録・編集（管理者のみ）
・大会登録 大会名
・大会メンバー登録 大会名
　2行目以降に1行1名でメンバー名を入力
　例:
　大会メンバー登録 夏季大会
　永井
　中川
・大会メンバー削除 大会名 名前
・大会削除 大会名`;

const HELP_GAME = `【試合日程 タブの使い方】

見る（誰でもOK）
・試合一覧

登録・削除（管理者のみ）
・試合登録 対戦相手 日付 時間 場所
　例: 試合登録 金沢工業高校 7/20 9:00 県営球場
・試合削除 番号
　例: 試合削除 3`;

const HELP_PRACTICE = `【練習日程 タブの使い方】

見る（誰でもOK）
・練習一覧

登録・削除（管理者のみ）
・練習登録 日付 時間 場所 内容
　例: 練習登録 7/12 16:00 グラウンド 紅白戦
・練習削除 番号
　例: 練習削除 2`;

const HELP_ANNOUNCEMENT = `【連絡 タブの使い方】

見る（誰でもOK）
・連絡一覧（直近10件を新しい順に表示）

投稿（管理者のみ）
・連絡 本文
　練習メニュー変更、集合時間、雨天時の対応など何でもOK。
　改行して複数行にしても大丈夫です。`;

// ---------- 任意: 前日/当日リマインド ----------
// .env で ENABLE_DAILY_REMINDER=true にすると、毎朝7:00に
// 当日の試合・練習予定を友だち全員へブロードキャストする。
// ※ブロードキャストは月間の無料メッセージ数を消費するので、
//   人数や運用方針を確認してから有効化すること。
if (process.env.ENABLE_DAILY_REMINDER === 'true') {
  cron.schedule('0 7 * * *', async () => {
    try {
      const today = new Date();
      const todayStr = `${today.getMonth() + 1}/${today.getDate()}`;
      const games = db.listGames().filter((g) => g.date === todayStr);
      const practices = db.listPractices().filter((p) => p.date === todayStr);
      if (games.length === 0 && practices.length === 0) return;
      const lines = ['📅 本日の予定'];
      games.forEach((g) => lines.push(`⚾️ ${formatGame(g)}`));
      practices.forEach((p) => lines.push(`🏃 ${formatPractice(p)}`));
      await client.broadcast({ messages: [{ type: 'text', text: lines.join('\n') }] });
      console.log('[reminder] broadcasted today schedule');
    } catch (err) {
      console.error('[reminder] failed:', err);
    }
  });
  console.log('[reminder] daily 7:00 reminder enabled');
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`yakyubu-line-bot listening on port ${PORT}`);
});

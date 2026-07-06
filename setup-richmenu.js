// setup-richmenu.js
// .env の LINE_CHANNEL_ACCESS_TOKEN を使って、
// 「大会メンバー / 試合日程 / 練習日程 / 連絡」の4タブを
// richmenuswitchアクションで切り替えられるリッチメニューを自動登録する。
//
// 実行するだけで以下を全自動で行う:
//   1. 前回実行分のリッチメニュー・エイリアスがあれば削除(再実行しても安全)
//   2. 4つのリッチメニューを作成
//   3. richmenu-assets/ の画像をそれぞれアップロード
//   4. members / games / practices / contact のエイリアスを作成(タブ切り替えの実体)
//   5. デフォルト表示を「大会メンバー」タブに設定
//
// 使い方:
//   node setup-richmenu.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const line = require('@line/bot-sdk');

const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error('[FATAL] .env に LINE_CHANNEL_ACCESS_TOKEN を設定してください');
  process.exit(1);
}

const client = new line.messagingApi.MessagingApiClient({ channelAccessToken: ACCESS_TOKEN });
const blobClient = new line.messagingApi.MessagingApiBlobClient({ channelAccessToken: ACCESS_TOKEN });

const ASSET_DIR = path.join(__dirname, 'richmenu-assets');
const TAB_W = 625; // 2500 / 4
const TAB_H = 170;
const FULL_W = 2500;
const FULL_H = 1686;
const PAD = 40;
const GAP = 30;

// generate_richmenu.py の描画と完全に一致させる座標計算
const contentTop = TAB_H + PAD;
const contentBottom = FULL_H - PAD;
const contentAreaH = contentBottom - contentTop;
const btnH = Math.floor((contentAreaH - GAP) / 2);

// タブの並び順(左から)。名前(NAME_PREFIX付き)・alias id・画像ファイル・
// タブバー上のタップで送信する2つのメッセージ(「一覧」「ヘルプ」)を定義。
const TABS = [
  { key: 'members', label: '大会メンバー', messages: ['大会一覧', '大会ヘルプ'] },
  { key: 'games', label: '試合日程', messages: ['試合一覧', '試合ヘルプ'] },
  { key: 'practices', label: '練習日程', messages: ['練習一覧', '練習ヘルプ'] },
  { key: 'contact', label: '連絡', messages: ['連絡一覧', '連絡ヘルプ'] },
];

const NAME_PREFIX = 'yakyubu-';

function buildAreas(tabIndex, messages) {
  const areas = [];

  // 上部のタブ切り替えバー(4分割)。どの列をタップしても対応するエイリアスへ切り替わる。
  TABS.forEach((tab, i) => {
    areas.push({
      bounds: { x: i * TAB_W, y: 0, width: TAB_W, height: TAB_H },
      action: {
        type: 'richmenuswitch',
        label: tab.label,
        richMenuAliasId: tab.key,
        data: `switch_to_${tab.key}`,
      },
    });
  });

  // 本文エリアの2ボタン(一覧を見る / 使い方)
  messages.forEach((text, i) => {
    const y0 = contentTop + i * (btnH + GAP);
    areas.push({
      bounds: { x: PAD, y: y0, width: FULL_W - PAD * 2, height: btnH },
      action: { type: 'message', label: text, text },
    });
  });

  return areas;
}

async function cleanupPrevious() {
  console.log('▶ 既存のリッチメニュー/エイリアスを確認しています...');

  // 前回作成分のエイリアスを削除(無ければ404で無視)
  for (const tab of TABS) {
    try {
      await client.deleteRichMenuAlias(tab.key);
      console.log(`  - 既存エイリアス "${tab.key}" を削除しました`);
    } catch (e) {
      // 存在しない場合は無視
    }
  }

  // 前回作成分のリッチメニュー本体を削除
  const { richmenus } = await client.getRichMenuList();
  const previous = (richmenus || []).filter((r) => r.name && r.name.startsWith(NAME_PREFIX));
  for (const r of previous) {
    await client.deleteRichMenu(r.richMenuId);
    console.log(`  - 既存リッチメニュー "${r.name}" (${r.richMenuId}) を削除しました`);
  }
}

async function createTabRichMenu(tab, index) {
  const richMenuRequest = {
    size: { width: FULL_W, height: FULL_H },
    selected: false,
    name: `${NAME_PREFIX}${tab.key}`,
    chatBarText: 'メニュー',
    areas: buildAreas(index, tab.messages),
  };

  const { richMenuId } = await client.createRichMenu(richMenuRequest);
  console.log(`✅ リッチメニュー作成: ${tab.label} (${richMenuId})`);

  const imagePath = path.join(ASSET_DIR, `richmenu_${tab.key}.png`);
  if (!fs.existsSync(imagePath)) {
    throw new Error(`画像が見つかりません: ${imagePath}\n先に "python3 generate_richmenu.py" を実行してください。`);
  }
  const blob = new Blob([fs.readFileSync(imagePath)], { type: 'image/png' });
  await blobClient.setRichMenuImage(richMenuId, blob);
  console.log(`   画像アップロード完了: ${path.basename(imagePath)}`);

  return richMenuId;
}

async function main() {
  await cleanupPrevious();

  const richMenuIds = {};
  for (let i = 0; i < TABS.length; i++) {
    richMenuIds[TABS[i].key] = await createTabRichMenu(TABS[i], i);
  }

  console.log('▶ エイリアス(タブ切り替えの実体)を作成しています...');
  for (const tab of TABS) {
    await client.createRichMenuAlias({
      richMenuAliasId: tab.key,
      richMenuId: richMenuIds[tab.key],
    });
    console.log(`  - エイリアス "${tab.key}" -> ${richMenuIds[tab.key]}`);
  }

  const defaultTab = TABS[0]; // 「大会メンバー」タブを最初に表示
  await client.setDefaultRichMenu(richMenuIds[defaultTab.key]);
  console.log(`✅ デフォルト表示タブを "${defaultTab.label}" に設定しました`);

  console.log('\n🎉 セットアップ完了です。LINEアプリでトーク画面を開き直すとメニューが反映されます。');
}

main().catch((err) => {
  console.error('[ERROR]', err?.originalError?.response?.data || err.message || err);
  process.exit(1);
});

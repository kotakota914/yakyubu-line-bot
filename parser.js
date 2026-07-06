// parser.js
// LINEに送られてきたテキストを、実行すべきコマンドに変換する。
// 1行目でコマンド名を判定し、複数行にまたがる引数(メンバー登録など)は
// 2行目以降をそのまま配列として渡す。

function parseCommand(rawText) {
  const text = (rawText || '').trim();
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return { type: 'unknown', raw: text };

  const firstLineTokens = lines[0].split(/\s+/);
  const cmd = firstLineTokens[0];
  const restOfFirstLine = firstLineTokens.slice(1);
  const otherLines = lines.slice(1);

  switch (cmd) {
    case 'ヘルプ':
      return { type: 'help_general' };
    case '大会ヘルプ':
      return { type: 'help_tournament' };
    case '試合ヘルプ':
      return { type: 'help_game' };
    case '練習ヘルプ':
      return { type: 'help_practice' };
    case '連絡ヘルプ':
      return { type: 'help_announcement' };

    case '管理者登録':
      return { type: 'admin_register', secret: restOfFirstLine[0] };
    case '管理者一覧':
      return { type: 'admin_list' };

    // ---- 大会・メンバー ----
    case '大会登録':
      return { type: 'tournament_create', name: restOfFirstLine.join(' ') };
    case '大会削除':
      return { type: 'tournament_delete', name: restOfFirstLine.join(' ') };
    case '大会一覧':
      return { type: 'tournament_list' };
    case '大会メンバー登録':
      return { type: 'tournament_member_add', name: restOfFirstLine.join(' '), members: otherLines };
    case '大会メンバー削除': {
      // 例: 大会メンバー削除 夏季大会 永井
      const name = restOfFirstLine.slice(0, -1).join(' ');
      const member = restOfFirstLine[restOfFirstLine.length - 1];
      return { type: 'tournament_member_remove', name, member };
    }
    case '大会メンバー':
      return { type: 'tournament_member_list', name: restOfFirstLine.join(' ') || null };

    // ---- 試合日程 ----
    case '試合登録': {
      // 例: 試合登録 金沢工業高校 7/20 9:00 県営球場
      const [opponent, date, time, ...placeParts] = restOfFirstLine;
      return { type: 'game_add', opponent, date, time, place: placeParts.join(' ') };
    }
    case '試合一覧':
      return { type: 'game_list' };
    case '試合削除':
      return { type: 'game_remove', id: parseInt(restOfFirstLine[0], 10) };

    // ---- 練習日程 ----
    case '練習登録': {
      // 例: 練習登録 7/12 16:00 グラウンド 紅白戦
      const [date, time, place, ...contentParts] = restOfFirstLine;
      return { type: 'practice_add', date, time, place, content: contentParts.join(' ') || 'なし' };
    }
    case '練習一覧':
      return { type: 'practice_list' };
    case '練習削除':
      return { type: 'practice_remove', id: parseInt(restOfFirstLine[0], 10) };

    // ---- 連絡・お知らせ ----
    case '連絡': {
      const bodyFirstLine = restOfFirstLine.join(' ');
      const body = [bodyFirstLine, ...otherLines].filter((l) => l.length > 0).join('\n');
      return { type: 'announcement_add', body };
    }
    case '連絡一覧':
      return { type: 'announcement_list' };

    default:
      return { type: 'unknown', raw: text };
  }
}

module.exports = { parseCommand };

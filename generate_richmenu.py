"""
generate_richmenu.py
野球部公式LINEアカウント用のタブ切り替えリッチメニュー画像を4枚生成する。
ナイトスタジアム風(紺 × LINEグリーン)のデザイン。

使い方:
  pip install Pillow
  python3 generate_richmenu.py

出力先: richmenu-assets/richmenu_members.png / richmenu_games.png /
        richmenu_practices.png / richmenu_contact.png
"""

import os
from PIL import Image, ImageDraw, ImageFont

W, H = 2500, 1686
TAB_H = 170
PAD = 40
GAP = 30

# ---- カラーパレット(ナイトスタジアム風) ----
NAVY_BG = (11, 20, 38)       # 背景の濃紺
NAVY_CARD = (22, 34, 58)     # ボタンの濃紺カード
NAVY_CARD_BORDER = (48, 68, 100)
GREEN = (6, 199, 85)         # LINEグリーン(アクセント/選択中タブ)
GREEN_DARK = (4, 130, 56)
WHITE = (240, 244, 248)
GRAY = (150, 165, 185)

FONT_DIR = "/usr/share/fonts/opentype/noto"
FONT_BOLD = os.path.join(FONT_DIR, "NotoSansCJK-Bold.ttc")
FONT_REGULAR = os.path.join(FONT_DIR, "NotoSansCJK-Regular.ttc")


def font(path, size):
    return ImageFont.truetype(path, size)


def draw_center_text(draw, box, text, fnt, fill):
    x0, y0, x1, y1 = box
    bbox = draw.textbbox((0, 0), text, font=fnt)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx = x0 + (x1 - x0 - tw) / 2 - bbox[0]
    cy = y0 + (y1 - y0 - th) / 2 - bbox[1]
    draw.text((cx, cy), text, font=fnt, fill=fill)


def rounded_rect(draw, box, radius, fill, outline=None, width=0):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


TABS = [
    {"key": "members", "label": "大会メンバー"},
    {"key": "games", "label": "試合日程"},
    {"key": "practices", "label": "練習日程"},
    {"key": "contact", "label": "連絡"},
]

CONTENT = {
    "members": [
        {"icon": "trophy", "text": "大会一覧をみる"},
        {"icon": "question", "text": "使い方"},
    ],
    "games": [
        {"icon": "baseball", "text": "試合一覧をみる"},
        {"icon": "question", "text": "使い方"},
    ],
    "practices": [
        {"icon": "stopwatch", "text": "練習一覧をみる"},
        {"icon": "question", "text": "使い方"},
    ],
    "contact": [
        {"icon": "megaphone", "text": "お知らせ一覧をみる"},
        {"icon": "question", "text": "使い方"},
    ],
}


def draw_icon(draw, cx, cy, r, icon_type, color=WHITE):
    """絵文字フォントに依存しない、ベクター描画のシンプルなアイコン。"""
    if icon_type == "trophy":
        cup_top_w, cup_bottom_w = r * 1.1, r * 0.5
        top_y, bottom_y = cy - r * 0.55, cy + r * 0.05
        draw.polygon(
            [
                (cx - cup_top_w / 2, top_y),
                (cx + cup_top_w / 2, top_y),
                (cx + cup_bottom_w / 2, bottom_y),
                (cx - cup_bottom_w / 2, bottom_y),
            ],
            fill=color,
        )
        handle_r = r * 0.32
        lw = max(2, int(r * 0.12))
        draw.arc(
            [cx - cup_top_w / 2 - handle_r * 1.3, top_y - handle_r * 0.1,
             cx - cup_top_w / 2 + handle_r * 0.5, top_y + handle_r * 1.6],
            start=80, end=280, fill=color, width=lw,
        )
        draw.arc(
            [cx + cup_top_w / 2 - handle_r * 0.5, top_y - handle_r * 0.1,
             cx + cup_top_w / 2 + handle_r * 1.3, top_y + handle_r * 1.6],
            start=260, end=100, fill=color, width=lw,
        )
        stem_w = r * 0.18
        draw.rectangle([cx - stem_w / 2, bottom_y, cx + stem_w / 2, bottom_y + r * 0.32], fill=color)
        base_w = r * 0.75
        draw.rounded_rectangle(
            [cx - base_w / 2, bottom_y + r * 0.32, cx + base_w / 2, bottom_y + r * 0.48],
            radius=max(2, int(r * 0.06)), fill=color,
        )
    elif icon_type == "baseball":
        rr = r * 0.78
        draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=WHITE, outline=(190, 60, 60), width=max(2, int(r * 0.05)))
        stitch_color = (200, 55, 55)
        sw = max(2, int(r * 0.07))
        draw.arc([cx - rr, cy - rr * 1.15, cx + rr * 0.35, cy + rr * 0.5], start=15, end=165, fill=stitch_color, width=sw)
        draw.arc([cx - rr * 0.35, cy - rr * 0.5, cx + rr, cy + rr * 1.15], start=195, end=345, fill=stitch_color, width=sw)
    elif icon_type == "stopwatch":
        lw = max(2, int(r * 0.09))
        draw.ellipse([cx - r * 0.68, cy - r * 0.5, cx + r * 0.68, cy + r * 0.86], outline=color, width=lw)
        draw.rectangle([cx - r * 0.11, cy - r * 0.85, cx + r * 0.11, cy - r * 0.5], fill=color)
        draw.rounded_rectangle([cx - r * 0.3, cy - r * 0.98, cx + r * 0.3, cy - r * 0.84], radius=max(2, int(r*0.05)), fill=color)
        draw.line([(cx, cy + r * 0.18), (cx, cy - r * 0.2)], fill=color, width=lw)
        draw.line([(cx, cy + r * 0.18), (cx + r * 0.22, cy + r * 0.18)], fill=color, width=lw)
    elif icon_type == "megaphone":
        draw.polygon(
            [
                (cx - r * 0.55, cy - r * 0.22),
                (cx - r * 0.55, cy + r * 0.22),
                (cx + r * 0.55, cy + r * 0.5),
                (cx + r * 0.55, cy - r * 0.5),
            ],
            fill=color,
        )
        draw.rectangle([cx - r * 0.8, cy - r * 0.18, cx - r * 0.55, cy + r * 0.18], fill=color)
        draw.arc([cx + r * 0.35, cy - r * 0.68, cx + r * 1.0, cy + r * 0.68], start=-35, end=35,
                  fill=color, width=max(2, int(r * 0.07)))
    elif icon_type == "question":
        f_q = font(FONT_BOLD, int(r * 1.25))
        draw_center_text(draw, (cx - r, cy - r, cx + r, cy + r), "?", f_q, color)


def draw_tab_bar(draw, current_key):
    tab_w = W // 4
    f_tab = font(FONT_BOLD, 46)
    for i, tab in enumerate(TABS):
        x0, x1 = i * tab_w, (i + 1) * tab_w
        is_current = tab["key"] == current_key
        fill = GREEN if is_current else NAVY_BG
        draw.rectangle([x0, 0, x1, TAB_H], fill=fill)
        # 区切り線
        if i > 0:
            draw.line([(x0, 0), (x0, TAB_H)], fill=(0, 0, 0, 80), width=2)
        text_color = (10, 20, 15) if is_current else GRAY
        draw_center_text(draw, (x0, 0, x1, TAB_H), tab["label"], f_tab, text_color)
        if is_current:
            # 選択中タブの下に強調ライン
            draw.rectangle([x0 + 20, TAB_H - 10, x1 - 20, TAB_H - 4], fill=(255, 255, 255))


def draw_content_buttons(draw, key):
    top = TAB_H + PAD
    bottom = H - PAD
    area_h = bottom - top
    btn_h = (area_h - GAP) // 2
    x0, x1 = PAD, W - PAD

    f_label = font(FONT_BOLD, 68)

    for i, item in enumerate(CONTENT[key]):
        y0 = top + i * (btn_h + GAP)
        y1 = y0 + btn_h
        rounded_rect(draw, (x0, y0, x1, y1), 36, fill=NAVY_CARD, outline=NAVY_CARD_BORDER, width=3)

        # 左側にアイコンの丸バッジ(絵文字フォントに依存しないベクター描画)
        badge_r = int(btn_h * 0.34)
        badge_cx = x0 + 170
        badge_cy = (y0 + y1) // 2
        draw.ellipse(
            [badge_cx - badge_r, badge_cy - badge_r, badge_cx + badge_r, badge_cy + badge_r],
            fill=GREEN_DARK,
        )
        draw_icon(draw, badge_cx, badge_cy, badge_r * 0.62, item["icon"], color=WHITE)

        # ラベル
        label_box = (badge_cx + badge_r + 50, y0, x1 - 60, y1)
        bbox = draw.textbbox((0, 0), item["text"], font=f_label)
        th = bbox[3] - bbox[1]
        ty = (y0 + y1) / 2 - th / 2 - bbox[1]
        draw.text((label_box[0], ty), item["text"], font=f_label, fill=WHITE)

        # 右端に三角形の矢印(こちらも図形描画)
        ar_cx, ar_cy, ar_s = x1 - 70, (y0 + y1) / 2, 26
        draw.polygon(
            [(ar_cx - ar_s * 0.5, ar_cy - ar_s), (ar_cx - ar_s * 0.5, ar_cy + ar_s), (ar_cx + ar_s * 0.7, ar_cy)],
            fill=GRAY,
        )


def generate(key):
    img = Image.new("RGB", (W, H), NAVY_BG)
    draw = ImageDraw.Draw(img)
    draw_tab_bar(draw, key)
    draw_content_buttons(draw, key)
    return img


def main():
    out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "richmenu-assets")
    os.makedirs(out_dir, exist_ok=True)
    for tab in TABS:
        img = generate(tab["key"])
        path = os.path.join(out_dir, f"richmenu_{tab['key']}.png")
        img.save(path)
        print(f"saved: {path}")


if __name__ == "__main__":
    main()

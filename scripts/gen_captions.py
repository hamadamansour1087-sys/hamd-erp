#!/usr/bin/env python3
"""Render Arabic caption cards (RTL via PIL+Raqm, Amiri font) for H.A.M.D tutorials.

Card types:
  title   — full-screen dark intro card (landscape 1920x1080 / portrait 1080x1920)
  outro   — full-screen dark summary card with bullet lines
  step    — lower-third bar (landscape 1920x250 / portrait 1080x330) RGBA
  note    — centered translucent green card (RGBA) for on-screen callouts

PIL built with Raqm: raw Arabic text + direction='rtl' renders perfectly.

Usage:
  python3 scripts/gen_captions.py specs.json outdir/
"""
import json
import sys
import os
from PIL import Image, ImageDraw, ImageFont
from PIL import features

HAS_RAQM = features.check('raqm')

FONT_DIR = '/home/z/my-project/assets-video/fonts'
REG = os.path.join(FONT_DIR, 'Amiri-Regular.ttf')
BOLD = os.path.join(FONT_DIR, 'Amiri-Bold.ttf')

GREEN = (0, 168, 107)
GREEN_DARK = (0, 129, 86)
BG_TOP = (8, 20, 15)
BG_BOT = (13, 32, 24)
WHITE = (255, 255, 255)
MINT = (207, 232, 221)

KW = {'direction': 'rtl', 'language': 'ar'} if HAS_RAQM else {}


def _prep(text):
    """If no Raqm, fall back to legacy reshape+bidi."""
    if HAS_RAQM:
        return text
    import arabic_reshaper
    from bidi.algorithm import get_display
    r = arabic_reshaper.ArabicReshaper({'delete_harakat': False, 'support_ligatures': True})
    return get_display(r.reshape(text))


def tl(d, text, font):
    return d.textlength(_prep(text), font=font, **KW)


def draw_text(d, xy, text, font, fill):
    d.text(xy, _prep(text), font=font, fill=fill, **KW)


def fit_font(text, path, max_w, start_size, d=None):
    size = start_size
    probe = ImageDraw.Draw(Image.new('RGB', (10, 10)))
    while size > 18:
        f = ImageFont.truetype(path, size)
        if tl(probe, text, f) <= max_w:
            return f
        size -= 2
    return ImageFont.truetype(path, 18)


def wrap(text, font, max_w, d):
    words = text.split()
    lines, cur = [], ''
    for wd in words:
        cand = (cur + ' ' + wd).strip()
        if tl(d, cand, font) <= max_w:
            cur = cand
        else:
            if cur:
                lines.append(cur)
            cur = wd
    if cur:
        lines.append(cur)
    return lines


def grad_bg(w, h):
    img = Image.new('RGB', (w, h))
    px = img.load()
    for y in range(h):
        t = y / h
        r = int(BG_TOP[0] + (BG_BOT[0] - BG_TOP[0]) * t)
        g = int(BG_TOP[1] + (BG_BOT[1] - BG_TOP[1]) * t)
        b = int(BG_TOP[2] + (BG_BOT[2] - BG_TOP[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    glow = Image.new('L', (w, h), 0)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([w - int(w * 0.75), -int(h * 0.5), w + int(w * 0.25), int(h * 0.45)], fill=46)
    overlay = Image.new('RGB', (w, h), (0, 110, 70))
    img = Image.composite(Image.blend(img, overlay, 0.35), img, glow)
    return img


def center_text(d, img_w, y, text, font, fill, spacing=14):
    lines = wrap(text, font, img_w - 160, d)
    for ln in lines:
        w = tl(d, ln, font)
        draw_text(d, ((img_w - w) / 2, y), ln, font, fill)
        y += font.size + spacing
    return y


def rounded(d, box, radius, fill):
    d.rounded_rectangle(box, radius=radius, fill=fill)


def render_title(c):
    w, h = (1920, 1080) if c.get('orientation', 'landscape') == 'landscape' else (1080, 1920)
    img = grad_bg(w, h)
    d = ImageDraw.Draw(img)
    badge = c.get('badge', '')
    if badge:
        bf = ImageFont.truetype(BOLD, 40)
        bw = tl(d, badge, bf) + 80
        bx = (w - bw) / 2
        y = h * 0.26
        rounded(d, [bx, y, bx + bw, y + 74], 37, GREEN_DARK)
        draw_text(d, (bx + 40, y + 8), badge, bf, WHITE)
        y += 130
    else:
        y = h * 0.30
    tf = fit_font(c['title'], BOLD, w - 220, 92 if w == 1920 else 76)
    y = center_text(d, w, y, c['title'], tf, WHITE, spacing=18)
    if c.get('sub'):
        y += 26
        sf = fit_font(c['sub'], REG, w - 320, 54 if w == 1920 else 46)
        center_text(d, w, y, c['sub'], sf, MINT, spacing=12)
    brand = 'H.A.M.D — نظام إدارة المخازن والمحلات'
    f = ImageFont.truetype(BOLD, 36)
    bw2 = tl(d, brand, f)
    draw_text(d, ((w - bw2) / 2, h - 110), brand, f, GREEN)
    return img


def render_outro(c):
    w, h = (1920, 1080) if c.get('orientation', 'landscape') == 'landscape' else (1080, 1920)
    img = grad_bg(w, h)
    d = ImageDraw.Draw(img)
    tf = ImageFont.truetype(BOLD, 78 if w == 1920 else 64)
    y = h * 0.16
    y = center_text(d, w, y, c['title'], tf, WHITE, spacing=18)
    y += 40
    bf = ImageFont.truetype(REG, 52 if w == 1920 else 46)
    for line in c.get('lines', []):
        # green bullet + right-aligned line
        lines = wrap(line, bf, w - 340, d)
        for ln in lines:
            lw = tl(d, ln, bf)
            d.ellipse([w / 2 + lw / 2 + 28, y + bf.size * 0.35,
                       w / 2 + lw / 2 + 28 + 16, y + bf.size * 0.35 + 16], fill=GREEN)
            draw_text(d, (w / 2 - lw / 2, y), ln, bf, MINT)
            y += bf.size + 22
        y += 12
    if c.get('cta'):
        y += 50
        pf = ImageFont.truetype(BOLD, 54)
        pw = tl(d, c['cta'], pf) + 100
        rounded(d, [(w - pw) / 2, y, (w + pw) / 2, y + 96], 48, GREEN)
        draw_text(d, ((w - pw) / 2 + 50, y + 12), c['cta'], pf, WHITE)
    return img


def render_step(c):
    if c.get('orientation', 'landscape') == 'landscape':
        W, H = 1920, 250
        pad, num_d, f_main, f_sub = 60, 84, 58, 40
    else:
        W, H = 1080, 330
        pad, num_d, f_main, f_sub = 44, 72, 48, 34
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rounded(d, [24, 18, W - 24, H - 18], 26, (10, 24, 18, 216))
    d.rounded_rectangle([24, 18, W - 24, H - 18], radius=26, outline=(0, 168, 107, 235), width=3)
    d.rounded_rectangle([W - 34, 18, W - 24, H - 18], radius=5, fill=(0, 168, 107, 255))
    # step number circle (right side, RTL)
    cx, cy = W - 40 - num_d // 2 - 34, H // 2
    d.ellipse([cx - num_d // 2, cy - num_d // 2, cx + num_d // 2, cy + num_d // 2], fill=GREEN)
    num = c.get('num', '')
    nf = ImageFont.truetype(BOLD, int(num_d * 0.52))
    if num:
        nkw = {} if num.isdigit() else KW
        nb = d.textlength(num, font=nf, **nkw)
        d.text((cx - nb / 2, cy - nf.size * 0.62), num, font=nf, fill=WHITE, **nkw)
    # main text block, right-aligned next to the circle
    text_w_limit = W - 2 * pad - num_d - 90
    mf = fit_font(c['title'], BOLD, text_w_limit, f_main)
    mlines = wrap(c['title'], mf, text_w_limit, d)
    line_h = mf.size + 8
    block_h = line_h * len(mlines) + ((f_sub + 12) if c.get('sub') else 0)
    y = (H - block_h) / 2 + 2
    x_right = W - 34 - num_d - 50
    for ln in mlines:
        tw = tl(d, ln, mf)
        draw_text(d, (x_right - tw, y), ln, mf, WHITE)
        y += line_h
    if c.get('sub'):
        sf = fit_font(c['sub'], REG, text_w_limit, f_sub)
        slines = wrap(c['sub'], sf, text_w_limit, d)
        for ln in slines[:1]:
            tw = tl(d, ln, sf)
            draw_text(d, (x_right - tw, y + 4), ln, sf, MINT)
    return img


def render_note(c):
    w = 1920 if c.get('orientation', 'landscape') == 'landscape' else 1080
    f_main = 56 if w == 1920 else 46
    probe = ImageDraw.Draw(Image.new('RGB', (10, 10)))
    mf = fit_font(c['title'], BOLD, w - 240, f_main, probe)
    lines = wrap(c['title'], mf, w - 240, probe)
    line_h = mf.size + 10
    H = int(line_h * len(lines) + 56)
    img = Image.new('RGBA', (w, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rounded(d, [40, 10, w - 40, H - 10], 24, (0, 129, 86, 228))
    y = 26
    for ln in lines:
        tw = tl(d, ln, mf)
        draw_text(d, ((w - tw) / 2, y), ln, mf, WHITE)
        y += line_h
    return img


RENDER = {'title': render_title, 'outro': render_outro, 'step': render_step, 'note': render_note}


def main():
    spec_path, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    spec = json.load(open(spec_path, encoding='utf-8'))
    for c in spec['cards']:
        img = RENDER[c['type']](c)
        out = os.path.join(outdir, c['name'] + '.png')
        img.save(out)
        print(out, img.size)


if __name__ == '__main__':
    main()

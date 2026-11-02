"""Compose Chrome Web Store screenshots (1280x800) and the small promo tile (440x280) from the
raw captures in store-raw/. usage: python store-compose.py <raw_dir> <out_dir> <icon128.png>"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAW, OUT, ICON = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
OUT.mkdir(parents=True, exist_ok=True)
W, H = 1280, 800
F = 'C:/Windows/Fonts/'
def font(name, size): return ImageFont.truetype(F + name, size)
H1, H1B = font('seguisb.ttf', 46), font('segoeuib.ttf', 46)
BODY, SMALL, LABEL = font('segoeui.ttf', 21), font('segoeui.ttf', 17), font('seguisb.ttf', 18)
TEXT, MUTED, ACCENT = (245, 247, 250), (156, 166, 184), (96, 165, 250)


def background():
    bg = Image.new('RGB', (W, H))
    top, bot = (11, 16, 32), (22, 33, 62)
    d = ImageDraw.Draw(bg)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse((700, -200, 1500, 600), fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    bg.paste(Image.new('RGB', (W, H), (37, 99, 235)), (0, 0), glow)
    return bg


def rounded(img, r):
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, img.width - 1, img.height - 1), radius=r, fill=255)
    out = img.convert('RGBA'); out.putalpha(m)
    return out


def place(bg, img, x, y, r=12, shadow=28):
    img = rounded(img, r)
    sh = Image.new('L', (img.width + shadow * 4, img.height + shadow * 4), 0)
    ImageDraw.Draw(sh).rounded_rectangle((shadow * 2, shadow * 2 + 10, shadow * 2 + img.width, shadow * 2 + img.height + 10), radius=r, fill=150)
    sh = sh.filter(ImageFilter.GaussianBlur(shadow))
    bg.paste(Image.new('RGB', sh.size, (0, 0, 0)), (x - shadow * 2, y - shadow * 2), sh)
    bg.paste(img, (x, y), img)


def trim_bottom(img):
    # Popup shots are taller than the content: drop trailing rows of plain background.
    px = img.load()
    bgc = px[img.width // 2, img.height - 1]
    y = img.height - 1
    while y > 0 and all(px[x, y] == bgc for x in range(0, img.width, 7)):
        y -= 1
    return img.crop((0, 0, img.width, min(img.height, y + 24)))


def fit_w(img, w):
    return img.resize((w, round(img.height * w / img.width)), Image.LANCZOS)


def text_block(d, x, y, title, body, maxw=420):
    for line in title.split('\n'):
        d.text((x, y), line, font=H1B, fill=TEXT); y += 58
    y += 14
    for para in body:
        words, cur = para.split(), ''
        for w in words:
            test = (cur + ' ' + w).strip()
            if d.textlength(test, font=BODY) > maxw:
                d.text((x, y), cur, font=BODY, fill=MUTED); y += 31; cur = w
            else:
                cur = test
        if cur:
            d.text((x, y), cur, font=BODY, fill=MUTED); y += 31
        y += 10
    return y


def brand(bg):
    ic = Image.open(ICON).convert('RGBA').resize((36, 36), Image.LANCZOS)
    bg.paste(ic, (64, 56), ic)
    ImageDraw.Draw(bg).text((112, 60), 'PiP Subtitle', font=LABEL, fill=TEXT)


def shot_full(lang, title, body, name):
    bg = background(); brand(bg); d = ImageDraw.Draw(bg)
    text_block(d, 64, 160, title, body, 380)
    img = fit_w(Image.open(RAW / f'full-{lang}.png').convert('RGB'), 730)
    place(bg, img, W - 730 - 48, (H - img.height) // 2 + 20)
    bg.save(OUT / name)


def shot_compare(name):
    bg = background(); brand(bg); d = ImageDraw.Draw(bg)
    d.text((64, 128), 'Subtitles that survive the pop-out', font=H1B, fill=TEXT)
    d.text((64, 192), 'Same video, same moment. Regular PiP shows the video only; PiP Subtitle keeps the line.', font=BODY, fill=MUTED)
    w = 540
    for i, (file, label, ok) in enumerate([('plain-en.png', 'Regular Picture-in-Picture', False), ('clean-en.png', 'PiP Subtitle · Clean mode', True)]):
        img = fit_w(Image.open(RAW / file).convert('RGB'), w)
        x = 64 + i * (w + 72); y = 300
        place(bg, img, x, y, r=10)
        dot = (239, 68, 68) if not ok else (34, 197, 94)
        d.ellipse((x, y + img.height + 30, x + 14, y + img.height + 44), fill=dot)
        d.text((x + 26, y + img.height + 24), label, font=LABEL, fill=TEXT)
    bg.save(OUT / name)


def shot_popup(name):
    bg = background(); brand(bg); d = ImageDraw.Draw(bg)
    text_block(d, 64, 160, 'Everything in\none popup', [
        'Open PiP, or press Alt+P on any page.',
        'Clean or Full mode, automatic PiP when you switch tabs, subtitles on/off, text size, volume and language.',
        'No data collected. No network requests.'], 420)
    a = fit_w(trim_bottom(Image.open(RAW / 'popup-en-light.png').convert('RGB')), 300)
    b = fit_w(trim_bottom(Image.open(RAW / 'popup-en-dark.png').convert('RGB')), 300)
    place(bg, a, 560, 110, r=14)
    place(bg, b, 900, 150, r=14)
    bg.save(OUT / name)


def shot_desktop(name):
    page = Image.open(RAW / 'page-en.png').convert('RGB').resize((W, H))
    bg = page.filter(ImageFilter.GaussianBlur(1))
    shade = Image.new('RGB', (W, H), (0, 0, 0))
    bg = Image.blend(bg, shade, 0.35)
    d = ImageDraw.Draw(bg, 'RGBA')
    d.rounded_rectangle((40, 40, 770, 214), radius=18, fill=(11, 16, 32, 225))
    d.text((72, 64), 'Keep watching while you work', font=H1, fill=TEXT)
    d.text((72, 128), 'Video keeps playing in PiP when you switch tabs, even on', font=BODY, fill=MUTED)
    d.text((72, 159), 'sites that pause on hide. Auto PiP when Chrome allows it.', font=BODY, fill=MUTED)
    img = fit_w(Image.open(RAW / 'clean-en.png').convert('RGB'), 560)
    place(bg, img, W - 560 - 40, H - img.height - 40, r=10)
    bg.save(OUT / name)


def promo(name):
    t = Image.new('RGB', (440, 280))
    d = ImageDraw.Draw(t)
    for y in range(280):
        k = y / 280
        d.line([(0, y), (440, y)], fill=(int(11 + 11 * k), int(16 + 17 * k), int(32 + 30 * k)))
    glow = Image.new('L', (440, 280), 0)
    ImageDraw.Draw(glow).ellipse((200, -120, 560, 220), fill=90)
    t.paste(Image.new('RGB', (440, 280), (37, 99, 235)), (0, 0), glow.filter(ImageFilter.GaussianBlur(70)))
    ic = Image.open(ICON).convert('RGBA').resize((96, 96), Image.LANCZOS)
    t.paste(ic, (36, 92), ic)
    d = ImageDraw.Draw(t)
    d.text((150, 98), 'PiP Subtitle', font=font('segoeuib.ttf', 34), fill=TEXT)
    d.text((152, 146), 'Picture-in-Picture that', font=font('segoeui.ttf', 18), fill=MUTED)
    d.text((152, 170), 'keeps the subtitles', font=font('segoeui.ttf', 18), fill=MUTED)
    t.save(OUT / name)


shot_full('en', 'Picture-in-Picture\nthat keeps the\nsubtitles', [
    'Most web players draw subtitles as HTML, so regular PiP loses them.',
    'PiP Subtitle reads the captions the player shows and carries them into the PiP window.'], '1-hero-en.png')
shot_compare('2-compare-en.png')
shot_full('en', 'A real mini\nplayer', [
    'Full mode: seek bar with hover time, ±15 s, click the time to type where to jump, volume.',
    'Text size, your own .srt / .vtt file and a subtitle offset.'], '3-full-mode-en.png')
shot_popup('4-popup-en.png')
shot_desktop('5-background-en.png')
shot_full('id', 'Subtitle tetap\nikut di PiP', [
    'Antarmuka Bahasa Indonesia dan Inggris.',
    'Mode Lengkap: timeline, ±15 detik, ketik waktu untuk lompat, volume.'], '6-indonesia-id.png')
promo('promo-small-440x280.png')
print('ok', sorted(p.name for p in OUT.iterdir()))

import sys
from PIL import Image, ImageDraw
logo = Image.open(sys.argv[1]).convert('RGBA'); S = 1024
tile = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ImageDraw.Draw(tile).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.22), fill=(12, 61, 46, 255))   # deep green tile: visible on any wallpaper
inner = int(S * 0.70); tile.alpha_composite(logo.resize((inner, inner), Image.LANCZOS), ((S - inner) // 2, (S - inner) // 2))
tile.resize((256, 256), Image.LANCZOS).save(sys.argv[2], sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

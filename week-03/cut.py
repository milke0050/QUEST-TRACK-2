# art/sheet.png 를 2×2 칸으로 나눠 포즈 4장으로 저장한다.
# 실행: .venv\Scripts\python.exe cut.py
from pathlib import Path

from PIL import Image

ART = Path(__file__).parent / "art"
PAD = 8  # 잘라 낸 그림 둘레에 남길 빈 곳 (px)

# 칸 위치(열, 행) → 저장할 이름
# 왼쪽 아래 칸은 type1 과 거의 같은 포즈라서 쓰지 않는다. type2 는 type1 을 뒤집어 만든다.
POSES = {
    (0, 0): "rest.png",   # 두 손을 듦
    (1, 0): "type1.png",  # 왼손 키보드 · 오른손 듦
    (1, 1): "sleep.png",  # 자는 모습
}

sheet = Image.open(ART / "sheet.png").convert("RGBA")
cw, ch = sheet.width // 2, sheet.height // 2
cells = {pos: sheet.crop((pos[0] * cw, pos[1] * ch, (pos[0] + 1) * cw, (pos[1] + 1) * ch)) for pos in POSES}

# 4칸의 그림이 있는 곳을 모두 덮는 상자 하나로 똑같이 잘라야, 포즈가 바뀔 때 로봇이 흔들리지 않는다.
# 눈에 안 보이는 흐린 점(투명도 16 이하)은 그림으로 치지 않는다.
boxes = [cell.getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox() for cell in cells.values()]
left = max(min(b[0] for b in boxes) - PAD, 0)
top = max(min(b[1] for b in boxes) - PAD, 0)
right = min(max(b[2] for b in boxes) + PAD, cw)
bottom = min(max(b[3] for b in boxes) + PAD, ch)

for pos, name in POSES.items():
    cells[pos].crop((left, top, right, bottom)).save(ART / name)
    print(name, right - left, "x", bottom - top)

# type2: type1 을 좌우로 뒤집어 오른손 키보드 · 왼손 듦 포즈를 만든다.
# 그냥 뒤집으면 로봇이 옆으로 밀리니까, 안테나(맨 위 20줄)의 가운데를 기준선으로 뒤집는다.
type1 = Image.open(ART / "type1.png")
antenna = type1.crop((0, 0, type1.width, 20 + PAD)).getchannel("A").point(lambda a: 255 if a > 16 else 0).getbbox()
axis = (antenna[0] + antenna[2] - 1) / 2
type2 = Image.new("RGBA", type1.size)
type2.alpha_composite(type1.transpose(Image.FLIP_LEFT_RIGHT), (round(2 * axis - (type1.width - 1)), 0))
type2.save(ART / "type2.png")
print("type2.png", type2.width, "x", type2.height, "(type1 을 x =", axis, "기준으로 뒤집음)")

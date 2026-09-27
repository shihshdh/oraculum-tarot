"""
占卜室场景资源：从一张照片做"像素重构"——逐像素估深度，前端把每个像素推回它在 3D 里的位置。

  python scripts/build-room.py <照片.png> <depth_raw.npy> public/textures/room src/data/room.json

depth_raw.npy 由 Depth Anything V2 Large 生成（相对视差，越大越近）：
  pipeline('depth-estimation', model='depth-anything/Depth-Anything-V2-Large-hf')(img)['predicted_depth']
依赖：numpy、Pillow、opencv-python-headless。

产出：
  room.webp / room_sm.webp  照片（桌上的牌组抹掉了，由 3D 牌组盖在同一位置；大图 2 倍放大 + 轻微锐化）
  depth.png                 反深度（1/深度），16 位拆进 R（高 8 位）和 G（低 8 位）
  src/data/room.json        镜头视角与俯角、反深度范围、桌面平面、牌组位置
"""
import json, sys
import numpy as np
import cv2
from PIL import Image, ImageFilter

src, depth_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
img = np.array(Image.open(src).convert('RGB'))
H, W = img.shape[:2]
disp = np.clip(np.load(depth_path).astype(np.float64), 0, None)

# 照片的水平视角：定得比实际略宽，给镜头转动留出余量（只转不移时深度不影响画面，只影响那一点点视差）
HFOV = 90.0
T = np.tan(np.radians(HFOV / 2))
F = (W / 2) / T  # 焦距（像素）

# 镜头与牌组：牌组的五个特征点（底边、顶面前沿、顶面后沿、左右）按一副平放的牌（宽 1、长 1.732）反解出来的，
# 误差都在 1 像素内：镜头俯角 9.1°，比桌面高 2.93，牌组前沿水平距离 8.17，厚 0.33（场景单位 ≈ 一张牌宽）
PITCH, CAM_H, DECK_D, DECK_T, DECK_W, DECK_L = 0.159265, 2.93307, 8.17159, 0.334395, 1.0, 1.732
cp, sp = np.cos(PITCH), np.sin(PITCH)
n = np.array([0.0, cp, sp])            # 桌面法线（镜头坐标）
p0 = np.array([0.0, -cp * CAM_H, -sp * CAM_H])  # 桌面上正对镜头脚下的一点
k = float(np.dot(n, p0))

# 牌组的遮罩：顶面 587..627，侧面 627..656，左右 722..812
DX0, DX1, DY_TOP, DY_BOT = 722, 812, 587, 656
deck_mask = np.zeros((H, W), np.uint8)
cv2.rectangle(deck_mask, (DX0 - 8, DY_TOP - 6), (DX1 + 8, DY_BOT + 9), 255, -1)

# 视差 → 深度：depth = 1 / (A·视差 + B)。桌面像素都应落在上面那个平面上，这个约束对 A、B 是线性的
ys, xs = np.mgrid[585:730:2, 380:1160:2]
ok = deck_mask[ys, xs] == 0
xs, ys = xs[ok].astype(float), ys[ok].astype(float)
dirs = np.stack([(xs - W / 2) / F, -(ys - H / 2) / F, -np.ones_like(xs)], -1)
lhs = dirs @ n / k
M = np.stack([disp[ys.astype(int), xs.astype(int)], np.ones_like(xs)], 1)
A, B = np.linalg.lstsq(M, lhs, rcond=None)[0]
# 这条线只在桌面那段视差（约 150..500）上可靠；更远处按同样的形式另接一段，让后墙落在约 60（≈4 米）
D1, WALL_D, WALL_Z = 150.0, 8.0, 60.0
inv1 = A * D1 + B
A2 = (inv1 - 1 / WALL_Z) / (D1 - WALL_D)
B2 = inv1 - A2 * D1
def depth(d):
    d = np.asarray(d, dtype=np.float64)
    return 1.0 / np.where(d >= D1, A * d + B, np.maximum(A2 * d + B2, 1 / 90))
print('A B', A, B, 'deck-front depth', depth(disp[660, 767]), 'wall', depth(8.0), 'max', depth(disp.max()))

def ray_plane(x, y):
    d = np.array([(x - W / 2) / F, -(y - H / 2) / F, -1.0])
    return d * (k / np.dot(d, n))

# 抹掉牌组：桌面纹理从周围补进来；深度也换成桌面平面的深度
# 从牌组右边同一深度的一块桌面搬木纹过来（同一排的透视、光照都一样），边缘羽化融合；
# 牌组原本在桌面上的倒影也一并盖掉
SHIFT = 128
clean = img.copy()
patch = np.roll(np.roll(img, -SHIFT, axis=1), -8, axis=0)  # 再往下错 8 像素，避开右上方那摞书的底边
alpha = cv2.GaussianBlur(cv2.dilate(deck_mask, np.ones((9, 9), np.uint8)).astype(np.float32) / 255, (0, 0), 5)[..., None]
clean = (clean * (1 - alpha) + patch * alpha).astype(np.uint8)
yy, xx = np.nonzero(deck_mask)
for y, x in zip(yy, xx):
    p = ray_plane(x, y)
    disp[y, x] = (1 / -p[2] - B) / A

# 反深度图（1/深度，越亮越近）：降到 512 宽，16 位拆进 R（高 8 位）和 G（低 8 位）
DW, DH = 512, round(512 * H / W)
inv = 1.0 / depth(disp)
small = cv2.resize(inv.astype(np.float32), (DW, DH), interpolation=cv2.INTER_AREA)
IMIN, IMAX = float(small.min()), float(small.max())
q = np.clip((small - IMIN) / (IMAX - IMIN) * 65535, 0, 65535).astype(np.uint16)
rg = np.zeros((DH, DW, 3), np.uint8)
rg[..., 0] = q >> 8
rg[..., 1] = q & 255
Image.fromarray(rg).save(f'{out}/depth.png', optimize=True)

pil = Image.fromarray(clean)
pil.save(f'{out}/room_sm.webp', quality=86, method=6)
big = pil.resize((W * 2, H * 2), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.6, percent=55, threshold=2))
big.save(f'{out}/room.webp', quality=84, method=6)

json.dump({
    'hfov': HFOV, 'aspect': W / H,
    # depth.png 的值 v（0..1）→ 深度 = 1 / (invMin + v·(invMax − invMin))
    'inverseDepth': {'min': IMIN, 'max': IMAX},
    'pitch': PITCH,
    'table': {'normal': n.tolist(), 'point': p0.tolist()},
    # 牌组在"水平坐标"里（镜头不俯仰、y 朝上）：底面 y = -camH，前沿 z = -front；前端套一层 rotation.x = pitch 转回镜头坐标
    'deck': {'camH': CAM_H, 'front': DECK_D, 'width': DECK_W, 'length': DECK_L, 'thickness': DECK_T},
}, open(sys.argv[4], 'w'), indent=2)  # 前端直接 import
print('ok')

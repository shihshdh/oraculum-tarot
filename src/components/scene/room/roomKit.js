// 占卜室：一张照片"像素重构"成的 3D 场景的公共参数。
// 资源由 scripts/build-room.py 生成：照片、反深度图（Depth Anything V2）、镜头与桌面标定（src/data/room.json）。
//
// 坐标约定：
//   · 照片镜头 = 场景镜头的基准位姿：位置 CAM0、朝 -z、不旋转。房间网格就建在这个镜头坐标里
//   · 照片镜头其实向下俯 9.1°；"水平坐标"（y 真正朝上）= 镜头坐标绕 x 轴转回 -PITCH。桌上的牌组在水平坐标里摆放
//   · 牌阵（牌河、卡位、星盘）挂在 cardRoot 下；镜头只做轻微转动，窄屏和面板让位都靠移动/缩放 cardRoot 完成——
//     镜头一旦大幅移动，照片重构出来的几何就会露馅
import * as THREE from 'three';
import room from '../../../data/room.json';

export const ROOM = room;
export const CAM0 = new THREE.Vector3(0, -0.2, 7);
export const PITCH = room.pitch;
export const TAN_X = Math.tan((room.hfov * Math.PI) / 360); // 照片半视角的正切
export const TAN_Y = TAN_X / room.aspect;
const DEG = Math.PI / 180;
const EDGE_MARGIN = 2 * DEG; // 离照片边缘至少留 2°：镜头还有一点平移、画面四角转动后外扩

/** 镜头竖直视角（度）：默认 50°；超宽屏时收窄，保证左右还有转动的余量 */
export function viewFov(aspect) {
  const maxHalfH = Math.atan(TAN_X) - EDGE_MARGIN - 4 * DEG; // 左右至少能各转 4°
  return Math.min(50, (2 * Math.atan(Math.tan(maxHalfH) / aspect)) / DEG);
}

/** 当前视角下，镜头最多能转多少（弧度）而不露出照片以外 */
export function lookLimits(fov, aspect) {
  const halfV = (fov * DEG) / 2;
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  return {
    yaw: THREE.MathUtils.clamp(Math.atan(TAN_X) - EDGE_MARGIN - halfH, 0, 6 * DEG),
    pitch: THREE.MathUtils.clamp(Math.atan(TAN_Y) - EDGE_MARGIN - halfV, 0, 3.5 * DEG),
  };
}

// ---------- 桌面平面（世界坐标）：反射、牌组都用它 ----------
export const TABLE_NORMAL = new THREE.Vector3(...room.table.normal);
export const TABLE_POINT = new THREE.Vector3(...room.table.point).add(CAM0);
export const TABLE_PLANE = new THREE.Plane().setFromNormalAndCoplanarPoint(TABLE_NORMAL, TABLE_POINT);

// ---------- 牌组 ----------
const d = room.deck;
export const DECK = {
  width: d.width,
  length: d.length,
  thickness: d.thickness,
  /** 水平坐标里牌组底面中心 */
  levelCenter: new THREE.Vector3(0, -d.camH, -(d.front + d.length / 2)),
};
const levelToWorld = new THREE.Matrix4().makeRotationX(PITCH).setPosition(CAM0);
/** 牌组顶面中心（世界坐标）：牌从这里飞出去 */
export const DECK_TOP = DECK.levelCenter.clone().add(new THREE.Vector3(0, d.thickness, 0)).applyMatrix4(levelToWorld);
/** 平放在桌上的一张牌的朝向（世界坐标）：先躺平（背面朝上、牌长朝里），再跟着桌面俯仰 */
export const FLAT_EULER = new THREE.Euler(-Math.PI / 2 + PITCH, 0, 0);

/** 牌阵的根节点（TarotCanvas 挂上去，CameraRig 每帧摆放） */
export const cardRoot = { current: null };

/**
 * 照亮房间的动态光源（世界坐标）：星盘、牌组、悬停的牌、翻开的牌。
 * 写的一方每帧写 strength；Room 每帧读完后让它衰减，没人写就自然熄灭。
 */
export const sceneLights = [
  { pos: new THREE.Vector3(0, 0, -2), color: new THREE.Color('#ffc978'), strength: 0 }, // 星盘
  { pos: DECK_TOP.clone(), color: new THREE.Color('#ffd592'), strength: 0 }, // 牌组
  { pos: new THREE.Vector3(), color: new THREE.Color('#ffe2a8'), strength: 0 }, // 悬停的牌
  { pos: new THREE.Vector3(), color: new THREE.Color('#fff0d0'), strength: 0 }, // 翻开的牌
];

/** 牌组被点开之后多久，牌河才开始接受悬停/拾取（等飞出的牌落进牌河） */
export const DECK_OPEN_MS = 2100;

// ---------- 收牌：重新开始时，空中的牌一张张飞回牌堆 ----------
/** 此刻看得见的牌（牌河、卡位上的牌各自登记自己的 group；userData.tarot = 翻开时的牌面） */
export const liveCards = new Set();
/** 收牌的时间线：at = 开始时刻（performance.now），count = 飞回来的张数 */
export const gather = { at: 0, count: 0 };
export const GATHER_STAGGER = 70; // 相邻两张出发的间隔（毫秒）
export const GATHER_FLY = 950; // 每张飞行时长
/** 第 i 张落到牌堆上的时刻（相对 gather.at） */
export const gatherLandAt = (i) => i * GATHER_STAGGER + GATHER_FLY;

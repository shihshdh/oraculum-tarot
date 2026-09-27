import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ROOM, CAM0, TAN_X, TAN_Y, TABLE_NORMAL, TABLE_PLANE, TABLE_POINT, sceneLights } from './roomKit';
import { prefersReduced } from '../../../lib/motion';

/**
 * 占卜室：一张照片重构成的 3D 房间。
 *
 *   · 几何：一张网格，每个顶点对应反深度图的一个像素，在顶点着色器里沿镜头射线推到它的深度；
 *     法线用相邻像素的位置差在 GPU 上重建。镜头轻微转动、平移时，近处的桌椅和远处的墙有真实的视差
 *   · 烛火：照片里又亮又暖的像素就是火焰，按各自的节奏摇曳，亮度超过 1 交给泛光晕开
 *   · 重新打光：星盘、牌组、悬停/翻开的牌是真的光源，按重建出的法线照亮桌面和墙面
 *   · 平面反射：沿桌面平面镜像镜头，把牌阵（不含房间）渲染到一张低分辨率贴图，
 *     在桌面像素上按菲涅尔叠加，顺着木纹扰动、纵向拉丝模糊——漆面上真实的倒影
 *
 * 房间不写深度、最先画：牌、星盘永远在它前面，不会和重构出来的桌面互相穿插。
 */
const vertex = /* glsl */ `
  uniform sampler2D uDepth;
  uniform vec2 uDepthSize;
  uniform vec2 uInv;
  uniform vec2 uTan;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;

  float invDepth(ivec2 p) {
    p = clamp(p, ivec2(0), ivec2(uDepthSize) - 1);
    vec2 rg = texelFetch(uDepth, p, 0).rg;
    return uInv.x + (rg.r * 65280.0 + rg.g * 255.0) / 65535.0 * (uInv.y - uInv.x);
  }
  vec3 posAt(ivec2 p) {
    vec2 uv = (vec2(p) + 0.5) / uDepthSize;
    float z = 1.0 / invDepth(p);
    return vec3((uv.x - 0.5) * 2.0 * uTan.x * z, (uv.y - 0.5) * 2.0 * uTan.y * z, -z);
  }
  void main() {
    ivec2 p = ivec2(floor(uv * (uDepthSize - 1.0) + 0.5));
    vec3 P = posAt(p);
    vec3 dx = posAt(p + ivec2(2, 0)) - posAt(p - ivec2(2, 0));
    vec3 dy = posAt(p + ivec2(0, 2)) - posAt(p - ivec2(0, 2));
    vUv = (vec2(p) + 0.5) / uDepthSize;
    vec4 w = modelMatrix * vec4(P, 1.0);
    vWorld = w.xyz;
    vNormal = normalize(mat3(modelMatrix) * normalize(cross(dx, dy)));
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uRoom;
  uniform sampler2D uRefl;
  uniform mat4 uReflMatrix;
  uniform float uReflOn;
  uniform vec2 uReflTexel;
  uniform vec3 uPlaneN;
  uniform float uPlaneK;
  uniform float uTime;
  uniform vec3 uLPos[4];
  uniform vec3 uLCol[4];
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;

  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

  void main() {
    vec3 base = texture(uRoom, vUv).rgb; // sRGB 贴图，采样出来已经是线性值
    float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 col = base;

    // 烛火：亮而暖的像素。按所在的小格子取一个相位，每簇火焰各自摇曳
    float flame = smoothstep(0.42, 0.85, lum) * smoothstep(0.0, 0.12, base.r - base.b);
    float ph = hash(floor(vUv * vec2(48.0, 32.0))) * 6.2831;
    float flick = 0.72 + 0.18 * sin(uTime * 8.3 + ph) + 0.1 * sin(uTime * 13.1 + ph * 1.7);
    col += base * flame * 1.6 * flick;

    // 动态光源照亮房间：照片本身当作反照率（暗处仍然暗，只有被照到的地方泛起暖光）
    vec3 albedo = base * 1.7 + 0.012;
    for (int i = 0; i < 4; i++) {
      vec3 L = uLPos[i] - vWorld;
      float d2 = dot(L, L);
      float ndl = max(dot(N, L * inversesqrt(d2)), 0.0);
      col += albedo * uLCol[i] * ndl / (1.0 + d2 * 0.06);
    }

    // 桌面：离桌面平面近、法线朝上的像素
    float plane = dot(vWorld, uPlaneN) - uPlaneK;
    float table = smoothstep(0.35, 0.08, abs(plane)) * smoothstep(0.75, 0.93, dot(N, uPlaneN));
    if (uReflOn > 0.5 && table > 0.001) {
      vec4 rp = uReflMatrix * vec4(vWorld, 1.0);
      vec2 ruv = rp.xy / rp.w;
      // 木纹：用照片亮度的起伏轻轻扰动倒影，漆面不是完美的镜子
      ruv.x += (lum - 0.04) * 0.02;
      // 纵向拉丝模糊（粗糙的漆面上倒影会被拉长）
      vec4 r = vec4(0.0);
      float ws = 0.0;
      for (int k = -4; k <= 4; k++) {
        float w = exp(-float(k * k) / 8.0);
        r += texture(uRefl, ruv + vec2(float(k) * 0.35, float(k) * 2.2) * uReflTexel) * w;
        ws += w;
      }
      r /= ws;
      float fres = 0.04 + 0.96 * pow(1.0 - max(dot(V, uPlaneN), 0.0), 5.0);
      // 牌挡住了上方的烛光：倒影覆盖的地方先压暗一点，再叠上倒影
      col *= 1.0 - r.a * 0.3 * table;
      col += r.rgb * fres * 1.9 * table;
    }

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const MOBILE_GRID = 256;

export default function Room({ mobile, reflect }) {
  const { gl, scene, camera, size } = useThree();
  const [roomTex, depthTex] = useLoader(THREE.TextureLoader, [mobile ? '/textures/room/room_sm.webp' : '/textures/room/room.webp', '/textures/room/depth.png']);
  const meshRef = useRef();
  const reduced = useMemo(() => prefersReduced(), []);

  useMemo(() => {
    roomTex.colorSpace = THREE.SRGBColorSpace;
    roomTex.anisotropy = 8;
    roomTex.needsUpdate = true;
    depthTex.colorSpace = THREE.NoColorSpace;
    depthTex.minFilter = THREE.NearestFilter;
    depthTex.magFilter = THREE.NearestFilter;
    depthTex.generateMipmaps = false;
    depthTex.needsUpdate = true;
  }, [roomTex, depthTex]);

  const depthSize = useMemo(() => new THREE.Vector2(depthTex.image.width, depthTex.image.height), [depthTex]);
  // 一个顶点对应一个深度像素（手机上隔一个取一个）
  const geometry = useMemo(() => {
    const gw = mobile ? MOBILE_GRID : depthSize.x;
    const gh = Math.round((gw * depthSize.y) / depthSize.x);
    return new THREE.PlaneGeometry(1, 1, gw - 1, gh - 1);
  }, [mobile, depthSize]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  // 反射：镜像镜头 + 低分辨率贴图
  const refl = useMemo(() => ({
    target: new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true }),
    camera: new THREE.PerspectiveCamera(),
    matrix: new THREE.Matrix4(),
    clip: new THREE.Vector4(),
    q: new THREE.Vector4(),
    plane: new THREE.Plane(),
    view: new THREE.Vector3(),
    target3: new THREE.Vector3(),
    look: new THREE.Vector3(),
    rot: new THREE.Matrix4(),
    clear: new THREE.Color(),
  }), []);
  useEffect(() => () => refl.target.dispose(), [refl]);
  const REFL_SCALE = 0.45;
  useEffect(() => {
    const dpr = gl.getPixelRatio();
    refl.target.setSize(Math.max(64, Math.round(size.width * dpr * REFL_SCALE)), Math.max(64, Math.round(size.height * dpr * REFL_SCALE)));
  }, [size.width, size.height, gl, refl]);

  const uniforms = useMemo(() => ({
    uRoom: { value: roomTex },
    uDepth: { value: depthTex },
    uDepthSize: { value: depthSize },
    uInv: { value: new THREE.Vector2(ROOM.inverseDepth.min, ROOM.inverseDepth.max) },
    uTan: { value: new THREE.Vector2(TAN_X, TAN_Y) },
    uRefl: { value: refl.target.texture },
    uReflMatrix: { value: refl.matrix },
    uReflOn: { value: 0 },
    uReflTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
    uPlaneN: { value: TABLE_NORMAL },
    uPlaneK: { value: TABLE_PLANE.normal.dot(TABLE_POINT) },
    uTime: { value: 0 },
    uLPos: { value: sceneLights.map(() => new THREE.Vector3()) },
    uLCol: { value: sceneLights.map(() => new THREE.Vector3()) },
  }), [roomTex, depthTex, depthSize, refl]);

  useFrame(({ clock }, dt) => {
    uniforms.uTime.value = reduced ? 0 : clock.elapsedTime;
    sceneLights.forEach((l, i) => {
      uniforms.uLPos.value[i].copy(l.pos);
      uniforms.uLCol.value[i].set(l.color.r, l.color.g, l.color.b).multiplyScalar(l.strength);
      l.strength *= Math.exp(-dt * 10);
    });

    const mesh = meshRef.current;
    uniforms.uReflOn.value = reflect ? 1 : 0;
    if (!reflect || !mesh) return;
    renderReflection(gl, scene, camera, mesh, refl);
    uniforms.uReflTexel.value.set(1 / refl.target.width, 1 / refl.target.height);
  });

  return (
    <mesh ref={meshRef} geometry={geometry} position={CAM0} renderOrder={-20} frustumCulled={false}>
      <shaderMaterial vertexShader={vertex} fragmentShader={fragment} uniforms={uniforms} depthWrite={false} depthTest={false} />
    </mesh>
  );
}

/**
 * 沿桌面镜像镜头，把除房间以外的一切画进反射贴图（与 three.js 的 Reflector 同一套做法：
 * 斜裁剪面把桌面以下的部分裁掉，所以不需要每种材质都支持裁剪）。
 */
function renderReflection(gl, scene, camera, mesh, r) {
  const n = TABLE_NORMAL;
  const planePoint = TABLE_POINT;
  r.view.subVectors(planePoint, camera.position);
  if (r.view.dot(n) > 0) return; // 镜头在桌面以下（不会发生，保险）
  r.view.reflect(n).negate().add(planePoint);

  r.rot.extractRotation(camera.matrixWorld);
  r.look.set(0, 0, -1).applyMatrix4(r.rot).add(camera.position);
  r.target3.subVectors(planePoint, r.look).reflect(n).negate().add(planePoint);

  const vc = r.camera;
  vc.position.copy(r.view);
  vc.up.set(0, 1, 0).applyMatrix4(r.rot).reflect(n);
  vc.lookAt(r.target3);
  vc.far = camera.far;
  vc.near = camera.near;
  vc.updateMatrixWorld();
  vc.projectionMatrix.copy(camera.projectionMatrix);

  r.matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  r.matrix.multiply(vc.projectionMatrix).multiply(vc.matrixWorldInverse);

  // 斜裁剪：把近裁剪面换成桌面
  r.plane.setFromNormalAndCoplanarPoint(n, planePoint).applyMatrix4(vc.matrixWorldInverse);
  r.clip.set(r.plane.normal.x, r.plane.normal.y, r.plane.normal.z, r.plane.constant);
  const pm = vc.projectionMatrix.elements;
  r.q.set((Math.sign(r.clip.x) + pm[8]) / pm[0], (Math.sign(r.clip.y) + pm[9]) / pm[5], -1, (1 + pm[10]) / pm[14]);
  r.clip.multiplyScalar(2 / r.clip.dot(r.q));
  pm[2] = r.clip.x;
  pm[6] = r.clip.y;
  pm[10] = r.clip.z + 1 - 0.003;
  pm[14] = r.clip.w;

  const prevTarget = gl.getRenderTarget();
  const prevAlpha = gl.getClearAlpha();
  gl.getClearColor(r.clear);
  const prevShadow = gl.shadowMap.autoUpdate;
  mesh.visible = false;
  gl.shadowMap.autoUpdate = false;
  gl.setRenderTarget(r.target);
  gl.setClearColor(0x000000, 0);
  gl.clear();
  gl.render(scene, vc);
  gl.setRenderTarget(prevTarget);
  gl.setClearColor(r.clear, prevAlpha);
  gl.shadowMap.autoUpdate = prevShadow;
  mesh.visible = true;
}

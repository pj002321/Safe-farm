/**
 * ---------------------------------------------
 * [Feature]: 지구본 GLSL 셰이더
 *
 * [Description]
 * - 지구 표면과 대기광을 그리는 셰이더 문자열. 텍스처를 하나도 받지 않는 것이
 *   핵심이다 — 위성 사진을 쓰면 수 MB 를 내려받아야 하고, 그러면 랜딩 첫 화면이
 *   느려진다. 표면은 전부 절차적으로 만든다.
 * - 실제 대륙 모양을 흉내내지 않는다. 이 지구본은 지도가 아니라 "관측 데이터
 *   레이어"로 읽혀야 한다. 그래서 육지는 옅은 패치, 격자는 또렷하게 그린다.
 * - **WebGL1(ESSL 1.00) 문법으로 쓴다.** three 의 WebGLProgram 이 ShaderMaterial 을
 *   `#version 300 es` 로 승격하면서 `attribute`/`varying`/`gl_FragColor` 를 전부
 *   치환해 주므로(WebGLProgram.js 의 GLSL 3.0 conversion 블록), 이 문법이 가장
 *   호환 범위가 넓다. 덕분에 `fwidth` 도 확장 선언 없이 코어로 쓸 수 있다.
 * - `position`/`normal`/`uv`/`modelMatrix`/`cameraPosition` 등은 three 가 프리픽스에
 *   이미 선언하므로 다시 선언하면 컴파일 에러가 난다. 직접 만든 것만 선언한다.
 *
 * [Usage]
 * ```tsx
 * <shaderMaterial
 *   uniforms={uniforms}
 *   vertexShader={EARTH_VERTEX}
 *   fragmentShader={EARTH_FRAGMENT}
 * />
 * ```
 * ---------------------------------------------
 */

export const EARTH_VERTEX = /* glsl */ `
precision mediump float;

varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vSpherePos;

void main() {
  vUv = uv;
  // 오브젝트 공간의 구면 좌표. 육지 노이즈를 이 값으로 3D 에서 뽑기 때문에
  // uv 이음매(경도 0°)도, 극점 수렴도 생기지 않는다. 지구본이 돌아도
  // 육지는 표면에 붙어 같이 돈다.
  vSpherePos = normalize(position);

  // 프레넬을 월드 공간에서 계산한다. 지구본이 회전해도 림라이트가 항상
  // 카메라 기준 실루엣에 붙어야 하기 때문이다.
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPosition.xyz);

  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const EARTH_FRAGMENT = /* glsl */ `
precision mediump float;

uniform float uTime;
uniform float uScan;
uniform vec3 uLand;
uniform vec3 uVeg;
uniform vec3 uOcean;
uniform vec3 uGrid;
uniform vec3 uRim;
uniform float uOpacity;

varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vViewDir;
varying vec3 vSpherePos;

// 고정 태양 방향. 씬의 directionalLight 를 받지 않는 이유는, ShaderMaterial 에
// lights:true 를 켜는 순간 three 의 조명 uniform 구조 전체를 떠안아야 하는데
// 여기서 필요한 건 낮/밤 경계 하나뿐이기 때문이다.
// (normalize 를 미리 계산해 넣었다 — 상수식 제약을 피한다.)
const vec3 SUN_DIR = vec3(0.76, 0.36, 0.54);

// ── 절차적 노이즈 ──────────────────────────────────────────
// **3D** 값 노이즈를 쓴다. 2D uv 로 뽑으면 경도 0°에 이음매가 생기고, 그걸
// 피하려고 cos/sin 도메인을 섞으면 이번엔 육지가 대각선 띠로 늘어난다.
// 구면 좌표를 그대로 넣으면 두 문제가 동시에 사라진다.
float hash3(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}

float valueNoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  // smoothstep 보간(3f^2-2f^3). 격자 경계가 각지지 않게 한다.
  vec3 u = f * f * (3.0 - 2.0 * f);

  float n000 = hash3(i);
  float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash3(i + vec3(1.0, 1.0, 1.0));

  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

// 4 옥타브 fbm. 옥타브를 더 올려도 이 크기에서는 눈에 띄지 않는다.
// 배수를 2.0 이 아니라 2.03 으로 둔 건 옥타브끼리 격자가 겹쳐 생기는
// 격자무늬(axis-aligned banding)를 흐트러뜨리기 위해서다.
float fbm3(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += valueNoise3(p) * amp;
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec3 normal = normalize(vNormalW);
  vec3 viewDir = normalize(vViewDir);

  // ── 육지 + 식생지수 레이어 ───────────────────────────────
  // 굵은 노이즈로 육지/바다를 가르고, 그보다 잔 노이즈로 식생 밀도를 얹는다.
  // 위성 NDVI false-color 의 문법 그대로다 — 나지(점토색)에서 밀생(라임)까지.
  // 실제 대륙을 흉내내지 않는 건 의도다. 이 지구본은 지도가 아니라 관측 레이어다.
  vec3 sphere = normalize(vSpherePos);
  float land = smoothstep(0.46, 0.56, fbm3(sphere * 2.6));
  float vegetation = smoothstep(0.40, 0.66, fbm3(sphere * 5.7 + 17.0));

  // ── 위경도 그래티큘 (경선 24 / 위선 12) ──────────────────
  // fwidth 로 화면 공간 선폭을 잡아, 줌 거리와 무관하게 1px 로 보이게 한다.
  vec2 gridCoord = vec2(vUv.x * 24.0, vUv.y * 12.0);
  vec2 gridWrap = abs(fract(gridCoord + 0.5) - 0.5);
  // uv 이음매에서 fwidth 가 폭발해 굵은 띠가 생긴다. 상한을 걸어 막는다.
  vec2 gridWidth = min(fwidth(gridCoord) * 1.2, vec2(0.08));
  vec2 gridLine = vec2(1.0) - smoothstep(vec2(0.0), gridWidth, gridWrap);
  float grid = clamp(max(gridLine.x, gridLine.y), 0.0, 1.0);

  // ── 스캔 밴드 ────────────────────────────────────────────
  // uScan(0~1) 위도를 중심으로 한 띠. 관측이 "지금 훑고 있는 줄"을 뜻한다.
  float scan = smoothstep(0.055, 0.0, abs(vUv.y - uScan));

  // ── 프레넬 림라이트 ──────────────────────────────────────
  float fresnel = pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 3.0);

  // ── 합성 ─────────────────────────────────────────────────
  // 낮/밤은 완전히 끄지 않는다. 밤면이 새까맣게 죽으면 마커가 떠 보인다.
  float day = clamp(dot(normal, SUN_DIR) * 0.5 + 0.5, 0.0, 1.0);

  // 육지 위에서만 식생을 섞는다. 바다에 라임이 번지면 NDVI 은유가 깨진다.
  vec3 surface = mix(uOcean, mix(uLand, uVeg, vegetation), land);
  vec3 color = surface * (0.34 + 0.66 * day);
  // 격자 밝기를 아주 느리게 호흡시킨다. 정지 화면처럼 보이지 않게 하는 장치다.
  color += uGrid * grid * (0.14 + 0.04 * sin(uTime * 0.7));
  color += uRim * scan * 0.40;
  // 프레넬 가중치를 낮게 잡는다. 여기가 크면 실루엣이 형광 링으로 타 버려서
  // 지구가 아니라 발광하는 공처럼 보인다. 대기광 껍질이 이미 테두리를 맡는다.
  color += uRim * fresnel * 0.42;

  gl_FragColor = vec4(color, uOpacity);
}
`;

export const ATMOSPHERE_VERTEX = /* glsl */ `
precision mediump float;

varying vec3 vNormalW;
varying vec3 vViewDir;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewDir = normalize(cameraPosition - worldPosition.xyz);

  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export const ATMOSPHERE_FRAGMENT = /* glsl */ `
precision mediump float;

uniform vec3 uColor;
uniform float uIntensity;

varying vec3 vNormalW;
varying vec3 vViewDir;

void main() {
  // BackSide 로 그리므로 보이는 면은 구의 **뒤쪽** 반구다. 그 면의 법선은
  // 카메라 반대쪽을 향하므로 dot 이 -1(디스크 중앙) ~ 0(실루엣) 범위가 된다.
  // (1 + dot) 을 쓰면 실루엣에서 1, 중앙에서 0 이 되어 가장자리만 빛난다.
  float rim = clamp(1.0 + dot(normalize(vNormalW), normalize(vViewDir)), 0.0, 1.0);
  float glow = pow(rim, 3.0) * uIntensity;

  gl_FragColor = vec4(uColor, glow);
}
`;

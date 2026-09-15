import type { LatLon } from "./geo";

/**
 * ---------------------------------------------
 * [Feature]: 지구본에 뿌릴 경작지 패치 배치 (순수)
 *
 * [Description]
 * - 히어로 지구본 위에 **위성에서 내려다본 필지**를 뿌린다. 랜딩이 "위성이 보는
 *   땅"을 말하는데 정작 지구본에는 재해 마커 몇 개뿐이라 농지가 드러나지 않았다.
 * - **작물 그림을 그리지 않는다.** 잎사귀·트랙터 아이콘은 클립아트로 읽히고,
 *   이 프로젝트의 색 언어는 "농업 앱의 관행색을 버리고 지구관측 인터페이스의
 *   언어를 쓴다"고 못 박혀 있다(`FieldGutter` 와 같은 방침). 대신 **불규칙한
 *   사각 필지**를 NDVI 색으로 뿌린다 — 농지를 말하되 데이터의 언어로 말한다.
 * - 값이 **결정적**이다. `Math.random()` 을 쓰면 서버와 브라우저가 다른 배치를
 *   만들어 하이드레이션이 어긋나고, 새로 고칠 때마다 화면이 달라져 디자인 검토가
 *   불가능해진다. 그래서 씨앗 하나로 도는 작은 PRNG 를 쓴다.
 * - 배치는 **실제 곡창지대**에서 가져왔다. 아무 데나 뿌리면 바다 위에 밭이 뜬다.
 *
 * [Usage]
 * ```ts
 * const patches = generateFieldPatches();
 * patches[0]; // { coord, sizeScale, spinRad, vigor }
 * ```
 * ---------------------------------------------
 */

export interface FieldPatch {
  coord: LatLon;
  /** 패치 한 변의 크기 배율. 1 이 기준이고 0.6~1.5 로 흩어진다. */
  sizeScale: number;
  /** 지표 법선을 축으로 한 회전(라디안). 필지가 격자처럼 줄 서지 않게 한다. */
  spinRad: number;
  /** 식생 활력 0~1. 색을 흙빛↔라임 사이로 고른다(NDVI false-color 의 축약). */
  vigor: number;
  /** 서비스가 실제로 보는 지역(한반도)인가. 화면에서 더 진하게 그린다. */
  home: boolean;
}

/**
 * 뿌릴 중심지. 실제 곡창지대라 바다나 산맥·사막 위에 뜨지 않는다.
 *
 * **왜 전 세계인가.** 처음에는 한반도에만 뿌렸는데, 지구 전체를 담은 화면에서
 * 한반도는 각지름 5도 남짓이라 패치 여든 개가 20px 안에 뭉쳐 초록 얼룩 하나로
 * 보였다(실측). 필지로 읽히려면 보이는 땅 전체에 퍼져야 한다.
 * 그래서 세계의 곡창지대를 옅게 깔고, **한반도만 진하고 촘촘하게** 둔다 —
 * "세계의 농지를 보는 위성, 그중 우리가 지켜보는 곳"이 한 화면에서 읽힌다.
 *
 * `spread` 는 위경도 기준 흩어짐 반경(도), `home` 은 관측 대상 지역인가.
 */
const REGIONS: readonly {
  lat: number;
  lon: number;
  spread: number;
  count: number;
  home?: boolean;
}[] = [
  // ── 한반도: 서비스가 실제로 보는 곳. 진하고 촘촘하게. ──
  { lat: 35.8, lon: 126.9, spread: 0.55, count: 14, home: true }, // 호남평야
  { lat: 36.41, lon: 128.16, spread: 0.4, count: 10, home: true }, // 상주 — 관측 거점
  { lat: 35.0, lon: 126.7, spread: 0.45, count: 8, home: true }, // 나주·영산강
  { lat: 36.6, lon: 127.3, spread: 0.4, count: 8, home: true }, // 충북 내륙
  { lat: 38.2, lon: 127.3, spread: 0.3, count: 6, home: true }, // 철원평야
  { lat: 33.4, lon: 126.5, spread: 0.28, count: 5, home: true }, // 제주
  { lat: 37.3, lon: 126.9, spread: 0.35, count: 6, home: true }, // 경기 남부

  // ── 세계의 곡창지대: 옅게. 지구가 도는 동안 계속 농지가 보이게 한다. ──
  { lat: 41, lon: -93, spread: 4.5, count: 16 }, // 미 콘벨트
  { lat: 51, lon: -105, spread: 4, count: 10 }, // 캐나다 프레리
  { lat: -32, lon: -62, spread: 4, count: 12 }, // 팜파스
  { lat: -14, lon: -50, spread: 4.5, count: 12 }, // 브라질 세하두
  { lat: 48.5, lon: 3, spread: 3, count: 10 }, // 서유럽
  { lat: 49, lon: 32, spread: 3.5, count: 12 }, // 우크라이나 흑토지대
  { lat: 27, lon: 79, spread: 3.5, count: 14 }, // 인도 갠지스 평원
  { lat: 35, lon: 115, spread: 3.5, count: 14 }, // 중국 화북평원
  { lat: 45.5, lon: 125, spread: 3, count: 10 }, // 중국 동북평원
  { lat: 11, lon: 105, spread: 2.5, count: 8 }, // 메콩 삼각주
  { lat: -34, lon: 146, spread: 3.5, count: 9 }, // 호주 남동
  { lat: 30.5, lon: 31, spread: 1.4, count: 6 }, // 나일 삼각주
  { lat: 9, lon: 38, spread: 2.5, count: 7 }, // 에티오피아 고원
  { lat: -27, lon: 27, spread: 2.5, count: 7 }, // 남아프리카
];

/**
 * 결정적 난수. mulberry32 — 32비트 씨앗 하나로 도는 가장 작은 축에 속한다.
 *
 * 품질이 좋아서 고른 게 아니라 **같은 씨앗이 항상 같은 수열**을 주고 한 줄이라
 * 골랐다. 여기 쓰임은 장식 배치라 통계적 성질이 필요 없다.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 기본 씨앗. 바꾸면 배치가 통째로 달라진다 — 마음에 드는 그림을 찾으면 고정할 것. */
const DEFAULT_SEED = 20260915;

/**
 * 필지를 뿌린다. 같은 씨앗이면 언제나 같은 배열을 준다.
 *
 * 경도 흩어짐을 `cos(lat)` 로 나누는 이유: 위도가 올라갈수록 경도 1도의 실제
 * 거리가 짧아진다. 나누지 않으면 북쪽 무리가 동서로 눌린 타원이 된다.
 */
export function generateFieldPatches(seed = DEFAULT_SEED): FieldPatch[] {
  const random = mulberry32(seed);
  const patches: FieldPatch[] = [];

  for (const region of REGIONS) {
    const lonScale = 1 / Math.max(0.2, Math.cos((region.lat * Math.PI) / 180));

    for (let i = 0; i < region.count; i += 1) {
      // 중심에 몰리게 하려고 난수를 두 번 더해 평균 낸다(삼각분포 근사).
      const jitterLat = (random() + random() - 1) * region.spread;
      const jitterLon = (random() + random() - 1) * region.spread * lonScale;

      patches.push({
        coord: { lat: region.lat + jitterLat, lon: region.lon + jitterLon },
        // 관측 지역은 조금 더 크게 — 지구 전체 화면에서 한반도는 각지름이
        // 5도 남짓이라 같은 크기로 두면 세계 패치에 묻힌다.
        sizeScale: (region.home ? 0.9 : 0.6) + random() * 0.9,
        spinRad: random() * Math.PI * 2,
        // 활력을 한쪽으로 치우치게 둔다. 전부 한가운데면 색이 한 톤으로 보인다.
        vigor: random() ** 0.7,
        home: region.home === true,
      });
    }
  }

  return patches;
}

/** 전부 몇 개인가. 테스트와 인스턴스 버퍼 크기가 같은 값을 보게 한다. */
export const FIELD_PATCH_COUNT = REGIONS.reduce((sum, r) => sum + r.count, 0);

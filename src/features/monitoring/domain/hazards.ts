/**
 * ---------------------------------------------
 * [Feature]: 자연재해 분류와 관측 핫스팟
 *
 * [Description]
 * - 랜딩 지구본에 찍을 관측 지점과, 그 지점이 감시 중인 재해 종류를 선언한다.
 *   순수 데이터 + 타입뿐이라 서버·클라이언트 어디서든 그대로 읽는다.
 * - 좌표는 실제 한국 농업지대의 위경도(소수 둘째 자리)다. 값이 어긋나면
 *   지구본에서 엉뚱한 바다에 마커가 찍히므로 임의로 고치지 말 것.
 * - `toneToken` 은 globals.css 의 시맨틱 색 토큰 이름이다. 여기서 hex 를 들고
 *   있으면 다크모드에서 대비가 깨진다.
 * - **주의: `cropId` 는 growth 도메인의 CROP_CALENDARS 키와 일치해야 한다.**
 *   features 끼리 import 하지 않는 규칙이 있어 타입으로 강제하지 못한다.
 *   작물을 추가·변경할 때 growth/domain/growthStage.ts 를 같이 확인할 것.
 *
 * [Usage]
 * ```ts
 * OBSERVATION_SITES.map((site) => ({
 *   position: latLonToVec3(site.coord, 2),
 *   tone: HAZARDS[site.hazard].toneToken,
 * }));
 * ```
 * ---------------------------------------------
 */

import type { LatLon } from "./geo";

export type HazardKind =
  | "frost"
  | "drought"
  | "flood"
  | "heat"
  | "hail"
  | "wind";

export interface HazardMeta {
  kind: HazardKind;
  nameKo: string;
  descriptionKo: string;
  /** 위성 관측 + 예보로 확보 가능한 평균 선행 시간(시간) */
  leadTimeHours: number;
  /** UI 색 토큰 이름 */
  toneToken: "caution" | "unsuitable" | "info" | "telemetry";
}

/**
 * 재해 6종.
 *
 * `leadTimeHours` 는 "얼마나 미리 알 수 있는가"다. 이 값이 재해마다 크게 다른
 * 것이 이 서비스의 핵심 주장이라, 색보다 먼저 보여줘야 하는 숫자다.
 * `toneToken` 은 피해의 회복 가능성으로 갈랐다 —
 * 되돌릴 수 없으면 unsuitable, 대응하면 막을 수 있으면 caution.
 */
export const HAZARDS: Record<HazardKind, HazardMeta> = {
  frost: {
    kind: "frost",
    nameKo: "냉해·서리",
    descriptionKo: "복사냉각으로 새벽 기온이 급락해 잎과 꽃이 얼어붙습니다.",
    leadTimeHours: 12,
    toneToken: "unsuitable",
  },
  drought: {
    kind: "drought",
    nameKo: "가뭄",
    descriptionKo: "토양수분이 서서히 빠져 뿌리가 물을 끌어올리지 못합니다.",
    // 위성 토양수분 지수는 추세로 읽으므로 일주일 전에도 조짐이 보인다.
    leadTimeHours: 168,
    toneToken: "info",
  },
  flood: {
    kind: "flood",
    nameKo: "호우·침수",
    descriptionKo: "짧은 시간 많은 비가 고여 뿌리가 물에 잠깁니다.",
    leadTimeHours: 24,
    toneToken: "unsuitable",
  },
  heat: {
    kind: "heat",
    nameKo: "고온 장해",
    descriptionKo: "한계 기온을 넘기면 생육이 멈추고 착과와 품질이 떨어집니다.",
    leadTimeHours: 48,
    toneToken: "caution",
  },
  hail: {
    kind: "hail",
    nameKo: "우박",
    descriptionKo: "발달한 적란운에서 얼음이 떨어져 잎과 열매에 구멍을 냅니다.",
    // 레이더로 잡히는 시점이 이미 임박한 때라, 6종 중 선행 시간이 가장 짧다.
    leadTimeHours: 3,
    toneToken: "caution",
  },
  wind: {
    kind: "wind",
    nameKo: "강풍·태풍",
    descriptionKo: "줄기가 꺾이고 시설 피복재가 찢어집니다.",
    // 태풍 진로는 정지궤도 위성이 며칠 전부터 추적한다 — 관측색으로 표시한다.
    leadTimeHours: 36,
    toneToken: "telemetry",
  },
};

/** 관심 / 주의보 / 경보 */
export type HazardLevel = "watch" | "advisory" | "warning";

export interface ObservationSite {
  id: string;
  nameKo: string;
  coord: LatLon;
  /** 주력 작물. CROP_CALENDARS 의 키여야 한다 (파일 상단 주의 참고) */
  cropId: string;
  hazard: HazardKind;
  level: HazardLevel;
  /** 관측 위성 이름 */
  satellite: string;
  /** 필지 면적 (ha) */
  areaHa: number;
  /** 한 줄 관측 요약 */
  noteKo: string;
}

/** 실제 한국 농업지대 9곳. 재해 6종과 경보 3단계를 모두 덮도록 골랐다. */
export const OBSERVATION_SITES: readonly ObservationSite[] = [
  {
    id: "gimje",
    nameKo: "전북 김제 평야",
    coord: { lat: 35.8, lon: 126.89 },
    cropId: "lettuce",
    hazard: "drought",
    level: "advisory",
    satellite: "Sentinel-2",
    areaHa: 1240,
    noteKo: "토양수분지수가 3주 연속 내려가고 있습니다.",
  },
  {
    id: "haenam",
    nameKo: "전남 해남 남단",
    coord: { lat: 34.57, lon: 126.6 },
    cropId: "lettuce",
    hazard: "frost",
    level: "watch",
    satellite: "천리안 2A",
    areaHa: 860,
    noteKo: "야간 지표온도가 평년보다 2.4도 낮습니다.",
  },
  {
    id: "nonsan",
    nameKo: "충남 논산 시설단지",
    coord: { lat: 36.19, lon: 127.1 },
    cropId: "strawberry",
    hazard: "heat",
    level: "advisory",
    satellite: "차세대중형위성 4호(농림위성)",
    areaHa: 420,
    noteKo: "하우스 내부 추정 온도가 한계선에 근접했습니다.",
  },
  {
    id: "cheorwon",
    nameKo: "강원 철원 평야",
    coord: { lat: 38.15, lon: 127.31 },
    cropId: "lettuce",
    hazard: "frost",
    level: "warning",
    satellite: "천리안 2A",
    areaHa: 310,
    noteKo: "내일 새벽 영하권 진입이 확실시됩니다.",
  },
  {
    id: "sangju",
    nameKo: "경북 상주 내륙",
    coord: { lat: 36.41, lon: 128.16 },
    cropId: "tomato",
    hazard: "drought",
    level: "advisory",
    satellite: "차세대중형위성 4호(농림위성)",
    areaHa: 275,
    noteKo: "식생지수가 2주째 정체 상태입니다.",
  },
  {
    id: "yeongwol",
    nameKo: "강원 영월 산간",
    coord: { lat: 37.18, lon: 128.46 },
    cropId: "tomato",
    hazard: "hail",
    level: "watch",
    satellite: "천리안 2A",
    areaHa: 130,
    noteKo: "오후 대기 불안정으로 적란운이 발달 중입니다.",
  },
  {
    id: "naju",
    nameKo: "전남 나주 영산강변",
    coord: { lat: 35.02, lon: 126.71 },
    cropId: "strawberry",
    hazard: "flood",
    level: "watch",
    satellite: "Sentinel-2",
    areaHa: 540,
    noteKo: "강변 저지대의 물빠짐이 지난 관측보다 느려졌습니다.",
  },
  {
    id: "seogwipo",
    nameKo: "제주 서귀포 해안",
    coord: { lat: 33.25, lon: 126.56 },
    cropId: "tomato",
    hazard: "wind",
    level: "warning",
    satellite: "천리안 2A",
    areaHa: 190,
    noteKo: "태풍 진로가 섬 남동쪽 120km 로 좁혀졌습니다.",
  },
  {
    id: "daegwallyeong",
    nameKo: "강원 평창 대관령",
    coord: { lat: 37.68, lon: 128.72 },
    cropId: "lettuce",
    hazard: "wind",
    level: "watch",
    satellite: "천리안 2A",
    areaHa: 95,
    noteKo: "능선을 넘는 돌풍이 초속 14m 로 관측됐습니다.",
  },
];

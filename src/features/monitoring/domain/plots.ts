import type { PlotKind } from "./observation";

/**
 * ---------------------------------------------
 * [Feature]: 필지 3종 · 오늘 상주 · 데이터 출처
 *
 * [Description]
 * - "세 가지 밭"(#plots), "로그인하면"(#my), "오늘 상주"(#today), 푸터, 마지막
 *   배너가 쓰는 문장과 수치를 한 곳에 모았다. 같은 값이 다섯 군데 흩어져 있으면
 *   하나만 고쳤을 때 화면이 서로 다른 말을 한다.
 * - 문장과 숫자는 랜딩 시안의 원문 그대로다. 전부 실측이라고 적혀 있으므로
 *   보기 좋게 반올림하거나 문구를 다듬지 않는다 — 그 정직함이 이 페이지의 자산이다.
 * - 숫자에 단위를 붙이지 않고 필드명으로 구분한다(`tempMinC`). 단위는 화면에서
 *   붙이는 편이 `font-mono tabular-nums` 정렬에 유리하다.
 * - ⚠️ 지금은 **고정 상수**다. 기상청·위성 연동이 붙으면 이 파일의 값이 조회
 *   결과로 바뀌어야 한다. 그때까지 화면은 여기만 보면 된다.
 *
 * [Usage]
 * ```ts
 * import { PLOTS, SANGJU_TODAY } from "./plots";
 *
 * PLOTS.map((plot) => plot.nameKo);   // ["낙동강변 논", "배추밭", "단감 과수원"]
 * SANGJU_TODAY.alertKo;               // "가을가뭄"
 * ```
 * ---------------------------------------------
 */

export interface PlotProfile {
  kind: PlotKind;
  nameKo: string;
  cropKo: string;
  elevationM: number;
  /** 재는 방식 한 줄. 논·밭은 적산온도, 과수는 달력이다. */
  methodKo: string;
  /** 타임라인 눈금 라벨. 작물마다 개수가 다르다. */
  stagesKo: readonly string[];
  /** 현재 진행. `ratio` 는 0~1, `label` 은 그대로 화면에 찍힌다. */
  progress: { label: string; ratio: number };
  bodyKo: string;
  /** 근거·출처 각주. 숫자의 출처를 밝히는 자리다. */
  noteKo: string;
  today: {
    tempMinC: number;
    tempMaxC: number;
    windKo: string;
    sunriseKo: string;
    sunsetKo: string;
    statusKo: string;
  };
}

export const PLOTS: readonly PlotProfile[] = [
  {
    kind: "paddy",
    nameKo: "낙동강변 논",
    cropKo: "벼",
    elevationM: 60,
    methodKo: "출수 후 적산온도",
    stagesKo: ["출수", "벼베기"],
    progress: { label: "828 / 1150℃", ratio: 0.72 },
    bodyKo:
      "이삭이 팬 뒤 쌓인 열을 셉니다. 농진청은 벼베기 적기를 1,100~1,200℃로 잡습니다. 품종과 지역에 따라 일수가 달라집니다.",
    noteKo:
      "중생종·호남 55일 기준. 상주 실측으로 계산하면 8월 12일 출수 시 오늘 33일째, 벼베기까지 약 16일.",
    today: {
      tempMinC: 17.1,
      tempMaxC: 27.0,
      windKo: "북북서 1.4",
      sunriseKo: "06:07",
      sunsetKo: "18:38",
      statusKo: "이상 없음",
    },
  },
  {
    kind: "field",
    nameKo: "배추밭",
    cropKo: "배추 · 단감 3그루",
    elevationM: 74,
    methodKo: "씨뿌림 후 적산온도 (기준 5℃)",
    stagesKo: ["씨뿌림", "결구", "수확"],
    progress: { label: "384 GDD", ratio: 0.48 },
    bodyKo:
      "속이 차기 시작하는 때가 갈림길입니다. 배추 결구적온은 15~16℃라 더위에 약하고, 이때 물이 모자라면 속이 헐거워집니다.",
    noteKo:
      "상주 실측 기준 오늘 20일째 384 GDD. 결구까지 약 여드레, 수확은 10월 중순.",
    today: {
      tempMinC: 16.7,
      tempMaxC: 27.2,
      windKo: "서북서 1.3",
      sunriseKo: "06:07",
      sunsetKo: "18:38",
      statusKo: "가을가뭄",
    },
  },
  {
    kind: "orchard",
    nameKo: "단감 과수원",
    cropKo: "단감",
    elevationM: 158,
    methodKo: "연간 달력 · 적지 판정",
    stagesKo: ["전정", "봉오리", "열매솎기", "수확"],
    // 과수는 "심은 지 며칠"이 뜻이 없어 진행률이 한 해 중 위치를 뜻한다.
    // 그래서 label 이 수치가 아니라 "오늘"이다 — 화면은 이걸 그대로 찍는다.
    progress: { label: "오늘", ratio: 0.67 },
    bodyKo:
      '열 해 된 감나무에 "심은 지 며칠"은 뜻이 없습니다. 대신 그 땅이 감을 키울 수 있는 곳인지, 지금이 한 해 중 어디쯤인지를 봅니다.',
    noteKo:
      "단감 적지 기준 연평균 13℃·일조 2,340시간. 상주는 13.1℃·2,401시간으로 간신히 통과하는 북방 한계선.",
    today: {
      tempMinC: 16.1,
      tempMaxC: 26.6,
      windKo: "서북서 1.3",
      sunriseKo: "06:07",
      sunsetKo: "18:38",
      statusKo: "수확 한 달 전",
    },
  },
];

/** 푸터에 밝히는 데이터 출처. 라이선스 표기가 필요한 것은 상세에 적었다. */
export const DATA_SOURCES: readonly { nameKo: string; detailKo: string }[] = [
  { nameKo: "기상청 API허브", detailKo: "지상관측 / 절기별 작물재해" },
  { nameKo: "Copernicus Sentinel-2", detailKo: "ESA" },
  { nameKo: "Open-Meteo", detailKo: "CC BY 4.0" },
  { nameKo: "농촌진흥청", detailKo: "농작업 일정" },
  { nameKo: "국토위성 1호 CAS500-1", detailKo: "국토정보플랫폼" },
];

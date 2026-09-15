import type { ReactNode } from "react";

/**
 * ---------------------------------------------
 * [Feature]: 대시보드 퍼블용 고정 데이터
 *
 * [Description]
 * - ⚠️ **이 파일은 지워질 파일이다.** 퍼블 단계에서 화면의 모양과 상태를 눈으로
 *   확인하려고 둔 고정값이고, 조회가 붙으면 통째로 사라진다.
 *   로직을 여기 넣지 말 것 — 계산이 생기면 `features/<도메인>/domain/` 으로 간다.
 * - 값을 일부러 **가지런하지 않게** 뒀다. 우선순위가 섞이고, 근거 문장의 길이가
 *   제각각이고, 완료된 작업이 하나 있다. 예쁜 데이터만 넣으면 줄바꿈·정렬이
 *   깨지는 자리를 퍼블 단계에서 못 본다.
 * - 날짜는 `Date` 가 아니라 문자열이다. 실행 시각에 따라 화면이 달라지면
 *   "어제는 되던 화면"이 생겨 디자인 검토가 불가능해진다.
 * ---------------------------------------------
 */

export type Priority = "high" | "mid" | "low";

export interface TaskCardData {
  id: string;
  titleKo: string;
  /** 왜 이 작업이 나왔는가. 스펙상 **근거 없는 작업은 카드로 만들지 않는다.** */
  reasonKo: string;
  priority: Priority;
  plotKo: string;
  /** 근거가 된 재배매뉴얼 원문. 없으면 링크를 그리지 않는다. */
  sourceKo?: string;
  done?: boolean;
  /** 완료 시각. 완료 카드에만 있다. */
  doneAtKo?: string;
}

export const SAMPLE_TASKS: readonly TaskCardData[] = [
  {
    id: "water",
    titleKo: "배추밭 물 주기",
    reasonKo:
      "이레 동안 비가 0.1mm뿐이고, 결구기 배추는 수분이 모자라면 속이 차지 않습니다.",
    priority: "high",
    plotKo: "배추밭",
    sourceKo: "농촌진흥청 · 가을배추 재배매뉴얼",
  },
  {
    id: "sunscald",
    titleKo: "감나무 일소 피해 확인",
    reasonKo: "올여름 35℃ 넘은 날이 여드레라 열매가 햇볕에 뎄을 수 있습니다.",
    priority: "high",
    plotKo: "감나무밭",
    sourceKo: "농촌진흥청 · 과수 고온 피해 대책",
  },
  {
    id: "spray",
    titleKo: "드론 방제 (오전 6–9시)",
    reasonKo: "이 시간대만 바람이 초속 3m 아래로 내려갑니다.",
    priority: "mid",
    plotKo: "배추밭",
  },
  {
    id: "thin",
    titleKo: "배추 솎아내기",
    reasonKo: "포기 간격이 좁으면 결구기에 웃자랍니다.",
    priority: "mid",
    plotKo: "배추밭",
    sourceKo: "농촌진흥청 · 가을배추 재배매뉴얼",
  },
  {
    id: "mulch",
    titleKo: "이랑 비닐 점검",
    reasonKo: "일교차가 13℃까지 벌어져 지온 유지가 필요합니다.",
    priority: "low",
    plotKo: "배추밭",
  },
  {
    id: "record",
    titleKo: "웃거름 주기",
    reasonKo: "파종 20일째로 1차 추비 시기입니다.",
    priority: "mid",
    plotKo: "배추밭",
    sourceKo: "농촌진흥청 · 가을배추 재배매뉴얼",
    done: true,
    doneAtKo: "어제 17:20",
  },
];

export interface PlotSummary {
  id: string;
  nameKo: string;
  cropKo: string;
  /** 파종 후 며칠째. */
  dayLabelKo: string;
  stageKo: string;
  areaKo: string;
}

export const SAMPLE_PLOTS: readonly PlotSummary[] = [
  {
    id: "cabbage",
    nameKo: "낙동강변 배추밭",
    cropKo: "가을배추",
    dayLabelKo: "D+20",
    stageKo: "생육기",
    areaKo: "약 200평",
  },
  {
    id: "persimmon",
    nameKo: "뒷밭 감나무",
    cropKo: "단감",
    dayLabelKo: "D+142",
    stageKo: "성숙기",
    areaKo: "약 90평",
  },
  {
    id: "rice",
    nameKo: "아랫논",
    cropKo: "벼",
    dayLabelKo: "D+118",
    stageKo: "등숙기",
    areaKo: "약 600평",
  },
];

export interface DayForecast {
  labelKo: string;
  dateKo: string;
  tempMinC: number;
  tempMaxC: number;
  rainChance: number;
  rainMm: number;
  /** 야외 작업이 가능한가. 스펙상 이 판단이 주말 예보의 목적이다. */
  workableKo: string;
  icon: "sun" | "rain";
}

export const SAMPLE_WEEKEND: readonly DayForecast[] = [
  {
    labelKo: "토요일",
    dateKo: "9/19",
    tempMinC: 14.2,
    tempMaxC: 27.8,
    rainChance: 10,
    rainMm: 0,
    workableKo: "야외 작업하기 좋습니다",
    icon: "sun",
  },
  {
    labelKo: "일요일",
    dateKo: "9/20",
    tempMinC: 16.0,
    tempMaxC: 24.1,
    rainChance: 60,
    rainMm: 5.5,
    workableKo: "오후에 비가 옵니다. 오전에 끝내세요",
    icon: "rain",
  },
];

/** 기상 특보. 없으면 배너를 그리지 않는다. */
export interface HazardAlert {
  id: string;
  kindKo: string;
  bodyKo: string;
  tone: "caution" | "unsuitable";
  icon?: ReactNode;
}

export const SAMPLE_ALERT: HazardAlert = {
  id: "drought",
  kindKo: "가을가뭄 주의",
  bodyKo:
    "상주 지역 이레 강수량이 0.1mm입니다. 결구기 배추에 물 주기 작업을 맨 위에 넣었습니다.",
  tone: "caution",
};

/** 데이터 기준 시각. 갱신 실패 시 `stale` 이 true 가 되며 문구가 경고로 바뀐다. */
export const SAMPLE_FRESHNESS = {
  baseKo: "2026-09-14 06:00",
  sourceKo: "기상청 API허브 · 상주(137)",
  stale: false,
} as const;

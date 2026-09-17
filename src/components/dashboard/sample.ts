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

// Priority/TaskCardData(할 일 카드)와 SAMPLE_TASKS 는 여기 있었다. 조회가 붙어
// `features/dashboard/domain/taskSummary.ts` 로 옮겼다 — 위 주석이 예고한 일이다.

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

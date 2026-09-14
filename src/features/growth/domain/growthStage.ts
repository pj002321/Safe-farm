/**
 * ---------------------------------------------
 * [Feature]: 작물 표준 생육 달력
 *
 * [Description]
 * - 리포트가 "지금 어느 단계인가"를 판단하는 기준표다. 여기가 틀리면 처방이 틀린다.
 * - **순수 함수·순수 데이터만 둔다.** DB·네트워크·Date.now 의존성 0.
 *   그래야 테스트가 빠르고, LangGraph 노드에서도 서버 컴포넌트에서도 그대로 쓴다.
 * - 작물 수치는 기관 API 응답이 아니라 상수로 박았다. 표준 재배 일정은
 *   연 단위로도 거의 안 바뀌는 값이라, 매 요청마다 외부 호출을 할 이유가 없다.
 *   품종별 세분화가 필요해지면 CropCalendar 를 그대로 늘리면 된다.
 *
 * [Usage]
 * ```ts
 * const lettuce = CROP_CALENDARS.lettuce;
 * stageAt(lettuce, 32);          // → { id: "harvest", nameKo: "수확기", ... }
 * stageProgress(lettuce, 32);    // → 0 (수확기 시작일)
 * overallProgress(lettuce, 32);  // → 0.711...
 * ```
 * ---------------------------------------------
 */

export type StageId =
  | "germination"
  | "seedling"
  | "leafGrowth"
  | "harvest"
  | "bolting";

export interface GrowthStage {
  id: StageId;
  /** 화면 표시용 이름. 예: "잎 성장기" */
  nameKo: string;
  /** 이 단계가 시작되는 파종 후 일수(포함) */
  startDay: number;
  /** 농민이 이 시기에 할 일 한 줄. 예: "겉잎부터 하나씩 수확할 수 있어요." */
  adviceKo: string;
}

export interface CropCalendar {
  cropId: string;
  nameKo: string;
  /** 파종 ~ 수확 종료까지 표준 재배 일수 */
  totalDays: number;
  /** startDay 오름차순. 첫 항목의 startDay 는 0 이어야 한다. */
  stages: readonly GrowthStage[];
  /** 표준 생육에 적합한 일 평균기온 [최소, 최대] */
  idealTempC: readonly [number, number];
  /** 표준 주간 강수량 [최소, 최대] mm */
  idealWeeklyRainMm: readonly [number, number];
  /** 이 아래로 떨어지면 냉해 위험 (°C) */
  frostRiskBelowC: number;
  /** 이 위로 올라가면 고온 장해·추대 위험 (°C) */
  heatRiskAboveC: number;
}

/**
 * 작물별 표준 달력.
 *
 * 수치 근거는 각 항목 위 주석에 남긴다. 근거 없는 숫자를 넣으면 나중에
 * 누구도 고칠 수 없다 — "왜 45일인가"에 답할 수 없으면 수정도 불가능하다.
 */
export const CROP_CALENDARS: Record<string, CropCalendar> = {
  // 상추: 노지 봄재배 기준. 파종 45일 전후로 겉잎 수확을 시작하고,
  // 그 뒤 고온·장일 조건에서 추대(꽃대)가 올라오며 쓴맛이 난다.
  lettuce: {
    cropId: "lettuce",
    nameKo: "상추",
    totalDays: 45,
    stages: [
      {
        id: "germination",
        nameKo: "발아기",
        startDay: 0,
        adviceKo: "흙이 마르지 않게 가볍게 자주 적셔 주세요.",
      },
      {
        id: "seedling",
        nameKo: "모종기",
        startDay: 7,
        adviceKo: "솎아주기를 해서 포기 사이를 넉넉히 벌려 주세요.",
      },
      {
        id: "leafGrowth",
        nameKo: "잎 성장기",
        startDay: 21,
        adviceKo: "보통 이맘때면 겉잎부터 하나씩 따서 드실 수 있습니다.",
      },
      {
        id: "harvest",
        nameKo: "수확기",
        startDay: 32,
        adviceKo: "바깥 잎부터 순서대로 수확하면 안쪽 잎이 계속 올라옵니다.",
      },
      {
        id: "bolting",
        nameKo: "추대기",
        startDay: 45,
        adviceKo: "꽃대가 올라오면 잎이 써집니다. 남은 포기를 정리하세요.",
      },
    ],
    idealTempC: [15, 22],
    idealWeeklyRainMm: [15, 35],
    frostRiskBelowC: 4,
    heatRiskAboveC: 26,
  },

  // 토마토: 육묘 후 정식하는 과채류. 파종 110일 전후로 1화방 수확이 시작된다.
  // 추대 단계는 없으므로 수확기가 마지막 단계다.
  tomato: {
    cropId: "tomato",
    nameKo: "토마토",
    totalDays: 110,
    stages: [
      {
        id: "germination",
        nameKo: "발아기",
        startDay: 0,
        adviceKo: "지온을 20도 이상으로 유지해 주세요.",
      },
      {
        id: "seedling",
        nameKo: "모종기",
        startDay: 12,
        adviceKo: "본잎이 5~6장 나오면 아주심기를 준비하세요.",
      },
      {
        id: "leafGrowth",
        nameKo: "줄기 성장기",
        startDay: 35,
        adviceKo: "곁순을 따고 지주에 줄기를 묶어 주세요.",
      },
      {
        id: "harvest",
        nameKo: "착과·수확기",
        startDay: 70,
        adviceKo: "꼭지 주변까지 붉어진 열매부터 따 주세요.",
      },
    ],
    idealTempC: [18, 27],
    idealWeeklyRainMm: [20, 45],
    frostRiskBelowC: 6,
    heatRiskAboveC: 32,
  },

  // 딸기: 가을 정식 ~ 겨울·봄 수확의 장기 작형. 저온 요구가 있어 적정 기온대가 낮다.
  strawberry: {
    cropId: "strawberry",
    nameKo: "딸기",
    totalDays: 150,
    stages: [
      {
        id: "germination",
        nameKo: "활착기",
        startDay: 0,
        adviceKo: "뿌리가 자리 잡을 때까지 흙을 촉촉하게 유지하세요.",
      },
      {
        id: "seedling",
        nameKo: "묘 생장기",
        startDay: 25,
        adviceKo: "묵은 잎과 런너를 정리해 주세요.",
      },
      {
        id: "leafGrowth",
        nameKo: "화방 형성기",
        startDay: 60,
        adviceKo: "꽃대가 올라오면 수정이 되도록 낮에 환기해 주세요.",
      },
      {
        id: "harvest",
        nameKo: "수확기",
        startDay: 110,
        adviceKo: "전체가 붉어진 열매를 꼭지째 따 주세요.",
      },
    ],
    idealTempC: [12, 22],
    idealWeeklyRainMm: [12, 30],
    frostRiskBelowC: 2,
    heatRiskAboveC: 28,
  },
};

/** 0~1 구간으로 자른다. 진행률이 화면 밖으로 나가면 게이지가 깨진다. */
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * 파종 후 `day` 일째의 생육 단계를 찾는다.
 *
 * 경계 규칙: `startDay` 는 **포함**이다. 즉 startDay 가 21인 단계는 21일째부터다.
 * 범위 밖은 잘라낸다 — 음수면 첫 단계, totalDays 이상이면 마지막 단계.
 * (심기 전 예측 화면과 수확이 늦어진 밭 둘 다 화면이 비지 않아야 한다.)
 */
export function stageAt(calendar: CropCalendar, day: number): GrowthStage {
  const stages = calendar.stages;
  // 데이터가 비어 있으면 조용히 넘어가지 않는다. 단계 없는 달력은 데이터 결함이다.
  if (stages.length === 0) {
    throw new Error(`생육 단계가 비어 있는 작물 달력: ${calendar.cropId}`);
  }

  const last = stages[stages.length - 1];
  if (!Number.isFinite(day) || day < 0) return stages[0];
  if (day >= calendar.totalDays) return last;

  let current = stages[0];
  for (const stage of stages) {
    if (day >= stage.startDay) current = stage;
    else break;
  }
  return current;
}

/**
 * 현재 단계 **안에서의** 진행률 0~1.
 *
 * 단계의 끝은 다음 단계의 startDay, 마지막 단계의 끝은 totalDays 로 본다.
 * 마지막 단계가 totalDays 와 같은 날 시작하면(상추 추대기) 폭이 0이므로 1을 낸다.
 */
export function stageProgress(calendar: CropCalendar, day: number): number {
  const stage = stageAt(calendar, day);
  const index = calendar.stages.indexOf(stage);
  const next = calendar.stages[index + 1];
  const end = next ? next.startDay : calendar.totalDays;
  const span = end - stage.startDay;
  if (span <= 0) return 1;
  return clamp01((day - stage.startDay) / span);
}

/** 전체 재배 기간 대비 진행률 0~1. */
export function overallProgress(calendar: CropCalendar, day: number): number {
  if (calendar.totalDays <= 0) return 1;
  return clamp01(day / calendar.totalDays);
}

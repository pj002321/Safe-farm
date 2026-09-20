/**
 * ---------------------------------------------
 * [Feature]: 지금 할 작업 추천 (순수)
 *
 * [Description]
 * - 생육단계와 최근 기상을 보고 "오늘 무엇을 하면 되나"를 목록으로 낸다.
 *   LLM 을 부르지 않는다 — 물주기·웃거름 같은 답은 규칙으로 정해지고, 모델에
 *   맡기면 입력에 없는 약제와 배수를 지어낸다.
 * - **시점 제약을 두지 않는다.** "오늘 할 일" 만 추리면 사용자는 앞으로 무엇이
 *   기다리는지 모른 채 하루씩 끌려간다. 해당하는 것을 전부 내고 화면이 접는다.
 * ⚠️ **`recommendTasks_1`·`_2` 와 `stageTasks` 는 이제 아무 데서도 안 부른다**
 *    (2026-09-21). 재배 상세가 쓰던 자리를 ai-service 의 판정으로 바꿨다 —
 *    같은 밭을 두고 홈과 상세가 **반대되는 말**을 했기 때문이다(아래 표).
 *    되살리지 말 것. 파일이 남아 있는 것은 `weatherTasks` 때문이다.
 *
 * ```
 * weatherTasks       랜딩 2곳이 쓴다 (CallToAction · TodayInSangju)   ← 산다
 * recommendTasks_1·2 아무도 안 쓴다                                   ← 죽었다
 * stageTasks         위 둘 안에서만 쓰였다                             ← 같이 죽었다
 * ```
 *
 * ⚠️ **랜딩은 `weatherTasks` 를 계속 쓴다. 지우면 깨진다.** 로그인 전 데모 밭
 *    이라 사용자의 밭·재배가 없고, ai-service 카드는 밭이 있어야 나온다.
 * - 단계 이름은 `crop_stages.stage_name` 그대로 들어온다. 품종마다 표기가 조금씩
 *   달라 **부분 일치**로 묶는다(`ai-service/app/domain/ask_suggest.py` 와 같은 방식).
 * - ⚠️ **약제 이름과 희석배수는 내지 않는다.** 등록 기준은 작물·병해충별로
 *   다르고 우리에게 그 표가 없다. `/ask` 의 가드레일과 같은 선이다.
 *
 * [Usage]
 * ```ts
 * const TASK_RULE: TaskRule = recommendTasks_2;
 * TASK_RULE({ stageNameKo: "결구기", weather: { ... } });
 * ```
 * ---------------------------------------------
 */

/** 최근 며칠을 한 줄로 요약한 기상. `null` 이면 관측이 없다는 뜻이다. */
export interface TaskWeather {
  /** 관측 일수. 적으면 화면이 "관측 부족"을 말한다. */
  days: number;
  avgTempMaxC: number;
  avgTempMinC: number;
  /** 기간 합계 강수량(mm). 모르면 null. */
  rainfallMm: number | null;
}

export interface TaskAdviceInput {
  /** 현재 생육단계. 판정하지 못했으면 null. */
  stageNameKo: string | null;
  weather: TaskWeather | null;
}

export type TaskTone = "info" | "caution" | "unsuitable";

export interface TaskAdvice {
  /** 같은 작업이 두 규칙에서 나와도 한 번만 그리게 하는 열쇠. */
  id: string;
  titleKo: string;
  /** 왜 지금인가. 이유 없는 지시는 사용자가 따르지 않는다. */
  whyKo: string;
  tone: TaskTone;
}

/** 두 변형이 공유하는 모양. 호출부는 이 타입으로만 붙잡는다. */
export type TaskRule = (input: TaskAdviceInput) => readonly TaskAdvice[];

/**
 * 단계 이름에 이 조각이 들어 있으면 그 묶음으로 본다.
 *
 * 품종마다 "출아기" · "발아기" 처럼 표기가 갈려서 완전 일치로는 대부분 빠진다.
 */
const STAGE_TASKS: readonly {
  keywords: readonly string[];
  tasks: readonly TaskAdvice[];
}[] = [
  {
    keywords: ["발아", "출아", "육묘"],
    tasks: [
      {
        id: "stage-germ-moisture",
        titleKo: "겉흙이 마르지 않게 자주 조금씩 물주기",
        whyKo: "뿌리가 얕아 한 번 마르면 그대로 말라 죽습니다.",
        tone: "info",
      },
      {
        id: "stage-germ-thin",
        titleKo: "솎아주기",
        whyKo: "빽빽하면 웃자라고 서로 그늘을 만듭니다.",
        tone: "info",
      },
    ],
  },
  {
    keywords: ["정식", "활착"],
    tasks: [
      {
        id: "stage-plant-water",
        titleKo: "심은 직후 충분히 물주기",
        whyKo: "옮겨 심을 때 끊긴 잔뿌리가 자리를 잡아야 합니다.",
        tone: "info",
      },
      {
        id: "stage-plant-shade",
        titleKo: "며칠간 한낮 햇빛 가려주기",
        whyKo: "뿌리가 아직 물을 못 올려 잎이 먼저 마릅니다.",
        tone: "info",
      },
    ],
  },
  {
    keywords: ["생육", "엽", "신장", "분얼"],
    tasks: [
      {
        id: "stage-grow-topdress",
        titleKo: "웃거름 주기",
        whyKo: "잎이 빠르게 늘어나는 구간이라 양분 소모가 큽니다.",
        tone: "info",
      },
      {
        id: "stage-grow-weed",
        titleKo: "김매기",
        whyKo: "지금 잡으면 뿌리를 안 다치고 뽑힙니다.",
        tone: "info",
      },
    ],
  },
  {
    keywords: ["개화", "착과", "수정"],
    tasks: [
      {
        id: "stage-bloom-keep-dry",
        titleKo: "꽃에 물 직접 뿌리지 않기",
        whyKo: "꽃가루가 젖으면 수정이 안 됩니다.",
        tone: "caution",
      },
      {
        id: "stage-bloom-support",
        titleKo: "지주 세우고 줄 묶기",
        whyKo: "열매가 달리면 무게로 쓰러집니다.",
        tone: "info",
      },
    ],
  },
  {
    keywords: ["결구", "비대", "괴경", "구근"],
    tasks: [
      {
        id: "stage-bulk-water",
        titleKo: "물 주는 간격을 일정하게 유지",
        whyKo: "말랐다 젖었다 하면 갈라지거나 속이 빕니다.",
        tone: "caution",
      },
      {
        id: "stage-bulk-nitrogen",
        titleKo: "질소 거름 줄이기",
        whyKo: "이 시기에 질소가 많으면 잎만 자랍니다.",
        tone: "info",
      },
    ],
  },
  {
    keywords: ["등숙", "성숙", "수확"],
    tasks: [
      {
        id: "stage-harvest-stop-water",
        titleKo: "수확 며칠 전부터 물 줄이기",
        whyKo: "수분이 많으면 저장성이 떨어집니다.",
        tone: "info",
      },
      {
        id: "stage-harvest-morning",
        titleKo: "아침 서늘할 때 거두기",
        whyKo: "한낮에 거두면 금방 시듭니다.",
        tone: "info",
      },
    ],
  },
];

/** 단계를 모르거나 표에 없을 때. 빈 목록을 내놓는 것보다 낫다. */
const GENERIC: readonly TaskAdvice[] = [
  {
    id: "generic-observe",
    titleKo: "잎 뒷면까지 살펴보기",
    whyKo: "해충은 대개 잎 뒤에서 먼저 보입니다.",
    tone: "info",
  },
  {
    id: "generic-record",
    titleKo: "오늘 상태를 기록으로 남기기",
    whyKo: "다음 시즌에 같은 시기를 비교할 자료가 됩니다.",
    tone: "info",
  },
];

/** 단계 이름이 걸리는 묶음의 작업들. 없으면 빈 배열. ⚠️ 부르는 곳이 없다. */
function stageTasks(stageNameKo: string | null): readonly TaskAdvice[] {
  if (stageNameKo === null) return [];
  const group = STAGE_TASKS.find((entry) =>
    entry.keywords.some((keyword) => stageNameKo.includes(keyword)),
  );
  return group?.tasks ?? [];
}

/**
 * **변형 1 — 생육단계만 본다. ⚠️ 지금은 아무도 안 부른다**(파일 머리말).
 *
 * 기상 관측이 없어도 늘 같은 답이 나온다. `weather_obs_daily` 가 아직 얇아서
 * 지금 실제로 돌려도 결과가 흔들리지 않는 쪽이다.
 *
 * 대신 폭염이든 장마든 같은 말을 한다. "물 주는 간격을 일정하게" 를 사흘 내리
 * 비 온 날에도 그대로 내놓는다.
 */
export const recommendTasks_1: TaskRule = (input) => {
  const tasks = stageTasks(input.stageNameKo);
  return tasks.length > 0 ? tasks : GENERIC;
};

/** 이 온도를 넘으면 더운 것으로 본다. 작물 공통 기준이라 넉넉히 잡았다. */
const HOT_MAX_C = 33;

/** 이 온도 아래로 내려가면 찬 것으로 본다. */
const COLD_MIN_C = 5;

/** 기간 합계가 이만큼 넘으면 젖은 것으로 본다. */
const WET_MM = 80;

/** 기간 합계가 이보다 적으면 마른 것으로 본다. */
const DRY_MM = 5;

/** 기상이 이 일수보다 적게 모였으면 조건 판정을 하지 않는다. */
const MIN_WEATHER_DAYS = 3;

/** 기상 조건에서 나오는 작업. 단계와 무관하게 붙는다. */
export function weatherTasks(
  weather: TaskWeather | null,
): readonly TaskAdvice[] {
  if (weather === null || weather.days < MIN_WEATHER_DAYS) return [];

  const tasks: TaskAdvice[] = [];

  if (weather.avgTempMaxC >= HOT_MAX_C) {
    tasks.push({
      id: "weather-heat",
      titleKo: "한낮 물주기를 피하고 아침저녁으로 옮기기",
      whyKo: `최근 평균 최고기온이 ${Math.round(weather.avgTempMaxC)}도입니다. 뜨거운 흙에 찬물이 닿으면 뿌리가 상합니다.`,
      tone: "unsuitable",
    });
  }

  if (weather.avgTempMinC <= COLD_MIN_C) {
    tasks.push({
      id: "weather-cold",
      titleKo: "밤에 덮개 씌우기",
      whyKo: `최근 평균 최저기온이 ${Math.round(weather.avgTempMinC)}도입니다. 서리가 내리면 하룻밤에 끝납니다.`,
      tone: "unsuitable",
    });
  }

  if (weather.rainfallMm !== null && weather.rainfallMm >= WET_MM) {
    tasks.push({
      id: "weather-wet",
      titleKo: "고랑 물길 터주기",
      whyKo: `최근 ${weather.days}일 강수량이 ${Math.round(weather.rainfallMm)}mm 입니다. 물이 고이면 뿌리가 숨을 못 쉽니다.`,
      tone: "caution",
    });
  }

  if (weather.rainfallMm !== null && weather.rainfallMm <= DRY_MM) {
    tasks.push({
      id: "weather-dry",
      titleKo: "뿌리까지 젖도록 한 번에 충분히 주기",
      whyKo: `최근 ${weather.days}일 강수량이 ${Math.round(weather.rainfallMm)}mm 입니다. 조금씩 자주 주면 뿌리가 얕게 뻗습니다.`,
      tone: "caution",
    });
  }

  return tasks;
}

/**
 * **변형 2 — 단계와 기상을 함께 본다. ⚠️ 지금은 아무도 안 부른다.**
 *
 * 재배 상세가 이걸 쓰다가 ai-service 로 옮겼다(2026-09-21). 여기 임계값은
 * 작물과 무관한 고정값(더위 33도 · 가뭄 3일 5mm)이라, 작물별 한계값과 물수지를
 * 보는 홈 판정과 갈렸다 — 추수 3주 전 물을 뺀 논에 홈은 조용한데 이쪽이
 * "뿌리까지 젖도록 충분히 주기" 를 냈다. 정확히 반대였다.
 *
 * 단계 작업 앞에 기상에서 나온 작업을 붙인다. 급한 것이 위로 오도록 기상 쪽을
 * 먼저 두었다 — 폭염 경고는 웃거름보다 먼저 읽혀야 한다.
 *
 * 관측이 `MIN_WEATHER_DAYS` 보다 적게 모이면 기상 조건을 건너뛴다. 하루치로
 * "요즘 덥다"고 말하면 소나기 한 번에 경고가 붙었다 떨어진다.
 */
export const recommendTasks_2: TaskRule = (input) => {
  const stage = stageTasks(input.stageNameKo);
  const weather = weatherTasks(input.weather);
  const merged = [...weather, ...stage];
  return merged.length > 0 ? merged : GENERIC;
};

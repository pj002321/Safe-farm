/**
 * ---------------------------------------------
 * [Feature]: 리포트 생성 과정 재생 타임라인
 *
 * [Description]
 * - 이 화면의 주장은 "문장 하나하나가 어디서 왔는지 댈 수 있다"이다. 그걸 말로
 *   설명하는 대신 **과정을 그대로 재생**한다. 단계가 하나씩 쌓이고, 그때마다
 *   왼쪽 화면의 해당 조각이 열린다.
 * - 단계는 세 종류다. `fetch` 는 밖에서 받아온 값, `compute` 는 우리 코드가 계산한
 *   값, `write` 는 저장하는 값. 색으로만 구분하지 않고 라벨을 함께 둔다.
 * - **마지막 단계가 이 데모의 요점이다.** 앞의 일곱 단계에서 숫자가 전부 정해지고,
 *   LLM 은 그걸 사람 말로 옮기기만 한다. 판단을 맡기면 입력에 없는 숫자를 지어낸다.
 * - 순수 데이터 + 순수 함수만 둔다. 재생 상태(지금 몇 번째인가)는 화면이 들고 있고
 *   이 파일은 모른다 — 그래야 타임라인을 테스트할 수 있다.
 *
 * [Usage]
 * ```ts
 * TIMELINE[0].titleKo;              // "밭 위치 확인"
 * revealedAt(TIMELINE, 3);          // 3단계까지 진행됐을 때 열려 있는 조각들
 * ```
 * ---------------------------------------------
 */

/** 단계 종류. 화면의 점 색과 상단 집계가 이 값을 본다. */
export type StepKind = "fetch" | "compute" | "write";

/** 왼쪽 화면에서 열리는 조각. 단계가 진행되면서 하나씩 나타난다. */
export type RevealId =
  | "plot"
  | "history"
  | "gauge"
  | "hazard"
  | "today"
  | "drone"
  | "advice";

/** 코드·응답 블록 한 덩어리. 줄바꿈은 그대로 보존된다. */
export interface TraceBlock {
  /** `caption` 은 블록 위에 붙는 한 줄 설명(주석 성격). */
  captionKo?: string;
  text: string;
}

export interface TraceStep {
  id: string;
  /** 화면에 찍히는 번호(1부터). 배열 순서와 같지만 명시해 둔다. */
  order: number;
  titleKo: string;
  kind: StepKind;
  /** 어디서 왔는가. 화면의 출처 배지에 그대로 찍힌다. */
  sourceKo: string;
  tagKo?: string;
  blocks: readonly TraceBlock[];
  /** 왜 이 단계가 필요한가. 기술 설명이 아니라 판단의 근거를 적는다. */
  whyKo: string;
  /** 이 단계가 끝나면 왼쪽에서 열리는 조각. 없으면 화면 변화 없음. */
  reveals?: RevealId;
}

export const TIMELINE: readonly TraceStep[] = [
  {
    id: "locate",
    order: 1,
    titleKo: "밭 위치 확인",
    kind: "fetch",
    sourceKo: "Open-Meteo",
    tagKo: "키 불필요",
    reveals: "plot",
    blocks: [
      {
        text: `GET api.open-meteo.com/v1/forecast
  latitude=36.4084  longitude=128.1574`,
      },
      {
        text: `→ elevation  74m
→ timezone   Asia/Seoul
→ 가장 가까운 관측소  상주 (STN 137)`,
      },
    ],
    whyKo:
      "좌표만 넣으면 해발고도와 시간대가 따라옵니다. 관측소 번호는 이후 기상청 호출의 열쇠가 됩니다.",
  },
  {
    id: "history",
    order: 2,
    titleKo: "지난 기온·강수 받아오기",
    kind: "fetch",
    sourceKo: "기상청 API허브",
    tagKo: "실측",
    reveals: "history",
    blocks: [
      {
        captionKo: "지상관측 일통계",
        text: `GET apihub.kma.go.kr/api/typ01/url/arcltr_sfc_day.php
  stn=137  tm1=20260825  tm2=20260913`,
      },
      {
        text: `TM         TA_MAX  TA_MIN  RN_DAY
20260909    25.5    14.8     0.0
20260910    23.2    12.1     0.0
20260911    27.1    14.0     0.0
20260912    28.1    15.1     0.0
20260913    28.8    15.0     0.0
                       7일 강수 합계 0.0mm`,
      },
    ],
    whyKo:
      "예보가 아니라 실제로 관측된 값입니다. 씨 뿌린 날부터 오늘까지를 거슬러 계산할 수 있어, 이미 한참 자란 밭도 바로 쓸 수 있습니다.",
  },
  {
    id: "standard",
    order: 3,
    titleKo: "배추 기준 가져오기",
    kind: "fetch",
    sourceKo: "농촌진흥청",
    tagKo: "농작업일정",
    blocks: [
      {
        captionKo: "생육온도",
        text: `발아적온   20~25℃
생육적온   15~20℃
결구적온   15~16℃   ← 속이 차는 때
언피해     -3~-4℃`,
      },
      {
        captionKo: "기상재해 대책 — 가을가뭄",
        text: `ㅇ 이동식 스프링클러 물주기
ㅇ 짚 덮기
ㅇ 살충제 살포`,
      },
    ],
    whyKo:
      "왼쪽 조언은 우리가 지어낸 게 아니라 이 문서의 대책을 옮긴 것입니다. 임계값도 여기서 가져옵니다 — 그래서 근거를 그대로 댈 수 있습니다.",
  },
  {
    id: "gdd",
    order: 4,
    titleKo: "적산온도 쌓기",
    kind: "compute",
    sourceKo: "우리 코드",
    tagKo: "gdd.ts",
    reveals: "gauge",
    blocks: [
      {
        captionKo:
          "하루치 = 평균기온 − 기준온도. 상한을 넘은 낮은 상한으로 친다",
        text: `dailyGdd(tmax, tmin, base, upper) =
  max(0, (min(tmax, upper) + max(tmin, base)) / 2 - base)`,
      },
      {
        text: `base = 5.0   upper = 25.0   씨뿌림 = 08-25

09-11  (min(27.1,25)+max(14.0,5))/2 - 5 = 14.5
09-12  (min(28.1,25)+max(15.1,5))/2 - 5 = 15.1
09-13  (min(28.8,25)+max(15.0,5))/2 - 5 = 15.0

누적          361.6 GDD / 797   진행 45.4%

최근 7일 평균   14.6 GDD/일
결구(505)까지  약 10일`,
      },
    ],
    whyKo:
      "며칠 남았는지는 이 계산이 정합니다. 날짜가 아니라 쌓인 열로 재기 때문에, 올해가 더웠으면 더 빨리 나옵니다.",
  },
  {
    id: "hazard",
    order: 5,
    titleKo: "재해 판정",
    kind: "compute",
    sourceKo: "우리 코드",
    tagKo: "hazard.ts",
    reveals: "hazard",
    blocks: [
      {
        captionKo: "농진청 대책표를 그대로 규칙으로 옮김",
        text: `가을가뭄     rain7 < 5mm
결구기 고온   tmax > 25℃ and stage == "결구"
한파 언피해   tmin <= -3℃`,
      },
      {
        text: `rain7 = 0.0mm   →  가을가뭄 발동
tmax  = 28.8℃   →  결구적온보다 높음 (아직 생육기)
tmin  = 15.0℃   →  한파 아님`,
      },
    ],
    whyKo:
      "임계값을 우리가 정하지 않았습니다. 농진청 문서의 숫자를 그대로 옮긴 것이라, 기준이 바뀌면 문서를 먼저 확인하게 됩니다.",
  },
  {
    id: "sun",
    order: 6,
    titleKo: "오늘 바람과 해 시각",
    kind: "fetch",
    sourceKo: "Open-Meteo",
    tagKo: "밭 좌표 기준",
    reveals: "today",
    blocks: [
      {
        text: `해 뜸 06:07    해 짐 18:38    해발 74m

시각    풍향    풍속   기온   습도
06:00  서북서   1.3   17℃   97%
07:00  서북서   1.5   19℃   82%
15:00  서       3.9   27℃   62%
18:00  서북서   1.8   24℃   57%`,
      },
    ],
    whyKo:
      "관측소가 아니라 밭 좌표로 조회합니다. 해발 74m 배추밭과 158m 과수원은 하루 0.6℃ 차이가 나고, 한 철이면 적산온도 60도로 벌어집니다.",
  },
  {
    id: "drone",
    order: 7,
    titleKo: "드론 방제 적기 판정",
    kind: "compute",
    sourceKo: "우리 코드",
    tagKo: "drone.ts",
    reveals: "drone",
    blocks: [
      {
        captionKo: "잠정 기준 — 방제하시는 분께 확인 필요",
        text: `바람 ≤ 3.0 m/s     습도 ≥ 60%
기온 ≤ 28℃         해 뜬 뒤 150분 이내`,
      },
      {
        text: `06:00  해 뜨기 전
07:00  바람 1.5  습도 82%   가능
08:00  바람 1.9  습도 70%   가능
09:00  아침 창 지남
15:00  바람 3.9 > 3.0
18:00  습도 57% < 60%

→ 오늘 가능 구간  07:00 ~ 08:00`,
      },
    ],
    whyKo:
      '방제하시는 분들이 말하는 "해 뜰 무렵 이슬 남아 있을 때"를 습도와 일출 시각으로 옮긴 것입니다. 막힌 시간대는 이유를 함께 표시합니다.',
  },
  {
    id: "compose",
    order: 8,
    titleKo: "문장으로 옮기기",
    kind: "compute",
    sourceKo: "Claude",
    tagKo: "판단 아님",
    reveals: "advice",
    blocks: [
      {
        captionKo: "코드가 정한 값만 넘깁니다",
        text: `{ "작물": "가을배추", "파종후": 20,
  "누적GDD": 384, "목표": 797,
  "다음단계": "결구", "남은일수": 8,
  "강수7일": 0.0, "최고기온": 28.8,
  "발동재해": ["가을가뭄"],
  "대책": ["스프링클러 물주기", "짚 덮기"] }`,
      },
      {
        captionKo: "시스템 프롬프트 핵심",
        text: `- 58세 농민이 읽는 글. 쉬운 말로.
- 입력에 없는 숫자를 지어내지 말 것
- 병해충 진단 금지. 관찰 안내까지만.`,
      },
    ],
    whyKo:
      "며칠 남았는지도, 물이 부족한지도 4·5단계에서 이미 정해졌습니다. 여기서는 그 결과를 사람 말로 바꾸기만 합니다.",
  },
];

/** n단계까지 진행됐을 때 왼쪽에서 열려 있어야 할 조각들. */
export function revealedAt(
  steps: readonly TraceStep[],
  completed: number,
): Set<RevealId> {
  const open = new Set<RevealId>();
  for (const step of steps.slice(0, Math.max(0, completed))) {
    if (step.reveals) open.add(step.reveals);
  }
  return open;
}

/** 종류별 집계. 상단의 "받아온 값 n · 계산 n" 이 이걸 쓴다. */
export function tally(
  steps: readonly TraceStep[],
  completed: number,
): Record<StepKind, number> {
  const counts: Record<StepKind, number> = { fetch: 0, compute: 0, write: 0 };
  for (const step of steps.slice(0, Math.max(0, completed))) {
    counts[step.kind] += 1;
  }
  return counts;
}

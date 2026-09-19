/**
 * ---------------------------------------------
 * [Feature]: 위성 지수(NDVI·NDMI)를 농민이 읽을 한 줄로
 *
 * [Description]
 * - NDVI 0.79 를 보여 줘도 파릇한지 알 수 없다. 등급과 변화를 사람 말로 옮긴다.
 * - **판정에 쓰지 않는다.** 물을 줄지 말지는 기상(물수지)이 정한다. 여기는 화면에
 *   붙일 말만 만든다 — 위성을 판정에 넣는 것은 별건이다.
 * - **LLM 을 쓰지 않는다.** 가를 축이 NDVI 5칸 · NDMI 방향 4칸뿐이라 문장 아홉 개면
 *   끝난다. 값이 커서 규칙이 못 버티는 자리가 아니다.
 *
 * ⚠ **`ai-service/app/domain/vegetation_text.py` 와 같은 기준이어야 한다.**
 *   저쪽은 LLM 프롬프트에, 이쪽은 화면에 쓴다. 한쪽만 고치면 같은 밭을 두고
 *   차트와 리포트가 다른 말을 한다. 임계값을 옮길 때는 **둘 다** 옮긴다.
 *   (`maturity.ts` 가 화면과 서버의 기본값이 갈려 겪은 것과 같은 함정이다.)
 *
 * [Usage]
 * ```ts
 * describeNdvi(0.787)                                  // "잎이 빽빽하게 덮였어요."
 * describeNdmiTrend(0.344, 0.423, { isRipening: true }) // "익어 가면서 …"
 * ```
 * ---------------------------------------------
 */

/**
 * NDVI 칸 경계.
 *
 * 작물이 달라도 뜻이 비슷해 절대 기준이 선다. 2026-09-19 실측(전남 밭 3곳)이
 * 그것을 보여 준다 — 벼 +0.79 · 양파 +0.54 · 추수 후 맨땅 +0.27 · 밭 아님 −0.15.
 * 원격탐사 통례와도 어긋나지 않는다(맨땅 0.1~0.2 · 성긴 0.2~0.5 · 무성 0.6~0.9).
 */
export const NDVI_DENSE = 0.6;
export const NDVI_GROWING = 0.4;
export const NDVI_SPARSE = 0.2;
export const NDVI_NONE = 0;

/**
 * NDMI 가 이만큼 움직여야 "달라졌다" 고 본다.
 *
 * ⚠ **절대값으로 판정하지 않는다.** NDMI 는 NDVI 에 딸려 움직여서, 잎이 적으면
 *   자동으로 낮게 나온다 — 양파의 +0.135 는 말라서가 아니라 잎이 성겨서다.
 *   그래서 같은 밭의 **변화**로만 말한다.
 *
 * 0.05 인 까닭: 조회 영역(반폭)을 5~30m 로 바꿔 재보니 폭이 0.02~0.09 였다.
 * 그보다 작은 움직임은 영역이 조금 달라진 것과 구분되지 않는다.
 */
export const NDMI_STEP = 0.05;

/**
 * 관측이 이보다 벌어지면 견주지 않는다.
 *
 * ⚠ 관측이 평균 18일에 한 번이고 최장 공백이 32일이다(90일에 5건, 2026-09-19 실측).
 *   한 달 전과 견주는 것은 **계절이 바뀐 것을 마름으로 읽는 일**이다.
 */
export const NDMI_MAX_GAP_DAYS = 30;

/**
 * NDVI 한 값을 사람 말로. 값이 없으면 null — 침묵이 기본값이다.
 *
 * ⚠ 숫자를 문장에 넣지 않는다. "0.787" 은 차트가 보여 준다.
 */
export function describeNdvi(ndvi: number | null | undefined): string | null {
  if (ndvi === null || ndvi === undefined || Number.isNaN(ndvi)) return null;
  if (ndvi >= NDVI_DENSE) return "잎이 빽빽하게 덮였어요.";
  if (ndvi >= NDVI_GROWING) return "잎이 한창 자라고 있어요.";
  if (ndvi >= NDVI_SPARSE) return "잎이 성기거나 이제 올라오는 중이에요.";
  if (ndvi >= NDVI_NONE)
    return "잎이 거의 없어요. 심기 전이거나 거둔 뒤로 보여요.";
  // ⚠ 음수는 **식생이 아니라는 뜻**이다(물·건물·아스팔트). 좌표를 잘못 찍었을 때
  //   화면이 스스로 알려 주는 자리다 — 실측에서 임의 좌표가 −0.15 였다.
  return "식물이 안 보여요. 밭 위치가 맞는지 확인해 주세요.";
}

export interface NdmiTrendOptions {
  /** 지금이 익어 가는 단계인가(수확·성숙·익음·등숙). 모르면 false. */
  isRipening?: boolean;
  /** 두 관측 사이 날수. 너무 벌어지면 견주지 않는다. */
  gapDays?: number;
}

/**
 * NDMI 의 **변화**를 사람 말로. 견줄 것이 없으면 null.
 *
 * ⚠ **익어 가는 중이면 내림이 정상이다.** 이 단서가 없으면 농민이 "물을 줘야 하나"
 *   로 읽는다 — 실제로 사용자의 논이 물을 뺀 뒤 0.423 → 0.344 로 떨어졌는데
 *   10월 추수를 앞둔 정상 상태였다(2026-09-19).
 *
 * ⚠ 단정하지 않는다. "말랐습니다" 가 아니라 "물기가 줄었어요" 다 —
 *   위성은 잎을 보지 뿌리도 흙도 못 본다.
 */
export function describeNdmiTrend(
  now: number | null | undefined,
  before: number | null | undefined,
  { isRipening = false, gapDays }: NdmiTrendOptions = {},
): string | null {
  if (now === null || now === undefined || Number.isNaN(now)) return null;
  if (before === null || before === undefined || Number.isNaN(before))
    return null;
  if (gapDays !== undefined && gapDays > NDMI_MAX_GAP_DAYS) return null;

  const diff = now - before;
  if (diff <= -NDMI_STEP) {
    return isRipening
      ? "익어 가면서 잎이 마르는 중이에요. 이맘때는 자연스러운 변화예요."
      : "잎의 물기가 지난번보다 줄었어요.";
  }
  if (diff >= NDMI_STEP) return "잎의 물기가 지난번보다 늘었어요.";
  return "잎의 물기는 지난번과 비슷해요.";
}

/**
 * 단계 이름에 이 낱말이 있으면 "익어 가는 중" 으로 본다.
 *
 * ⚠ **지금은 글자로 판정한다.** crop_stages 520행 중 148행이 걸린다.
 *   crop-data 의 `단계낱말` 과 같은 방식이다 — 더 나은 길은 단계마다 성격을
 *   칸으로 다는 것인데, 그건 마스터 쪽 일이라 다음 기회로 미뤘다.
 */
const RIPENING_WORDS = [
  "수확",
  "성숙",
  "익음",
  "등숙",
  "완숙",
  "황숙",
  "호숙",
  "유숙",
] as const;

/** 익어 가는 때인가. 단계를 모르면 거짓 — 모름을 정상으로 읽지 않는다. */
export function isRipeningStage(
  stageNameKo: string | null | undefined,
): boolean {
  const name = stageNameKo ?? "";
  return RIPENING_WORDS.some((word) => name.includes(word));
}

/**
 * 한 밭의 위성 관측을 한 줄로 묶는다. 할 말이 없으면 `null`.
 *
 * ⚠ **'2주 전' 같은 고정 간격을 쓰지 않는다.** 관측이 평균 18일에 한 번밖에
 *   안 남아(실측 · 최장 공백 32일) 그 날짜에 값이 있을 보장이 없다. 있는 것 중
 *   **가까운 둘**을 쓰고, 벌어졌으면 `describeNdmiTrend` 가 알아서 침묵한다.
 *
 * ⚠ 서버가 날짜 오름차순으로 준다는 전제다(app/api/satellite.py).
 *
 * ⚠ ai-service 의 `vegetation_text.summarize_points` 와 **같은 일**을 한다.
 *   한쪽만 고치면 홈 배너와 리포트가 같은 밭을 두고 다른 말을 한다.
 *   `SatellitePanel` 도 지금은 제 안에서 같은 계산을 한다 — 이 함수로 옮기면
 *   한 곳이 된다(남의 파일이라 이번엔 두었다).
 */
export function summarizeObservations(
  points: ReadonlyArray<{ date: string; ndvi: number; ndmi: number }>,
  options: { isRipening?: boolean } = {},
): string | null {
  if (points.length === 0) return null;

  const last = points[points.length - 1];
  const prev = points.length >= 2 ? points[points.length - 2] : undefined;
  if (!last) return null;

  const gapDays = prev
    ? Math.round((Date.parse(last.date) - Date.parse(prev.date)) / 86_400_000)
    : undefined;

  const 말 = [
    describeNdvi(last.ndvi),
    describeNdmiTrend(last.ndmi, prev?.ndmi, {
      isRipening: options.isRipening ?? false,
      gapDays,
    }),
  ].filter((x): x is string => x !== null);

  return 말.length > 0 ? 말.join(" ") : null;
}

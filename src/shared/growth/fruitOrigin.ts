/**
 * ---------------------------------------------
 * [Feature]: 과수의 그 해 기점 — GDD 를 어디서 0으로 되감나 (순수)
 *
 * [Description]
 * - 나무는 몇 해 전에 심었다. 파종일부터 쌓으면 **여러 해치 열이 누적된다** —
 *   5년 전에 심은 사과가 첫해에 `gdd_target` 을 넘어 영영 '수확' 에 머문다.
 *   그 해의 0일은 **기점**(발아, 없으면 개화)이고 날짜는 마스터에 있다.
 * - `sowing_date` 는 그대로 **심은 날**로 남는다. n년차를 세는 자리다.
 *
 * ★ **같은 규칙이 파이썬에도 있다** — `ai-service/app/service/plot_growth.py` 의
 *   `is_fruit` · `_중앙일` · `_과수기점일` · `gdd_origin`.
 *   언어가 달라 두 벌로 적되 **같아야 한다.** 한쪽만 고치면 화면이 말하는
 *   '개화기' 와 LLM 이 말하는 '개화기' 가 갈린다 — `growthGauge.ts` 머리말이
 *   이미 그 약속을 적어 두었다. **고칠 때는 양쪽을 같이 고친다.**
 *
 * [Usage]
 * ```ts
 * const from = fruitOriginDate(variant, today) ?? sowingDate;
 * ```
 * ---------------------------------------------
 */

/**
 * 이 값이 `crop_variants.sow_method` 에 있으면 **과수**다.
 *
 * ⚠ 작물 이름 목록을 두지 않는다 — 마스터가 이미 표시해 준다(crop-data
 *   `build._파종방법`). 이름 목록은 늘 낡는다.
 * ⚠ `인공수분`(참다래의 옛 값)은 여기 없다. 그건 농작업이지 기점이 아니다.
 */
const FRUIT_METHODS = new Set(["발아", "개화"]);

export interface FruitWindow {
  /** `crop_variants.sow_method`. 과수면 `발아`·`개화` 가 온다. */
  sowMethod: string | null;
  /** 기점 창의 시작 (`"MM-DD"`). 과수가 아니면 파종 창이다. */
  sowFrom: string | null;
  /** 기점 창의 끝 (`"MM-DD"`). */
  sowTo: string | null;
}

/** 과수인가. `sow_method` 한 칸으로 가른다. */
export function isFruit(sowMethod: string | null): boolean {
  return FRUIT_METHODS.has((sowMethod ?? "").trim());
}

/** `"MM-DD"` → `[월, 일]`. 못 읽으면 null. */
function parseMmDd(value: string | null): [number, number] | null {
  const m = /^(\d{2})-(\d{2})$/.exec((value ?? "").trim());
  if (m === null) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  // ⚠ **달력에 물어본다.** 숫자 범위(1~12·1~31)만 보면 `02-30` 이 새어 나가고,
  //   그 값으로 `Date.UTC` 를 부르면 3월 2일로 조용히 굴러간다. 2000 은 윤년이라
  //   `02-29` 는 받는다. 파이썬 `plot_growth._중앙일` 도 같은 검사를 한다 —
  //   한쪽만 고치지 말 것.
  const probe = new Date(Date.UTC(2000, month - 1, day));
  if (
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day ||
    month < 1 ||
    month > 12
  ) {
    return null;
  }
  return [month, day];
}

const DAY_MS = 86_400_000;

/**
 * 창의 **가운데 날**. 한쪽만 있으면 그쪽을 쓴다.
 *
 * ⚠ **왜 가운데인가.** crop-data 가 `gdd_target` 을 만들 때 쓴 기준일이 창의
 *   중앙일이다(`build._작형_일정` 의 `파종일`). 목표는 중앙일 기준인데 누적을
 *   창 시작이나 끝에서 세면 **분자와 분모의 기준이 달라진다.**
 */
export function windowMidMmDd(
  from: string | null,
  to: string | null,
): [number, number] | null {
  const a = parseMmDd(from);
  const b = parseMmDd(to);
  if (a === null) return b;
  if (b === null) return a;

  // ⚠ **2000 년(윤년)으로 고정해 센다.** 파이썬 `plot_growth._중앙일` 이
  //   `date(2000, …)` 을 쓰므로 같은 해를 써야 한다. 평년으로 세면 `02-29` 가
  //   3월 1일로 굴러 **가운데가 하루 어긋난다**(02-29~03-05 가 3.2 vs 3.3).
  //   2026-09-21 에 테스트가 이 갈림을 잡았다.
  const start = Date.UTC(2000, a[0] - 1, a[1]);
  // 해를 넘는 창(12-25~01-05)은 끝을 다음 해로 민다. 지금 과수엔 없지만 막아 둔다
  const endRaw = Date.UTC(2000, b[0] - 1, b[1]);
  const end = endRaw < start ? Date.UTC(2001, b[0] - 1, b[1]) : endRaw;

  const mid = new Date(start + Math.floor((end - start) / 2 / DAY_MS) * DAY_MS);
  return [mid.getUTCMonth() + 1, mid.getUTCDate()];
}

/**
 * `"YYYY-MM-DD"` 의 연도. 꼴이 아니면 null.
 *
 * ⚠ **`Number(문자열)` 만으로는 못 막는다.** `Number("")` 가 `0` 이라
 *   `Number.isFinite` 를 통과하고, 그러면 `"-1-03-25"` 같은 날짜가 만들어진다
 *   (2026-09-21 버그 헌팅에서 실제로 나왔다). `"2026"` 처럼 짧은 값도
 *   그대로 통과해 조용히 작년 기점을 돌려줬다. **꼴부터 본다.**
 */
function yearOf(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? "")) return null;
  return Number(iso.slice(0, 4));
}

/** `[월, 일]` + 연도 → `"YYYY-MM-DD"`. */
function toIso(year: number, [month, day]: [number, number]): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * 과수의 **그 해 기점일** (`"YYYY-MM-DD"`). 과수가 아니거나 창이 비면 null.
 *
 * ⚠ 올해 기점이 **아직 안 왔으면 작년 것**이다. 그래야 수확이 늦은 과수
 *   (감귤 12월)가 해를 넘겨도 적산이 끊기지 않는다.
 *
 * ⚠ 창이 빈 품종은 null 을 돌려 부르는 쪽이 옛 길(파종일)로 떨어지게 한다.
 *   그 작물은 어차피 `gdd_target` 도 비어 게이지가 안 뜬다 — 조용히 틀리는
 *   것보다 낫다.
 */
export function fruitOriginDate(
  variant: FruitWindow,
  today: string,
): string | null {
  if (!isFruit(variant.sowMethod)) return null;

  const mid = windowMidMmDd(variant.sowFrom, variant.sowTo);
  if (mid === null) return null;

  const year = yearOf(today);
  if (year === null) return null;

  const thisYear = toIso(year, mid);
  return thisYear <= today ? thisYear : toIso(year - 1, mid);
}

/**
 * 나무를 심은 지 몇 해째인가. 과수가 아니거나 심은 날을 모르면 null.
 *
 * ⚠ **보여 주기까지만 한다.** 어린나무에서 수확 예측을 감추려면 작물별
 *   **결실 시작 나이**(사과 3~5년 · 감귤 4~5년)가 있어야 하는데 마스터에 없다.
 *   지어내지 않는다.
 */
export function yearsSincePlanting(
  variant: FruitWindow,
  sowingDate: string | null,
  today: string,
): number | null {
  if (!isFruit(variant.sowMethod) || sowingDate === null) return null;
  const planted = yearOf(sowingDate);
  const now = yearOf(today);
  if (planted === null || now === null) return null;
  const 해 = now - planted + 1;
  // ⚠ **심은 날이 오늘보다 뒤면 음수가 나온다.** 화면에 "-3년차" 가 찍힌다.
  //   막을 수 있는 입력이 아니라(사용자가 미래 날짜를 넣을 수 있다) 여기서 거른다.
  return 해 >= 1 ? 해 : null;
}

/** 과수의 한 해 주기 상태. 과수가 아니면 화면이 이 칸을 안 쓴다. */
export interface FruitCycle {
  /** 올해(또는 작년) 기점일. `"YYYY-MM-DD"`. */
  originOn: string;
  /** 다음 기점일 — 여기서 GDD 가 0으로 되감긴다. `"YYYY-MM-DD"`. */
  nextOriginOn: string;
  /** 기점 낱말 그대로. `발아` · `개화`. 화면이 말을 고른다. */
  originKind: string;
  /** 나무를 심은 지 몇 해째인가. 심은 날을 모르면 null. */
  years: number | null;
  /**
   * 올해 수확을 끝내고 다음 기점을 기다리는 중인가.
   *
   * ★ `crop_stages` 는 기점~수확까지만 담는다(교안 §3-2) — 겨울은 GDD 가 0이라
   *   구간으로 못 잰다. 그래서 **수확 뒤는 DB 에 줄이 없고 여기서 판정한다.**
   *
   * ⚠ **"단계를 못 찾았다" 와 뜻이 다르다.** 저건 자료가 빠진 것이고 이건
   *   찾을 것이 없는 게 정상인 상태다. 섞으면 한 해의 절반을 "자료가
   *   없습니다" 로 말하게 된다 — 파이썬 `PlotGrowth.after_harvest` 와 같은 판단.
   */
  afterHarvest: boolean;
}

/** 다음 해 같은 날. `"YYYY-MM-DD"`. */
function nextYearOf(iso: string): string {
  return `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}`;
}

/**
 * 과수의 한 해 주기. **과수가 아니거나 기점을 못 구하면 null.**
 *
 * ⚠ `afterHarvest` 는 누적이 목표를 넘었는지로 가른다. 목표를 모르면(`null`)
 *   판정하지 않는다 — 분모 없는 판단은 거짓 숫자가 된다.
 */
export function buildFruitCycle(
  variant: FruitWindow & { sowingDate: string | null },
  today: string,
  accumulatedGdd: number | null,
  gddTarget: number | null,
): FruitCycle | null {
  const originOn = fruitOriginDate(variant, today);
  if (originOn === null) return null;

  return {
    originOn,
    nextOriginOn: nextYearOf(originOn),
    originKind: (variant.sowMethod ?? "").trim(),
    years: yearsSincePlanting(variant, variant.sowingDate, today),
    afterHarvest:
      accumulatedGdd !== null &&
      gddTarget !== null &&
      accumulatedGdd >= gddTarget,
  };
}

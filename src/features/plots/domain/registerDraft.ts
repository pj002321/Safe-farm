/**
 * ---------------------------------------------
 * [Feature]: 밭 등록 폼 임시 저장 (순수 함수)
 *
 * [Description]
 * - 스텝을 나가거나 새로 고쳐도 입력이 남게 한다(V1-23). 등록 폼은 JS 상태 없이
 *   진짜 `<input name=…>` 들이라 **FormData ↔ JSON** 만 오가면 된다.
 *   저장소(localStorage)는 훅이 만진다 — 여기는 변환과 판정만 한다.
 * - 같은 `name` 이 여럿인 칸이 있어서(작물 체크박스) 값은 **항상 배열**이다.
 *
 * ⚠️ **위치 다섯 칸은 이 폼에서 유일하게 React 상태가 만든다.**
 *   `latitude`·`longitude`·`addressKo`·`regionCode`·`regionKo` 는 `PlotLocationStep` 의
 *   `selected` 가 있어야 `LocationSummary` 가 그려내는 hidden input 이다. 고르기 전에는
 *   `addressKo` 등이 **DOM 에 아예 없다.** 그래서 값을 되돌리는 것만으로는 복원이 안 되고,
 *   지도 쪽이 `restoredLocation()` 으로 읽어 `setSelected` 를 불러야 한다.
 *
 * ⚠️ 저장본에 **시각을 같이 담는다.** "2시간 전" 과 "8일 전" 은 사용자에게 완전히 다른
 *   정보다 — 배너가 그걸 보여줘야 지난주 밭 좌표로 오늘 밭을 등록하는 사고를 막는다.
 * ---------------------------------------------
 */

export const REGISTER_DRAFT_KEY = "safe-farm-plot-register-draft";

/** 폼 한 벌. 키는 input 의 name, 값은 그 name 으로 들어온 값 전부. */
export type DraftValues = Record<string, string[]>;

export interface Draft {
  /** 저장 시각(ISO). 배너가 "몇 시간 전" 을 계산한다. */
  savedAt: string;
  values: DraftValues;
}

/**
 * 지도 쪽이 되살려야 하는 값.
 *
 * ⚠️ 격자(gridX·gridY)는 여기 없다. **폼에 실리지 않는 값**이고 좌표에서 `toKmaGrid` 로
 *   계산되는 것이라, 저장해 두었다 되돌리면 계산식이 바뀌었을 때 옛 격자가 살아난다.
 *   부르는 쪽이 좌표로 다시 계산한다.
 */
export interface DraftLocation {
  addressKo: string;
  latitude: number;
  longitude: number;
  regionCode: string;
  regionKo: string;
}

/**
 * 저장하지 않는 칸.
 *
 * ⚠️ `__step` 은 **저장하면 안 된다.** 마법사 단계는 라디오 + CSS 로만 바뀌는데
 *   (`panel: "hidden group-has-[#wizard-1:checked]..."`), 3단계로 복원하면 1단계의
 *   지도 컨테이너가 `display:none` 인 채로 카카오 지도가 만들어진다. **크기 0짜리
 *   지도는 `getCenter()` 가 엉뚱한 값을 준다** — 사용자가 고른 곳과 다른 좌표가
 *   저장되는 사고다(`PlotLocationStep` 의 ResizeObserver 주석이 경고하는 바로 그것).
 *
 *   1단계에서 시작하는 것이 UX 로도 맞다. 배너가 "불러왔다" 고 알리는 순간 사용자가
 *   가장 먼저 확인해야 하는 것이 **어느 밭인가**, 곧 지도다.
 */
const SKIP_NAMES = new Set(["__step"]);

export function toDraftValues(form: FormData): DraftValues {
  const out: DraftValues = {};
  for (const [name, value] of form.entries()) {
    if (typeof value !== "string" || name === "" || SKIP_NAMES.has(name))
      continue;
    const bucket = out[name] ?? [];
    bucket.push(value);
    out[name] = bucket;
  }
  return out;
}

/**
 * 저장된 값을 폼에 되돌린다.
 *
 * ⚠️ 체크박스·라디오는 `el.checked = …` 로 **켜면 안 된다.** 그러면 React 의 onChange 가
 *   안 불린다 — `CropCards` 는 어느 작물을 골랐는지 `useState` 로도 들고 있어서(파종 라디오의
 *   `required` 와 검색 필터가 그걸 본다), DOM 만 켜면 화면은 체크돼 보이는데 상태는 빈 채가 된다.
 *   `click()` 은 브라우저가 진짜 클릭과 똑같이 처리해 onChange 까지 돈다. 그래서 원하는 상태와
 *   다를 때만 click 한다.
 * ⚠️ 위치 hidden input 은 여기서 채워도 React 가 다시 그리면 덮인다 — 지도 복원은
 *   `restoredLocation()` 쪽이 맡는다.
 */
export function applyDraft(form: HTMLFormElement, values: DraftValues): void {
  for (const [name, saved] of Object.entries(values)) {
    // 옛 저장본에 __step 이 들어 있을 수 있다. 되돌리면 지도가 숨은 채 만들어진다
    if (SKIP_NAMES.has(name)) continue;
    const els = form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      `[name="${CSS.escape(name)}"]`,
    );
    for (const el of els) {
      const toggle =
        el instanceof HTMLInputElement &&
        (el.type === "checkbox" || el.type === "radio");
      if (toggle) {
        if (el.checked !== saved.includes(el.value)) el.click();
      } else if (saved[0] !== undefined) {
        el.value = saved[0];
      }
    }
  }
}

/** 저장본을 읽는다. 깨졌거나 모양이 다르면 null — 옛 판본이 남아 있어도 안 죽는다. */
export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") return null;
    const { savedAt, values } = v as Partial<Draft>;
    if (typeof savedAt !== "string" || !values || typeof values !== "object")
      return null;
    return { savedAt, values };
  } catch {
    return null;
  }
}

/**
 * 저장본에서 지도가 되살릴 위치를 꺼낸다. 다섯 칸이 다 있어야 한다.
 *
 * 하나라도 비면 null 이다 — 반만 복원하면 "주소는 상주인데 핀은 서울" 이 되고,
 * 그건 복원을 안 하느니만 못하다. 지도를 안 고르고 나간 저장본이 여기 걸린다
 * (그때는 latitude·longitude input 이 값 없이 비어 있다).
 */
export function restoredLocation(values: DraftValues): DraftLocation | null {
  const one = (k: string) => values[k]?.[0];
  const num = (k: string) => {
    const raw = one(k);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const latitude = num("latitude");
  const longitude = num("longitude");
  const addressKo = one("addressKo");
  const regionCode = one("regionCode");
  const regionKo = one("regionKo");

  if (
    latitude === null ||
    longitude === null ||
    !addressKo ||
    !regionCode ||
    !regionKo
  ) {
    return null;
  }
  return { addressKo, latitude, longitude, regionCode, regionKo };
}

/**
 * "2시간 전" · "3일 전". 배너가 쓴다.
 *
 * `now` 를 받는 이유는 테스트가 실행 시각에 흔들리지 않게 하려는 것이다.
 * 분 단위 아래는 "방금" 으로 접는다 — 초를 보여줄 값이 없다.
 */
export function toElapsedKo(
  savedAt: string,
  now: Date = new Date(),
): string | null {
  const then = new Date(savedAt).getTime();
  if (Number.isNaN(then)) return null;

  const minutes = Math.floor((now.getTime() - then) / 60_000);
  // ⚠️ 전부 "…전" 으로 끝나야 한다. 배너가 뒤에 "에" 를 붙여 문장을 만들기 때문이다 —
  //   "방금" 을 주면 "방금에 쓰던 내용" 이 된다.
  //   음수는 기기 시계가 뒤로 간 경우다. "-3분 전" 대신 "방금 전" 으로 접는다
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

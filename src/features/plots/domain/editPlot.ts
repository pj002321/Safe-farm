/**
 * ---------------------------------------------
 * [Feature]: 텃밭 수정 폼 값 파싱 (순수 함수)
 *
 * [Description]
 * - 마이페이지의 텃밭 관리가 보내는 `FormData` 를 신뢰할 수 있는 모양으로 좁힌다.
 *   `registerPlot.ts` 와 같은 나눔 — Server Action 은 이 결과만 받아 DB 에 꽂는다.
 *
 * - ⚠️ **위경도를 받지 않는다. 일부러다.**
 *   `plots` 행에는 `grid_x`·`grid_y`(기상청 5km 격자)가 함께 들어 있고, 그 값은
 *   위경도에서 계산된다. 지도 없는 인라인 폼이 좌표를 받으면 좌표만 바뀌고 격자는
 *   그대로 남아, **엉뚱한 동네의 예보로 할 일을 만들게 된다.** RLS 로는 막을 수
 *   없는 규칙이라(`20260915120000_plots_manage.sql` 이 직접 경고한다) 아예 입력
 *   자체를 두지 않는 쪽을 골랐다. 위치를 바꾸는 일은 지도를 띄우는 화면의 몫이다.
 *   → 나중에 좌표 수정을 열려면 **격자 재계산을 같은 커밋에서** 붙일 것.
 *
 * - 고칠 수 있는 것은 **이름과 면적** 둘뿐이다. 이건 마법사 2단계가 사용자에게 한
 *   약속("나중에 바꿀 수 있습니다")의 이행이기도 하다.
 * - 면적은 등록 화면과 같은 규칙으로 평·㎡ 를 받아 ㎡ 로 통일한다. 한쪽만 다른
 *   단위를 쓰면 같은 밭이 화면마다 다른 크기가 된다.
 *
 * [Usage]
 * ```ts
 * const parsed = parsePlotEdit(formData);
 * if (!parsed.ok) throw new Error(parsed.error);
 * ```
 * ---------------------------------------------
 */

/** 등록 화면과 **같은 값**이어야 한다. 어긋나면 같은 밭 넓이가 화면마다 달라진다. */
const PYEONG_TO_M2 = 3.305785;

/** 사람이 밭에 붙일 만한 이름 길이. DB 는 text 라 제한이 없어 여기서 막는다. */
const NAME_MAX = 40;

/** 넓이 상한. 1,000만 ㎡ = 1,000ha 로, 개인 텃밭이 이 값을 넘을 일은 없다.
 *  오타(0 을 더 누른 값)를 걸러 화면이 깨지지 않게 하는 것이 목적이다. */
const AREA_MAX_M2 = 10_000_000;

export interface PlotEditInput {
  plotId: string;
  name: string | null;
  areaM2: number | null;
}

export type ParsePlotEditResult =
  | { ok: true; value: PlotEditInput }
  | { ok: false; error: string };

export function parsePlotEdit(formData: FormData): ParsePlotEditResult {
  const plotId = str(formData.get("plotId"));
  if (!plotId) {
    return { ok: false, error: "어떤 텃밭인지 알 수 없습니다." };
  }

  const name = str(formData.get("name"));
  if (name.length > NAME_MAX) {
    return { ok: false, error: `이름은 ${NAME_MAX}자까지 쓸 수 있습니다.` };
  }

  const area = toAreaM2(formData);
  if (area.ok === false) return area;

  return {
    ok: true,
    // 빈 이름은 지우겠다는 뜻이다. 빈 문자열을 넣으면 목록에서 이름이 있는 밭처럼
    // 보이므로 null 로 맞춘다(등록 화면과 같은 규칙).
    value: { plotId, name: name || null, areaM2: area.value },
  };
}

function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 빈 칸은 "모른다"(null)이고, 0 이나 음수·터무니없는 값은 오류다. */
function toAreaM2(
  formData: FormData,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const raw = str(formData.get("areaM2"));
  if (!raw) return { ok: true, value: null };

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { ok: false, error: "넓이는 0보다 큰 숫자로 적어 주세요." };
  }

  const m2 =
    formData.get("areaUnit") === "pyeong" ? parsed * PYEONG_TO_M2 : parsed;
  if (m2 > AREA_MAX_M2) {
    return { ok: false, error: "넓이가 너무 큽니다. 숫자를 확인해 주세요." };
  }

  return { ok: true, value: m2 };
}

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 등록 폼 값 파싱·검증 (순수 함수)
 *
 * [Description]
 * - `/plots/new` 는 JS 없이 동작하는 순수 HTML 폼이라 값은 항상 `FormData` 로
 *   들어온다. 여기서 신뢰할 수 있는 모양으로 좁힌다 — Server Action 은 이 결과만
 *   받아 DB 에 꽂는다.
 * - 위치(위도·경도·행정동)가 비어 있으면 등록할 수 없다. `PlotLocationStep`이
 *   지도를 못 띄웠거나(카카오 SDK 로드 실패) 사용자가 아직 위치를 고르지
 *   않은 경우다 — 둘 다 여기서 막는다.
 * - 면적은 평·㎡ 중 하나로 들어오므로 저장 전에 ㎡ 로 통일한다. 어림값이라
 *   반올림 오차는 신경 쓰지 않는다.
 * - 격자(nx, ny)는 여기서 계산하지 않는다. `features/monitoring` 의 몫이고
 *   features 끼리는 서로 import 하지 않는다(AGENTS.md) — 계산은 이 결과를 받는
 *   Server Action(app 계층)이 한다.
 *
 * [Usage]
 * ```ts
 * const parsed = parsePlotRegistration(formData);
 * if (!parsed.ok) throw new Error(parsed.error);
 * ```
 * ---------------------------------------------
 */

/** 1평 = 3.305785㎡. 저장은 ㎡ 로 하고 화면에서 다시 평으로 되돌린다. */
export const PYEONG_TO_M2 = 3.305785;

export interface PlotRegistrationInput {
  name: string | null;
  areaM2: number | null;
  latitude: number;
  longitude: number;
  addressKo: string;
  regionCode: string;
  regionKo: string;
  cropIds: number[];
  sowingDate: string | null;
  sowingUnknown: boolean;
  sowingMethod: "seed" | "seedling";
}

export type ParsePlotRegistrationResult =
  | { ok: true; value: PlotRegistrationInput }
  | { ok: false; error: string };

export function parsePlotRegistration(
  formData: FormData,
): ParsePlotRegistrationResult {
  const latitude = Number(formData.get("latitude"));
  const longitude = Number(formData.get("longitude"));
  const regionCode = str(formData.get("regionCode"));

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !regionCode
  ) {
    return { ok: false, error: "밭 위치를 먼저 지정해 주세요." };
  }

  return {
    ok: true,
    value: {
      name: str(formData.get("name")) || null,
      areaM2: toAreaM2(formData),
      latitude,
      longitude,
      addressKo: str(formData.get("addressKo")),
      regionCode,
      regionKo: str(formData.get("regionKo")),
      cropIds: formData
        .getAll("cropIds")
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0),
      sowingDate: str(formData.get("sowingDate")) || null,
      sowingUnknown: formData.get("sowingUnknown") === "1",
      sowingMethod:
        formData.get("sowingMethod") === "seedling" ? "seedling" : "seed",
    },
  };
}

export function str(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

export function toAreaM2(formData: FormData): number | null {
  const raw = Number(formData.get("areaM2"));
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return formData.get("areaUnit") === "m2" ? raw : raw * PYEONG_TO_M2;
}

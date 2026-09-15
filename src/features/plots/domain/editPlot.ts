import { str, toAreaM2 } from "./registerPlot";

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 정보 수정 폼 값 파싱·검증 (순수 함수)
 *
 * [Description]
 * - 등록(`parsePlotRegistration`)과 나누는 이유는 **고칠 수 있는 항목이 다르기**
 *   때문이다. 여기서 받는 것은 이름·면적·위치뿐이다. 작물과 파종일은 생육 계산의
 *   기준점이라 아무 때나 바꾸면 누적 GDD 가 어긋난다 — 별도 화면(생육단계 수동
 *   보정)에서 다룬다.
 * - 값 좁히기(`str`·`toAreaM2`)는 등록 쪽 것을 그대로 쓴다. 평↔㎡ 환산 상수가
 *   두 벌이 되면 한쪽만 고쳐질 수 있다.
 * - 격자(nx, ny)는 여기서 계산하지 않는다. 등록과 같은 이유다 —
 *   `features/monitoring` 은 app 계층(Server Action)이 부른다.
 *
 * [Usage]
 * ```ts
 * const parsed = parsePlotEdit(formData);
 * if (!parsed.ok) throw new Error(parsed.error);
 * ```
 * ---------------------------------------------
 */

export interface PlotEditInput {
  name: string | null;
  areaM2: number | null;
  latitude: number;
  longitude: number;
  addressKo: string;
  regionCode: string;
  regionKo: string;
}

export type ParsePlotEditResult =
  | { ok: true; value: PlotEditInput }
  | { ok: false; error: string };

export function parsePlotEdit(formData: FormData): ParsePlotEditResult {
  const latitude = Number(formData.get("latitude"));
  const longitude = Number(formData.get("longitude"));
  const regionCode = str(formData.get("regionCode"));

  // 수정 폼도 지도를 다시 띄우므로 위치는 항상 실려 온다. 비어 있다면 지도가
  // 못 떴다는 뜻이고, 그대로 저장하면 멀쩡하던 좌표가 0 으로 덮인다.
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !regionCode) {
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
    },
  };
}

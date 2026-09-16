import { str, toAreaM2 } from "./registerPlot";

/**
 * ---------------------------------------------
 * [Feature]: 텃밭 정보 수정 폼 값 파싱 (순수 함수)
 *
 * [Description]
 * - 등록(`parsePlotRegistration`)과 나누는 이유는 **고칠 수 있는 항목이 다르기**
 *   때문이다. 여기서 받는 것은 이름과 면적뿐이다.
 * - 위치는 수정하지 않는다. 좌표가 바뀌면 격자(nx, ny)가 바뀌고, 그 격자로 쌓아
 *   온 기후·위성 관측 이력이 같은 밭의 기록이 아니게 된다. 옮긴 밭은 새로 등록한다.
 * - 작물과 파종일도 받지 않는다. 생육 계산의 기준점이라 아무 때나 바꾸면 누적
 *   GDD 가 어긋난다 — 별도 화면(생육단계 수동 보정)에서 다룬다.
 * - 값 좁히기(`str`·`toAreaM2`)는 등록 쪽 것을 그대로 쓴다. 평↔㎡ 환산 상수가
 *   두 벌이 되면 한쪽만 고쳐질 수 있다.
 *
 * [Usage]
 * ```ts
 * const input = parsePlotEdit(formData);
 * ```
 * ---------------------------------------------
 */

export interface PlotEditInput {
  name: string | null;
  areaM2: number | null;
}

/**
 * 폼에 위치 값이 실려 와도 무시한다. 수정할 수 있는 항목만 꺼내므로
 * 거절할 입력이 없다 — 등록과 달리 결과를 판별 유니온으로 감싸지 않는다.
 */
export function parsePlotEdit(formData: FormData): PlotEditInput {
  return {
    name: str(formData.get("name")) || null,
    areaM2: toAreaM2(formData),
  };
}

import { z } from "zod";

/**
 * ---------------------------------------------
 * [Feature]: 농지 입력 검증
 *
 * [Description]
 * - 순수 검증 로직. 여기가 테스트 대상이다.
 * - 스키마는 **모양**만 본다. "이 밭이 내 것인가"는 스키마가 못 잡으므로
 *   소유권 확인은 server/mutations.ts 에서 별도로 한다.
 * - 좌표 범위는 대한민국 육상 대략값. 오타로 위경도가 뒤바뀐 입력을 잡는다.
 * ---------------------------------------------
 */

export const KOREA_BOUNDS = {
  lat: [33.0, 38.7],
  lng: [124.5, 132.0],
} as const;

export const createFieldSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력하세요").max(50, "50자 이내"),
  areaM2: z
    .number()
    .positive("면적은 0보다 커야 합니다")
    .max(10_000_000, "면적이 비정상적으로 큽니다"),
  lat: z
    .number()
    .min(KOREA_BOUNDS.lat[0], "위도가 국내 범위를 벗어납니다")
    .max(KOREA_BOUNDS.lat[1], "위도가 국내 범위를 벗어납니다"),
  lng: z
    .number()
    .min(KOREA_BOUNDS.lng[0], "경도가 국내 범위를 벗어납니다")
    .max(KOREA_BOUNDS.lng[1], "경도가 국내 범위를 벗어납니다"),
});

export type CreateFieldInput = z.infer<typeof createFieldSchema>;

/** 제곱미터를 평으로. 농민은 평 단위로 말한다. */
export function toPyeong(areaM2: number): number {
  return Math.round(areaM2 / 3.3058);
}

import { describe, expect, it } from "vitest";
import { createFieldSchema, toPyeong } from "./validate";

const valid = { name: "남쪽 밭", areaM2: 3300, lat: 36.5, lng: 127.5 };

describe("createFieldSchema", () => {
  it("정상 입력을 통과시킨다", () => {
    expect(createFieldSchema.safeParse(valid).success).toBe(true);
  });

  it("이름의 앞뒤 공백을 제거하고, 공백뿐이면 거부한다", () => {
    expect(createFieldSchema.parse({ ...valid, name: "  밭  " }).name).toBe(
      "밭",
    );
    expect(createFieldSchema.safeParse({ ...valid, name: "   " }).success).toBe(
      false,
    );
  });

  it("면적 0 이하를 거부한다", () => {
    expect(createFieldSchema.safeParse({ ...valid, areaM2: 0 }).success).toBe(
      false,
    );
    expect(createFieldSchema.safeParse({ ...valid, areaM2: -1 }).success).toBe(
      false,
    );
  });

  it("위경도가 뒤바뀐 입력을 잡는다", () => {
    // lat/lng 를 서로 바꿔 넣으면 둘 다 범위 밖이 된다
    const swapped = { ...valid, lat: valid.lng, lng: valid.lat };
    expect(createFieldSchema.safeParse(swapped).success).toBe(false);
  });

  it("국내 범위 경계값은 통과한다", () => {
    expect(
      createFieldSchema.safeParse({ ...valid, lat: 33.0, lng: 124.5 }).success,
    ).toBe(true);
    expect(
      createFieldSchema.safeParse({ ...valid, lat: 38.7, lng: 132.0 }).success,
    ).toBe(true);
  });
});

describe("toPyeong", () => {
  it("제곱미터를 평으로 반올림한다", () => {
    expect(toPyeong(3.3058)).toBe(1);
    expect(toPyeong(3300)).toBe(998);
  });
});

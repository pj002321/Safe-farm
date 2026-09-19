import { describe, expect, it } from "vitest";
import {
  describeNdmiTrend,
  describeNdvi,
  isRipeningStage,
  NDMI_MAX_GAP_DAYS,
  NDMI_STEP,
  NDVI_DENSE,
  NDVI_GROWING,
  NDVI_NONE,
  NDVI_SPARSE,
} from "./vegetationText";

/**
 * ⚠ 임계값 숫자를 여기 베끼지 않는다. 모듈에서 가져와 그 언저리로 만든다 —
 *   값을 고칠 때 테스트가 같이 따라오게 하려는 것이다.
 * ⚠ ai-service 의 `vegetation_text.py` 와 **같은 문장**이 나와야 한다.
 *   한쪽만 고치면 차트와 리포트가 같은 밭을 두고 다른 말을 한다.
 */

describe("describeNdvi — 절대 기준", () => {
  it("실측값이 실제 상태와 맞는 말로 나온다", () => {
    // 2026-09-19 전남 밭 3곳. 이 순서가 어긋나면 기준이 틀린 것이다
    expect(describeNdvi(0.787)).toContain("빽빽"); // 벼 자라는 중
    expect(describeNdvi(0.537)).toContain("한창"); // 양파 심은 지 얼마
    expect(describeNdvi(0.27)).toContain("성기"); // 참깨 추수 후 맨땅
    expect(describeNdvi(-0.151)).toContain("안 보여요"); // 좌표가 밭이 아님
  });

  it("음수는 밭 위치를 의심하게 한다", () => {
    // 물·건물·아스팔트면 음수다. 좌표 오입력을 화면이 스스로 알려 주는 자리다
    expect(describeNdvi(-0.35)).toContain("밭 위치");
  });

  it("경계값은 위쪽 칸에 든다", () => {
    expect(describeNdvi(NDVI_DENSE)).toContain("빽빽");
    expect(describeNdvi(NDVI_DENSE - 0.001)).toContain("한창");
    expect(describeNdvi(NDVI_GROWING)).toContain("한창");
    expect(describeNdvi(NDVI_GROWING - 0.001)).toContain("성기");
    expect(describeNdvi(NDVI_SPARSE)).toContain("성기");
    expect(describeNdvi(NDVI_SPARSE - 0.001)).toContain("거의 없어요");
    expect(describeNdvi(NDVI_NONE)).toContain("거의 없어요");
    expect(describeNdvi(NDVI_NONE - 0.001)).toContain("안 보여요");
  });

  it("값이 없으면 아무 말도 안 한다", () => {
    expect(describeNdvi(null)).toBeNull();
    expect(describeNdvi(undefined)).toBeNull();
    expect(describeNdvi(Number.NaN)).toBeNull();
  });

  it("숫자를 문장에 넣지 않는다", () => {
    // 0.787 은 차트가 보여 준다. 문장은 뜻만 말한다
    for (const v of [0.787, 0.27, -0.15]) {
      expect(describeNdvi(v)).not.toContain("0.");
    }
  });
});

describe("describeNdmiTrend — 변화만", () => {
  it("견줄 것이 없으면 침묵한다", () => {
    // 관측이 평균 18일에 한 번이라 하나뿐인 날이 흔하다
    expect(describeNdmiTrend(0.344, null)).toBeNull();
    expect(describeNdmiTrend(0.344, undefined)).toBeNull();
    expect(describeNdmiTrend(null, 0.423)).toBeNull();
  });

  it("줄었으면 줄었다고 한다", () => {
    expect(describeNdmiTrend(0.344, 0.423)).toContain("줄었");
  });

  it("늘었으면 늘었다고 한다", () => {
    expect(describeNdmiTrend(0.473, 0.394)).toContain("늘었");
  });

  it("임계 미만의 움직임은 비슷으로 본다", () => {
    // 반폭이 조금 달라진 것과 구분되지 않는 크기다(실측 폭 0.02~0.09)
    expect(describeNdmiTrend(0.4, 0.4 + NDMI_STEP * 0.9)).toContain("비슷");
    expect(describeNdmiTrend(0.4, 0.4 - NDMI_STEP * 0.9)).toContain("비슷");
  });

  it("익어 가는 중이면 정상이라고 말해 준다", () => {
    // 사용자의 논이 실제로 그랬다 — 물을 뺀 뒤 0.423 → 0.344 인데 10월 추수 정상
    const say = describeNdmiTrend(0.344, 0.423, { isRipening: true });
    expect(say).toContain("자연스러운");
    expect(say).not.toContain("줄었"); // 걱정하게 만드는 말을 안 쓴다
  });

  it("익어 가도 늘어난 것은 그대로 말한다", () => {
    // isRipening 은 **내림**에만 단서를 붙인다. 오름까지 뭉개면 사실이 아니다
    expect(describeNdmiTrend(0.473, 0.394, { isRipening: true })).toContain(
      "늘었",
    );
  });

  it("너무 벌어진 관측은 견주지 않는다", () => {
    // 한 달 전과 견주는 것은 계절이 바뀐 것을 마름으로 읽는 일이다
    expect(
      describeNdmiTrend(0.344, 0.423, { gapDays: NDMI_MAX_GAP_DAYS + 1 }),
    ).toBeNull();
    expect(
      describeNdmiTrend(0.344, 0.423, { gapDays: NDMI_MAX_GAP_DAYS }),
    ).not.toBeNull();
  });

  it("단정하는 말을 쓰지 않는다", () => {
    // 위성은 잎을 보지 뿌리도 흙도 못 본다
    const says = [
      describeNdmiTrend(0.344, 0.423),
      describeNdmiTrend(0.344, 0.423, { isRipening: true }),
      describeNdmiTrend(0.473, 0.394),
    ];
    for (const say of says) {
      for (const banned of ["말랐", "부족", "위험", "가뭄"]) {
        expect(say).not.toContain(banned);
      }
    }
  });
});

describe("isRipeningStage", () => {
  it("수확·성숙 계열을 알아본다", () => {
    for (const name of [
      "수확",
      "붉은고추 수확",
      "성숙기",
      "등숙기",
      "황숙기",
      "익음때",
    ]) {
      expect(isRipeningStage(name)).toBe(true);
    }
  });

  it("자라는 단계는 아니다", () => {
    for (const name of ["아주심기", "생육기", "결구기", "씨뿌림", "월동기"]) {
      expect(isRipeningStage(name)).toBe(false);
    }
  });

  it("단계를 모르면 거짓이다", () => {
    // 모름을 '정상' 으로 읽지 않는다
    expect(isRipeningStage(null)).toBe(false);
    expect(isRipeningStage(undefined)).toBe(false);
    expect(isRipeningStage("")).toBe(false);
  });
});

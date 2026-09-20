import { describe, expect, it } from "vitest";
import type { TaskAdvice } from "@/shared/growth/taskAdvice";
import { type DoneMark, hideDoneToday } from "./doneTasks";

const TODAY = "2026-09-20";

function task(titleKo: string): TaskAdvice {
  return { id: titleKo, titleKo, whyKo: "그럴 때다", tone: "info" };
}

function done(bodyKo: string, occurredOn = TODAY): DoneMark {
  return { kind: "TASK_DONE", occurredOn, bodyKo };
}

describe("hideDoneToday", () => {
  it("오늘 누른 카드를 목록에서 뺀다", () => {
    const left = hideDoneToday(
      [task("김매기"), task("웃거름 주기")],
      [done("김매기")],
      TODAY,
    );

    expect(left.map((t) => t.titleKo)).toEqual(["웃거름 주기"]);
  });

  it("어제 누른 것으로는 안 뺀다 — 물주기는 날마다 다시 해야 한다", () => {
    const left = hideDoneToday(
      [task("겉흙이 마르지 않게 자주 조금씩 물주기")],
      [done("겉흙이 마르지 않게 자주 조금씩 물주기", "2026-09-19")],
      TODAY,
    );

    expect(left).toHaveLength(1);
  });

  it("다른 종류의 기록은 카드를 안 뺀다", () => {
    const left = hideDoneToday(
      [task("김매기")],
      [{ kind: "NOTE", occurredOn: TODAY, bodyKo: "김매기" }],
      TODAY,
    );

    expect(left).toHaveLength(1);
  });

  it("저장할 때 100자로 잘린 제목도 같은 카드로 본다", () => {
    const long = `${"가".repeat(100)}나나나`;
    const left = hideDoneToday([task(long)], [done(long.slice(0, 100))], TODAY);

    expect(left).toHaveLength(0);
  });

  it("누른 것이 없으면 목록을 그대로 돌려준다", () => {
    const tasks = [task("김매기")];
    expect(hideDoneToday(tasks, [], TODAY)).toBe(tasks);
  });
});

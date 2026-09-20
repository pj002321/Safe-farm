import { describe, expect, it } from "vitest";
import type { TaskAdvice } from "@/shared/growth/taskAdvice";
import {
  pickedFromQuery,
  pickedHref,
  pickedToQuery,
  taskNoteField,
  withoutPicked,
  withPicked,
} from "./pickedTasks";

function task(titleKo: string): TaskAdvice {
  return { id: titleKo, titleKo, whyKo: "그럴 때다", tone: "info" };
}

const TASKS = [task("물주기"), task("김매기"), task("웃거름 주기")];

describe("pickedFromQuery", () => {
  it("쉼표로 가른다", () => {
    expect(pickedFromQuery("물주기,김매기", TASKS)).toEqual([
      "물주기",
      "김매기",
    ]);
  });

  it("지금 뜨는 카드에 없는 제목은 버린다 — 주소창을 고쳐도 안 들어온다", () => {
    expect(pickedFromQuery("물주기,없는작업", TASKS)).toEqual(["물주기"]);
  });

  it("같은 것을 두 번 담지 않는다", () => {
    expect(pickedFromQuery("물주기,물주기", TASKS)).toEqual(["물주기"]);
  });

  it("앞뒤 공백을 턴다", () => {
    expect(pickedFromQuery(" 물주기 , 김매기 ", TASKS)).toEqual([
      "물주기",
      "김매기",
    ]);
  });

  it("비었거나 없으면 빈 목록", () => {
    expect(pickedFromQuery(undefined, TASKS)).toEqual([]);
    expect(pickedFromQuery("", TASKS)).toEqual([]);
  });

  it("목록을 모르면(null) 거르지 않는다 — 서버 장애에 담은 게 날아가면 안 된다", () => {
    expect(pickedFromQuery("물주기,없는작업", null)).toEqual([
      "물주기",
      "없는작업",
    ]);
  });

  it("목록이 비면(빈 배열) 전부 버린다 — 그건 아는 상태다", () => {
    expect(pickedFromQuery("물주기", [])).toEqual([]);
  });

  it("빈 조각은 목록을 몰라도 버린다", () => {
    expect(pickedFromQuery("물주기,,  ,김매기", null)).toEqual([
      "물주기",
      "김매기",
    ]);
  });

  it("쿼리가 여러 번 붙어 배열로 와도 첫 것만 본다", () => {
    expect(pickedFromQuery(["물주기", "김매기"], TASKS)).toEqual(["물주기"]);
  });
});

describe("pickedToQuery", () => {
  it("빈 목록이면 null — 그때는 picked 를 안 붙인다", () => {
    expect(pickedToQuery([])).toBeNull();
  });

  it("쉼표로 잇는다", () => {
    expect(pickedToQuery(["물주기", "김매기"])).toBe("물주기,김매기");
  });
});

describe("withPicked · withoutPicked", () => {
  it("담고 뺀다", () => {
    expect(withPicked(["물주기"], "김매기")).toEqual(["물주기", "김매기"]);
    expect(withoutPicked(["물주기", "김매기"], "물주기")).toEqual(["김매기"]);
  });

  it("이미 담긴 것을 또 담아도 안 늘어난다", () => {
    expect(withPicked(["물주기"], "물주기")).toEqual(["물주기"]);
  });

  it("없는 것을 빼도 그대로", () => {
    expect(withoutPicked(["물주기"], "김매기")).toEqual(["물주기"]);
  });
});

describe("taskNoteField", () => {
  it("제목을 이름에 박는다 — 자리로 매기면 목록이 바뀔 때 메모가 딴 카드에 붙는다", () => {
    expect(taskNoteField("물주기")).toBe("taskNote:물주기");
  });
});

describe("pickedHref", () => {
  it("쿼리만 적은 상대 주소 — 경로를 들고 다니지 않는다", () => {
    expect(pickedHref(["물주기", "김매기"])).toBe(
      `?picked=${encodeURIComponent("물주기,김매기")}`,
    );
  });

  it("비면 ? 하나", () => {
    expect(pickedHref([])).toBe("?");
  });
});

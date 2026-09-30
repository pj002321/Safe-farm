import { describe, expect, it } from "vitest";
import { cropIssues } from "./cropAudit";

describe("cropIssues", () => {
    it("온전한 작물은 결함이 없다", () => {
        expect(
            cropIssues({
                baseTemp: 10,
                variants: [
                    { maturityType: "MID", gddTarget: 800, stageGddTos: [300,800]},
                ],
            }),
        ).toEqual([]);
    });

    it("빈 칸과 어긋난 끝을 모두 짚는다", () => {
        expect(
            cropIssues({
                baseTemp: null,
                variants: [
                    { maturityType: "MID", gddTarget: 900, stageGddTos: [300,800]},
                    { maturityType: "LATE", gddTarget: null, stageGddTos: []},
                ],
            }),
        ).toEqual([
            "기준온도 없음",
            "MID 목표 GDD != 마지막 단계",
            "LATE 목표 GDD 없음",
            "LATE 단계 없음",
        ]);
    });

    it("품종이 없으면 그것만 짚는다", () => {
        expect(cropIssues({baseTemp: 5, variants: []})).toEqual(["품종 없음"]);
    });
});

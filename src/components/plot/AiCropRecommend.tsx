"use client";

import { useRef, useState } from "react";
import { recommendCrops } from "@/app/(app)/plots/new/actions";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import type {
  CropRecommendation,
  RecommendResult,
} from "@/shared/aiService/client";

/**
 * ---------------------------------------------
 * [Feature]: 3단계 AI 작물 추천 (V1-51)
 *
 * [Description]
 * - **`CropCards` 와 별개다.** 선택은 여전히 체크박스가 한다 — 이 패널은 참고용
 *   순위만 보여준다. 지우거나 실패해도 작물 선택 자체는 그대로 동작해야 한다.
 * - 좌표는 **버튼을 누르는 순간 폼에서 읽는다.** 1단계(`PlotLocationStep`)가
 *   지도 중심을 hidden input(latitude/longitude)에 채워 두므로, 마법사가
 *   패널을 숨긴 동안에도 DOM 에는 값이 남아 있다(page.tsx 주석 참고) — 새
 *   상태 공유 없이 같은 폼을 읽기만 하면 된다.
 * - `recommendCrops` 는 실패·후보 없음·좌표 미선택을 전부 null 로 뭉갠다.
 *   여기서는 "좌표 미선택"만 따로 안내한다 — 사용자가 지금 당장 고칠 수
 *   있는 것은 그것뿐이다.
 *
 * [Usage]
 * ```tsx
 * <AiCropRecommend />
 * ```
 * ---------------------------------------------
 */

const GRADE_LABEL: Record<CropRecommendation["grade"], string> = {
  good: "적합",
  caution: "주의",
  unsuitable: "부적합",
};

const RISK_LABEL: Record<string, string> = {
  frost: "저온 피해",
  heat: "고온 피해",
};

export function AiCropRecommend() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [needsLocation, setNeedsLocation] = useState(false);
  const [result, setResult] = useState<RecommendResult | null>(null);

  async function handleClick() {
    const form = buttonRef.current?.form;
    const lat = Number(form && new FormData(form).get("latitude"));
    const lon = Number(form && new FormData(form).get("longitude"));
    if (!lat || !lon) {
      setNeedsLocation(true);
      setResult(null);
      return;
    }

    setNeedsLocation(false);
    setIsLoading(true);
    const data = await recommendCrops(lat, lon);
    setResult(data ?? { ranked: [], explanation: null });
    setIsLoading(false);
  }

  return (
    <Card title="AI 작물 추천" tone="accent">
      <p className="text-fg-muted text-sm">
        지정한 위치의 최근 기상과 작물 마스터 데이터를 근거로 지금 심기 좋은
        작물 순위를 매깁니다. 선택은 아래 카드에서 직접 해 주세요.
      </p>
      <button
        className="mt-3 inline-flex min-h-9 items-center rounded-md border border-accent bg-accent-subtle px-3.5 font-medium text-accent text-sm transition-colors duration-200 ease-out-expo hover:bg-accent/20 disabled:opacity-50"
        disabled={isLoading}
        onClick={handleClick}
        ref={buttonRef}
        type="button"
      >
        {isLoading ? "분석 중…" : "AI 추천 받기"}
      </button>

      {needsLocation && (
        <p className="mt-2 text-caution text-sm">
          1단계에서 위치를 먼저 지정해 주세요.
        </p>
      )}

      {result && result.ranked.length === 0 && (
        <p className="mt-2 text-fg-muted text-sm">
          지금은 추천할 작물을 찾지 못했습니다.
        </p>
      )}

      {result && result.ranked.length > 0 && (
        <>
          <ul className="mt-3 space-y-2">
            {result.ranked.slice(0, 5).map((crop) => (
              <li
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                key={crop.cropId}
              >
                <span className="font-medium text-fg text-sm">
                  {crop.nameKo}
                </span>
                <span className="flex items-center gap-2">
                  {crop.risks.map((risk) => (
                    <Badge key={risk} size="sm" tone="caution">
                      {RISK_LABEL[risk] ?? risk}
                    </Badge>
                  ))}
                  <Badge size="sm" tone={crop.grade}>
                    {GRADE_LABEL[crop.grade]} · {crop.score}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
          {result.explanation && (
            <p className="mt-3 text-fg-muted text-sm leading-relaxed">
              {result.explanation}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

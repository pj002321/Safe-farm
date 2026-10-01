import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { aiService } from "@/shared/aiService/client";
import { requireAdminOrRedirect } from "@/shared/auth/adminSession";

/**
 * ---------------------------------------------
 * [Feature]: 예측 정확도  →  /admin/accuracy   (V1-117~119)
 *
 * [Description]
 * - 정답은 사용자가 재배 화면에서 고친 생육단계(`cultivation_events` 의 STAGE_SET)다.
 *   그 날까지의 관측으로 GDD 모델이 냈을 단계를 ai-service 가 다시 계산해 비교한다
 *   (`ai-service/app/service/stage_accuracy.py`). 오차 단위는 **단계 칸 수**다.
 * - 모델이 GDD 하나뿐이라 모델 간 비교(V1-117)는 아직 한 줄이다. 다른 모델을 붙이면
 *   같은 보정 기록으로 MAE 를 나란히 낸다.
 * - 파종일이 없거나 그날까지 관측이 없는 보정은 오차에서 뺀다 — 빼지 않으면 모델 탓이
 *   아닌 오차가 섞인다. 뺀 이유는 이력에 그대로 적는다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "예측 정확도" };

export const dynamic = "force-dynamic";

const KIND = { STAGE_SET: "단계 보정", STAGE_ADD: "단계 추가" } as const;

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card title={label}>
      <span className="font-mono text-2xl tabular-nums">{value}</span>
    </Card>
  );
}

export default async function AdminAccuracy() {
  await requireAdminOrRedirect();
  const result = await aiService.stageAccuracy();

  return (
    <AdminPage
      descriptionKo="생육 단계 예측이 실제와 얼마나 어긋났는지를 보는 자리입니다. 정답은 사용자가 고친 단계입니다."
      titleKo="예측 정확도"
    >
      {!result.ok ? (
        <Card>
          <p className="text-sm text-unsuitable">
            ai-service 에서 못 읽었습니다: {result.detail ?? result.reason}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric
              label="GDD 모델 MAE (단계)"
              value={result.data.summary.mae ?? "—"}
            />
            <Metric
              label="치우침 (음수 = 늦게 봄)"
              value={result.data.summary.bias ?? "—"}
            />
            <Metric label="비교한 보정" value={result.data.summary.n} />
            <Metric label="제외한 보정" value={result.data.summary.excluded} />
          </div>

          <Card title="단계별 오차">
            {result.data.summary.byStage.length === 0 ? (
              <p className="text-fg-muted text-sm">
                오차를 잴 수 있는 보정이 아직 없습니다. 파종일이 있는 재배에서
                사용자가 단계를 고치면 쌓입니다.
              </p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm">
                {result.data.summary.byStage.map((s) => (
                  <li className="flex gap-3" key={s.stage}>
                    <span className="w-28 shrink-0">{s.stage}</span>
                    <span className="font-mono tabular-nums">MAE {s.mae}</span>
                    <span className="text-fg-muted">{s.n}건</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="사용자 보정 이력">
            {result.data.history.length === 0 ? (
              <p className="text-fg-muted text-sm">보정 기록이 없습니다.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {result.data.history.map((h) => (
                  <li
                    className="flex flex-wrap items-baseline gap-2"
                    key={`${h.createdAt}-${h.kind}`}
                  >
                    <Badge
                      size="sm"
                      tone={h.kind === "STAGE_SET" ? "info" : "neutral"}
                    >
                      {KIND[h.kind]}
                    </Badge>
                    <span className="font-mono text-fg-muted text-xs tabular-nums">
                      {h.occurredOn}
                    </span>
                    <span>실제 {h.actual ?? "—"}</span>
                    {h.kind === "STAGE_SET" && (
                      <span className="text-fg-muted">
                        · 모델 {h.predicted ?? "예측 없음"}
                        {h.error != null &&
                          ` (${h.error > 0 ? "+" : ""}${h.error}단계)`}
                      </span>
                    )}
                    {h.note && (
                      <span className="text-fg-subtle text-xs">{h.note}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </AdminPage>
  );
}

import type { Metadata } from "next";
import { AdminPage } from "@/components/admin/AdminPage";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
import { listCropMaster } from "@/features/admin/cropMasterStore";
import { requireAdminOrRedirect } from "@/shared/auth/adminSession";
import { MATURITY_LABEL_KO, toMaturityType } from "@/shared/growth/maturity";
/**
 * ---------------------------------------------
 * [Feature]: 작물 마스터  →  /admin/crops   (V1-108~110)
 *
 * [Description]
 * - **읽기 전용이다.** 이 테이블들은 `safefarm-crop-data` 의 CSV 로 시딩되어, 여기서
 *   고치면 다음 시딩이 덮어쓴다. 화면의 일은 결함(기준온도·목표 GDD·단계 누락)을
 *   짚는 것이고, 고치는 곳은 CSV 다.
 * - 결함 있는 작물을 위로 올린다. 133개를 훑지 않아도 손볼 곳이 먼저 보인다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "작물 마스터" };
export const dynamic = "force-dynamic";

const maturityKo = (value: string) => {
  const type = toMaturityType(value);
  return type ? MATURITY_LABEL_KO[type] : value;
};

const orDash = (v: number | null) => (v === null ? "—" : v);

export default async function AdminCrops() {
  await requireAdminOrRedirect();
  const crops = await listCropMaster();
  const sorted = [...crops].sort((a, b) => b.issues.length - a.issues.length);
  const broken = crops.filter((c) => c.issues.length > 0).length;

  return (
    <AdminPage
      descriptionKo="작물별 기준온도 · 품종별 목표 GDD · 단계 수와 빠진 값을 봅니다. 수정은 CSV 시딩으로 합니다."
      titleKo="작물 마스터"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Card title="작물">
          <span className="font-mono text-2xl tabular-nums">
            {crops.length}
          </span>
        </Card>
        <Card title="결함 있는 작물">
          <span className="font-mono text-2xl text-unsuitable tabular-nums">
            {broken}
          </span>
        </Card>
      </div>

      <Card padding="sm" tone="elevated">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">작물 마스터와 결함 목록</caption>
            <thead>
              <tr className="border-border border-b text-fg-muted text-xs">
                <th className="px-3 py-2 text-left font-medium" scope="col">
                  작물
                </th>
                <th className="px-3 py-2 text-right font-medium" scope="col">
                  기준/상한 ℃
                </th>
                <th className="px-3 py-2 text-left font-medium" scope="col">
                  품종 (목표 GDD · 단계 수)
                </th>
                <th className="px-3 py-2 text-left font-medium" scope="col">
                  결함
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((crop) => (
                <tr
                  className="border-border/60 border-b last:border-0"
                  key={crop.cropId}
                >
                  <th className="px-3 py-2.5 text-left font-normal" scope="row">
                    {crop.nameKo}
                  </th>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                    {orDash(crop.baseTemp)} / {orDash(crop.upperTemp)}
                  </td>
                  <td className="px-3 py-2.5">
                    {crop.variants.map((v) => (
                      <div key={v.maturityType}>
                        {maturityKo(v.maturityType)}{" "}
                        <span className="font-mono text-fg-muted tabular-nums">
                          {orDash(v.gddTarget)} · {v.stages}
                        </span>
                      </div>
                    ))}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {crop.issues.map((issue) => (
                        <Badge key={issue} size="sm" tone="unsuitable">
                          {issue}
                        </Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </AdminPage>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { MapWorkspace } from "@/components/map/MapWorkspace";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { listPlots } from "@/features/plots/plotStore";
import { getCurrentProfile } from "@/shared/auth/profileStore";

/**
 * ---------------------------------------------
 * [Feature]: 지도  →  /map
 *
 * [Description]
 * - **지도가 한 장이다.** 예전에는 텃밭 마커 지도와 시군구 레이어 지도를 세로로
 *   쌓고 큰 제목을 두 번 썼다. 앱의 다른 페이지는 전부 제목이 하나인데 여기만
 *   둘이었고, 무엇보다 지도 두 개가 모바일에서 스크롤을 두 번 가로챘다.
 *   합친 이유는 `MapWorkspace` 에 적어 두었다.
 * - **GDD 설명을 접어 둔다.** 108자짜리 정의가 제목 바로 아래 있어서 375px 에서
 *   여섯 줄을 먹었다 — 지도를 보러 온 사람이 매번 그 벽을 넘어야 했다. 뜻이
 *   궁금한 사람만 펴 보면 되는 정보라 `<details>` 로 내린다(JS 없이 동작한다).
 * - 밭이 없어도 지도는 보여준다. 전국 관측은 밭 등록과 무관한 정보이고,
 *   등록을 권하는 줄은 지도를 밀어내지 않도록 얇게 위에 둔다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "지도" };

export default async function Page() {
  const profile = await getCurrentProfile();
  const plots = profile ? await listPlots(profile.id) : [];

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6 sm:py-8">
      <SectionHeading
        description="등록한 밭과 그 지역의 관측을 한 지도에서 봅니다."
        title="지도"
      />

      {plots.length === 0 && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border border-dashed px-4 py-3 text-fg-muted text-sm">
          텃밭을 등록하시면 이 지도에 밭 위치와 생육 단계가 함께 표시됩니다.
          <Link
            className="font-medium text-accent underline underline-offset-2"
            href="/plots/new"
          >
            텃밭 등록하기
          </Link>
        </p>
      )}

      <MapWorkspace points={plots} />

      <details className="rounded-lg border border-border px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-fg">
          생육 기상(GDD)이 무엇인가요?
        </summary>
        <p className="mt-2 text-fg-muted leading-relaxed">
          GDD(생육적산온도)는 하루 평균기온에서 기준온도(5℃)를 뺀 값을 심은
          날부터 더해 온 값입니다. 작물은 달력이 아니라 쌓인 온기에 따라 자라기
          때문에, 같은 날 심어도 따뜻한 해에는 더 빨리 자랍니다. 지도의 색은
          시군구별 올해 누적 GDD 가{" "}
          <strong className="text-fg">평년 대비</strong> 얼마나 높고 낮은지를
          나타냅니다.
        </p>
      </details>
    </main>
  );
}

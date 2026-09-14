import type { Metadata } from "next";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { SuitabilityCard } from "@/components/recommendation/SuitabilityCard";
import { Card } from "@/components/shared/Card";
import {
  type CropProfile,
  rankCrops,
} from "@/features/recommendation/domain/suitability";
import { displayNameOf } from "@/shared/auth/profile";
import { getCurrentProfile } from "@/shared/auth/profileStore";
import { getViewer } from "@/shared/auth/session";
import { formatRainfall, formatTemperature } from "@/shared/utils/format";

/**
 * ---------------------------------------------
 * [Feature]: 앱 홈(대시보드)  →  /dashboard
 *
 * [Description]
 * - 로그인한 사용자의 첫 화면. `/` 는 공개 랜딩이 가져갔으므로 여기로 내려왔다.
 *   미로그인 차단은 이 파일이 아니라 proxy 가 한다(경로가 PUBLIC 목록에 없으면 차단).
 * - `getViewer()`(JWT)와 `getCurrentProfile()`(DB)을 둘 다 쓴다. 역할이 다르다 —
 *   권한 분기는 왕복 없는 클레임으로, 이름 같은 표시값은 프로필로 읽는다.
 * - 프로필은 **null 일 수 있다.** 세션 라우트가 프로필 쓰기에 실패해도 로그인은
 *   통과시키기 때문이다(신원 확인은 이미 끝났다). 그때도 화면이 비지 않게
 *   이름을 생략한다.
 * - 로그아웃은 `SignOutButton` 이 맡는다. 서버 쿠키만 지우면 브라우저 SDK 는
 *   여전히 로그인 상태라, 양쪽을 함께 끊는 일은 클라이언트에서만 가능하다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "대시보드" };

/** 샘플 데이터. DB 연결 전까지 화면 확인용 — 연결되면 조회로 교체한다. */
const SAMPLE_CROPS: CropProfile[] = [
  {
    id: "tomato",
    nameKo: "토마토",
    tempRangeC: [18, 27],
    rainfallRangeMm: [40, 120],
    minSunshineHours: 6,
  },
  {
    id: "rice",
    nameKo: "벼",
    tempRangeC: [20, 30],
    rainfallRangeMm: [150, 400],
    minSunshineHours: 5,
  },
  {
    id: "lettuce",
    nameKo: "상추",
    tempRangeC: [15, 22],
    rainfallRangeMm: [30, 90],
    minSunshineHours: 4,
  },
];
const SAMPLE_WEATHER = { avgTempC: 24.3, rainfallMm: 72, sunshineHours: 6.5 };

export default async function DashboardPage() {
  // 서로 독립적인 두 조회라 순차로 기다릴 이유가 없다.
  const [viewer, profile] = await Promise.all([
    getViewer(),
    getCurrentProfile(),
  ]);
  const ranked = rankCrops(SAMPLE_CROPS, SAMPLE_WEATHER);
  const nameOf = (id: string) =>
    SAMPLE_CROPS.find((c) => c.id === id)?.nameKo ?? id;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">
          {profile ? `${displayNameOf(profile)}님의 밭` : "내 밭"}
        </h1>
        <p className="mt-2 text-fg-muted">
          농작물 상태와 날씨를 읽어 재배 적합도를 추천합니다.
        </p>
      </div>

      {viewer?.isAdmin && (
        <Card tone="accent">
          관리자 계정입니다. 상단 <b>관리자</b> 메뉴에서 전체 현황을 볼 수
          있습니다.
        </Card>
      )}

      <Card title="이번 주 기상">
        기온 {formatTemperature(SAMPLE_WEATHER.avgTempC)} · 강수{" "}
        {formatRainfall(SAMPLE_WEATHER.rainfallMm)} · 일조{" "}
        {SAMPLE_WEATHER.sunshineHours}시간
      </Card>

      <div className="flex flex-col gap-3">
        {ranked.map((result) => (
          <SuitabilityCard
            key={result.cropId}
            cropName={nameOf(result.cropId)}
            result={result}
          />
        ))}
      </div>

      <SignOutButton />
    </main>
  );
}

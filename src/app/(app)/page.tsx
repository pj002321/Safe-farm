import { logout } from "@/app/login/actions";
import { SuitabilityCard } from "@/components/recommendation/SuitabilityCard";
import { Button } from "@/components/shared/Button";
import { Card } from "@/components/shared/Card";
import {
  type CropProfile,
  rankCrops,
} from "@/features/recommendation/domain/suitability";
import { getViewer } from "@/shared/auth/session";
import { formatRainfall, formatTemperature } from "@/shared/utils/format";

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

export default async function Home() {
  const viewer = await getViewer();
  const ranked = rankCrops(SAMPLE_CROPS, SAMPLE_WEATHER);
  const nameOf = (id: string) =>
    SAMPLE_CROPS.find((c) => c.id === id)?.nameKo ?? id;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <div>
        <h1 className="font-bold text-2xl text-accent">Safe Farm AI</h1>
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

      <form action={logout}>
        <Button variant="ghost" size="sm" type="submit">
          로그아웃
        </Button>
      </form>
    </main>
  );
}

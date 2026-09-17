import { ChevronDownIcon } from "@/components/icons";
import { plotFaceClass } from "@/components/plot/plotFace";
import { buildForecastAlerts } from "@/features/weather/domain/forecastAlerts";
import type { PlotForecast } from "@/shared/aiService/client";
import { DailyRows } from "./DailyRows";
import { ForecastAlerts } from "./ForecastAlerts";
import { GrowthSeriesBars } from "./GrowthSeriesBars";
import { HourlyStrip } from "./HourlyStrip";
import { StaleNotice } from "./StaleNotice";
import { WeatherNow } from "./WeatherNow";
import { WeekBand } from "./WeekBand";

/**
 * ---------------------------------------------
 * [Feature]: 밭 한 줄 — `/weather` 목록의 한 행
 *
 * [Description]
 * - **밭 하나가 카드가 아니라 접힌 한 줄이다.** 예전에는 밭마다 카드를 세로로
 *   쌓아서, 경고 없는 밭이 503px · 경고 다섯 장인 밭이 987px 였다(실측).
 *   밭이 셋이면 2500px 을 내려야 "오늘 어느 밭이 문제인지"를 알 수 있었다.
 *   지금은 줄 하나에 **가장 급한 판단 한 문장**이 박혀 있어서, 밭이 몇 개든
 *   그 답이 첫 화면에 들어온다. 아무것도 열지 않고.
 * - 상세는 `<details name="plot">` 이 한 번에 하나만 펼친다. **JS 가 0줄이다** —
 *   브라우저 기능이고, 지원하지 않는 브라우저는 `name` 을 무시해 여러 개가
 *   동시에 열릴 뿐 깨지지 않는다.
 * - **접힌 줄에 보이는 것**: 밭 얼굴색 · 이름 · 작물/단계 · 지금 기온 · 가장 급한
 *   판단 · (보관된 값이면) 그 표시. 전부 `<summary>` 안에 있다 — 밖에 두면 닫힌
 *   `<details>` 가 안 그린다.
 *   얼굴색은 홈의 텃밭 띠·텃밭 관리와 **같은 밭이면 같은 색**이다(`plotIdentity`).
 * - ⚠️ 판단 줄은 `alerts[0]` 을 쓴다. `buildForecastAlerts` 가 심각도 내림차순을
 *   보장한다는 전제이고, 그 전제는 테스트로 박아 두었다.
 * ---------------------------------------------
 */

const TONE_TEXT = {
  danger: "text-unsuitable",
  caution: "text-caution",
  info: "text-info",
} as const;

interface PlotForecastRowProps {
  plotId: string;
  nameKo: string;
  cropNameKo: string | null;
  forecast: PlotForecast;
  /** "오늘"을 가리는 기준일(YYYY-MM-DD). 서버 렌더라 밖에서 넣어 준다. */
  todayIso: string;
  /** 첫 줄만 펴 둔다. 전부 접히면 화면이 비어 보이고, 펼 수 있다는 것도 안 알려진다. */
  defaultOpen?: boolean;
  /**
   * 관측 차트(최근 실측 + 예보). **펼쳤을 때만** 그린다.
   *
   * 로스터 구조를 지키면서 차트를 얹는 자리다 — 접힌 줄은 판단 한 줄로 두고,
   * 자세히 볼 사람만 펼쳐서 기온·강수 흐름을 본다. 접힌 목록에 차트를 밭 수만큼
   * 그리면 스크롤을 줄이려고 만든 구조가 도로 무너진다.
   */
  chart?: React.ReactNode;
  /** 값이 있으면 실시간이 아니라 보관해 둔 예보다. 줄을 펴면 그 사실이 보인다. */
  cachedAt?: Date;
}

export function PlotForecastRow({
  plotId,
  nameKo,
  cropNameKo,
  forecast,
  todayIso,
  defaultOpen = false,
  chart,
  cachedAt,
}: PlotForecastRowProps) {
  const alerts = buildForecastAlerts(forecast);
  const worst = alerts[0];
  const stage = forecast.cropImpact?.stageName;

  return (
    <details
      className="rounded-xl border border-border bg-surface"
      // 같은 name 을 가진 details 는 한 번에 하나만 열린다(브라우저 기능).
      name="plot"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          // 홈의 텃밭 띠·텃밭 관리와 **같은 밭이면 같은 얼굴색**이다. 화면을
          // 옮겨 다녀도 같은 밭을 같은 색으로 기억하게 하는 장치다.
          className={`grid size-9 shrink-0 place-items-center rounded-full font-semibold text-sm ${plotFaceClass(plotId)}`}
        >
          {nameKo.slice(0, 1)}
        </span>

        {/* ⚠️ min-w-0 + truncate 가 없으면 긴 밭 이름이 기온 칸을 밀어 375px 에서
            가로 스크롤이 생긴다. flex-1 만으로는 부족하다. */}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-fg">{nameKo}</span>
          <span className="block truncate text-fg-muted text-xs">
            {cropNameKo ?? "작물 미정"}
            {stage && <span className="text-accent"> · {stage}</span>}
          </span>

          {/*
            판단 한 줄. ⚠️ **반드시 `<summary>` 안이어야 한다.** 닫힌 `<details>` 는
            첫 `<summary>` 말고는 아무것도 그리지 않으므로, 이 줄이 밖에 있으면
            접힌 밭의 경고가 통째로 사라진다 — 이 화면이 존재하는 이유가 없어진다.
            (한 번 밖에 두고 높이만 재서 못 잡았다. 접힌 줄의 **내용**을 봐야 한다.)
            경고가 없으면 이 줄도 없다 — "이상 없음"을 매일 적으면 정작 빨간 줄이
            떴을 때의 무게가 사라진다.
          */}
          {worst && (
            <span
              className={`mt-0.5 flex items-center gap-1.5 text-xs ${TONE_TEXT[worst.tone]}`}
            >
              <span className="truncate font-medium">{worst.titleKo}</span>
              {alerts.length > 1 && (
                <span className="shrink-0 text-fg-subtle">
                  +{alerts.length - 1}건
                </span>
              )}
            </span>
          )}
        </span>

        <span className="shrink-0 text-right">
          <span
            className={`block font-mono text-xl tabular-nums ${cachedAt ? "text-caution" : "text-fg"}`}
          >
            {forecast.current?.tempC != null
              ? `${forecast.current.tempC.toFixed(1)}℃`
              : "—"}
          </span>
          {/*
            ⚠️ 보관된 값이라는 사실은 **접힌 상태에서도** 보여야 한다. 자세한 안내
            (StaleNotice)는 펼친 자리에 있지만 그건 닫혀 있으면 안 보이고, 그러면
            요약 줄의 낡은 기온이 실시간 값과 똑같은 모양으로 찍힌다.
            `lastGoodForecast` 가 "언제 것인지 말하지 않는 폴백은 거짓말"이라고
            못 박아 둔 그 상황이다. 기온 색도 같이 낮춘다.
          */}
          {cachedAt && (
            <span className="block text-caution text-[0.65rem]">보관된 값</span>
          )}
        </span>

        <ChevronDownIcon className="size-4 shrink-0 text-fg-subtle" />
      </summary>

      <div className="flex flex-col gap-4 border-border/60 border-t p-3">
        {cachedAt && <StaleNotice cachedAt={cachedAt} />}

        {/* 경고가 맨 위다. 기온은 이제 **항상 보이는 요약 줄**에 있으므로,
            예전에 경고를 아래로 내렸던 이유("경고 다섯 장이면 숫자가 한 개도 안
            보인다")가 사라졌다. */}
        <ForecastAlerts alerts={alerts} />

        {forecast.current && <WeatherNow current={forecast.current} />}

        <HourlyStrip hours={forecast.hours} />

        <WeekBand
          cropImpact={forecast.cropImpact}
          days={forecast.days}
          todayIso={todayIso}
        />

        {/* 관측 차트. 주간 밴드가 "이번 주 기온 폭"이라면 이건 "지난 며칠 실측이
            어떻게 흘러 여기까지 왔나"다 — 실측과 예보를 한 선에서 잇는다. */}
        {chart}

        <details className="border-border/60 border-t pt-3">
          <summary className="cursor-pointer text-fg-muted text-xs hover:text-fg">
            7일 수치 · 누적 강수량 · 생육 속도
          </summary>

          <div className="mt-3 flex flex-col gap-4">
            <DailyRows
              cropImpact={forecast.cropImpact}
              days={forecast.days}
              todayIso={todayIso}
            />

            <section>
              <h4 className="text-fg-muted text-xs">
                누적 강수량 (최근접 관측소 실측)
              </h4>
              <dl className="mt-1 flex gap-4 font-mono text-fg text-sm tabular-nums">
                <Window days={3} mm={forecast.rainfall3d} />
                <Window days={5} mm={forecast.rainfall5d} />
                <Window days={7} mm={forecast.rainfall7d} />
              </dl>
            </section>

            {forecast.growthSeries && forecast.growthSeries.length > 0 && (
              <GrowthSeriesBars series={forecast.growthSeries} />
            )}
          </div>
        </details>
      </div>
    </details>
  );
}

/**
 * 누적 강수량 한 칸.
 *
 * 관측이 없으면 0mm 가 아니라 "관측 없음"이다. 둘을 같게 적으면 "비가 안 왔다"와
 * "모른다"가 뭉개져, 관수 판단이 뒤집힌다.
 */
function Window({ days, mm }: { days: number; mm: number | null }) {
  return (
    <div>
      <dt className="font-sans text-fg-subtle text-xs">{days}일</dt>
      <dd>
        {mm != null ? (
          `${mm}mm`
        ) : (
          <span className="text-fg-subtle">관측 없음</span>
        )}
      </dd>
    </div>
  );
}

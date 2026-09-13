import type { ComponentType } from "react";
import {
  CloudRainIcon,
  GroundStationIcon,
  type IconProps,
  SatelliteIcon,
} from "@/components/icons";
import { Reveal } from "@/components/shared/Reveal";
import { SectionHeading } from "@/components/shared/SectionHeading";

/**
 * ---------------------------------------------
 * [Feature]: 세 가지 눈 (#eyes) — 관측소 · 위성 · 예보
 *
 * [Description]
 * - 이 서비스가 왜 출처를 셋이나 쓰는지 밝히는 절이다. 각 눈의 **빈자리**(구름,
 *   한 점만 재는 것, 예보가 틀리는 것)를 그대로 적은 문장이 이 절의 값이다.
 *   마케팅 문구로 다듬지 말 것.
 * - 데이터를 도메인이 아니라 이 파일에 둔 이유: 이 세 문단은 화면 카피이지
 *   숫자가 계산에 쓰이기 시작하면 그때 domain 으로 옮긴다.
 * - **카드 높이를 맞추는 방법**: 본문 길이가 제각각이라 스펙 표의 윗선이 세 칸에서
 *   다른 높이에 걸린다. `h-full` + flex column + 스펙을 `mt-auto` 로 바닥에 붙여
 *   구분선 위치를 강제로 맞췄다. 그리드 자식은 기본이 stretch 라 Reveal 은 건드릴
 *   것이 없다.
 * - 상태가 없어 서버 컴포넌트다. 진입 연출만 Reveal(클라이언트)이 맡는다.
 *
 * [Usage]
 * ```tsx
 * <DataSources />
 * ```
 * ---------------------------------------------
 */

interface Eye {
  id: string;
  /** 출처 표기. 카드 맨 위 작은 라벨. */
  sourceKo: string;
  titleKo: string;
  /** 이 눈이 맡은 역할 한 줄. */
  roleKo: string;
  bodyKo: string;
  /** 스펙 표. 키가 짧아야 dt 열이 안 벌어진다. */
  specs: readonly { termKo: string; valueKo: string }[];
  Icon: ComponentType<IconProps>;
}

const EYES: readonly Eye[] = [
  {
    id: "station",
    sourceKo: "기상청 API허브 · 상주 137",
    titleKo: "땅에서 잰 숫자",
    roleKo: "적산온도의 뼈대",
    bodyKo:
      "씨 뿌린 날부터 오늘까지의 실제 기온입니다. 예보가 아니라 관측이라, 늦게 가입한 분의 지난 날짜도 거슬러 계산할 수 있습니다. 서리가 실제로 맺히는 풀 높이 온도까지 따로 잽니다.",
    specs: [
      { termKo: "주기", valueKo: "하루 1회" },
      { termKo: "받는 것", valueKo: "최고·최저기온, 강수, 풍속" },
      { termKo: "특이", valueKo: "초상온도 TG_MIN" },
      { termKo: "확보", valueKo: "실측 166일치" },
    ],
    Icon: GroundStationIcon,
  },
  {
    id: "satellite",
    sourceKo: "Copernicus Sentinel-2",
    titleKo: "위에서 본 잎",
    roleKo: "눈으로 확인하는 쪽",
    bodyKo:
      "밭이 실제로 푸른지, 물이 찼는지, 잎이 목마른지를 10m 격자로 읽습니다. 다만 5일에 한 번 지나가고 구름이 끼면 아무것도 못 봅니다. 그래서 주력이 아니라 확인용입니다.",
    specs: [
      { termKo: "주기", valueKo: "5일 · 구름 시 결측" },
      { termKo: "지수", valueKo: "NDVI · NDWI · NDMI" },
      { termKo: "밴드", valueKo: "B03 B04 B08 B11 + SCL" },
      { termKo: "확보", valueKo: "연동 완료 · 실측 검증" },
    ],
    Icon: SatelliteIcon,
  },
  {
    id: "forecast",
    sourceKo: "Open-Meteo",
    titleKo: "앞을 보는 눈",
    roleKo: "경보와 작업 시각",
    bodyKo:
      "좌표만 넣으면 열엿새치 예보가 나옵니다. 관측소가 없는 밭에도 값이 나오고, 한국·일본·유럽 모델을 나란히 볼 수 있습니다. 일출·일몰과 바람까지 한 번에 받아 약 칠 시각을 잡습니다.",
    specs: [
      { termKo: "주기", valueKo: "하루 1회 · 16일 예보" },
      { termKo: "받는 것", valueKo: "기온·강수·바람·일출입" },
      { termKo: "더", valueKo: "토양수분, 1940년~ 평년값" },
      { termKo: "인증", valueKo: "키 없이 호출" },
    ],
    Icon: CloudRainIcon,
  },
];

export function DataSources() {
  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-24 md:py-32" id="eyes">
      <SectionHeading
        description="위성은 넓게 보지만 자주 못 보고, 관측소는 자주 재지만 한 점만 봅니다. 예보는 앞을 보지만 틀립니다. 셋의 빈자리가 서로 다르기 때문에 겹쳐야 합니다."
        eyebrow="세 가지 눈"
        title="하나로는 부족해서 셋을 씁니다"
      />

      <ul className="mt-14 grid gap-6 md:grid-cols-3">
        {EYES.map((eye, index) => (
          <Reveal as="li" delay={index * 80} key={eye.id}>
            <article className="flex h-full flex-col rounded-xl border border-border bg-surface p-6">
              <p className="font-mono text-fg-subtle text-xs tracking-wide">
                {eye.sourceKo}
              </p>

              <eye.Icon
                aria-hidden="true"
                className="mt-6 text-2xl text-telemetry"
              />

              <h3 className="mt-3 font-semibold text-fg text-xl tracking-tight">
                {eye.titleKo}
              </h3>
              <p className="mt-1 font-mono text-accent text-xs">{eye.roleKo}</p>

              <p className="mt-4 text-pretty text-fg-muted text-sm leading-relaxed">
                {eye.bodyKo}
              </p>

              <div className="mt-auto pt-6">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border-border border-t pt-4">
                  {eye.specs.map((spec) => (
                    <div className="contents" key={spec.termKo}>
                      <dt className="text-fg-subtle text-xs">{spec.termKo}</dt>
                      <dd className="text-balance text-right font-mono text-fg text-xs tabular-nums">
                        {spec.valueKo}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </article>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

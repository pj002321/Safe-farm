/**
 * ---------------------------------------------
 * [Feature]: 대시보드 배경 — 궤도에서 내려다본 농지
 *
 * [Description]
 * - 이 서비스가 실제로 보는 장면을 배경으로 깐다. 장식 도형이 아니라 **관측 지도**다:
 *     · 필지 — 지적 경계로 맞물린 밭들. 일부는 이랑(줄뿌림)이 보이고, 일부는 NDVI 가
 *       높아 초록이 차 있고, 한 곳은 맨흙이다. `SatelliteScan` 의 필지 테셀레이션을
 *       화면 전체로 넓힌 것이다(같은 원칙: 필지는 틈 없이 꼭짓점을 공유한다).
 *     · 지상 궤적 — 극궤도 위성의 경로는 지도 위에서 **사인 곡선**으로 그려진다(원이 아니다).
 *       그 곡선을 따라 센서가 찍는 촬영 폭(swath)을 옅은 띠로 깐다.
 *     · 경위도 격자 — 지도라는 걸 알려 주는 최소한의 눈금.
 * - **배경은 물러나 있어야 한다.** 대시보드는 할 일을 처리하는 화면이다. 그래서
 *     · 가운데(제목·할 일이 놓이는 기둥)는 마스크로 비우고 가장자리에만 짙게 남긴다.
 *     · 색은 전부 시맨틱 토큰(currentColor)이라 다크 모드에서 저절로 뒤집힌다.
 *     · 움직임은 위성 표지의 맥박 하나뿐이다(`animate-pulse-ring`). 모션을 끈 사용자에게는
 *       globals.css 전역 블록이 멈춘 점으로 남긴다.
 * - 서버 컴포넌트다. JS 를 내리지 않는다. `fixed` + 음수 z 로 본문 뒤에 깔려 스크롤해도
 *   따라오고, 헤더의 backdrop-blur 아래로 비친다.
 * ---------------------------------------------
 */

/**
 * 필지 타일 한 장(200×200). 테두리 위의 점은 맞은편 테두리와 **같은 좌표**라
 * 타일을 이어 붙여도 경계가 끊기지 않는다 — 위·아래는 x=70·130, 왼·오른쪽은 y=60·140.
 * 안쪽 네 점만 흔들어 반듯한 바둑판이 아니라 실제 필지처럼 보이게 한다.
 */
const TILE = 200;
const P = {
  a: "0 0", b: "70 0", c: "130 0", d: "200 0",
  e: "0 60", f: "76 54", g: "124 66", h: "200 60",
  i: "0 140", j: "64 146", k: "136 134", l: "200 140",
  m: "0 200", n: "70 200", o: "130 200", q: "200 200",
} as const;

const quad = (...pts: (keyof typeof P)[]) => `M${pts.map((k) => P[k]).join(" L")} Z`;

/** 필지 아홉 칸과 각자의 땅 상태. */
const PARCELS: { d: string; fill: "rows-a" | "rows-b" | "ndvi" | "soil" | null }[] = [
  { d: quad("a", "b", "f", "e"), fill: "rows-a" },
  { d: quad("b", "c", "g", "f"), fill: null },
  { d: quad("c", "d", "h", "g"), fill: "ndvi" },
  { d: quad("e", "f", "j", "i"), fill: null },
  { d: quad("f", "g", "k", "j"), fill: "rows-b" },
  { d: quad("g", "h", "l", "k"), fill: null },
  { d: quad("i", "j", "n", "m"), fill: "ndvi" },
  { d: quad("j", "k", "o", "n"), fill: "soil" },
  { d: quad("k", "l", "q", "o"), fill: "rows-a" },
];

/** 지상 궤적. 1600×1000 지도 위를 두 번 굽이치는 사인 곡선(베지어 근사). */
const GROUND_TRACK =
  "M-80 820 C 180 820, 260 180, 520 180 S 860 820, 1120 820 S 1460 180, 1720 180";

export function FieldBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{
        // 가운데 기둥을 비운다. 위쪽은 헤더 아래로 부드럽게 들어오게 한 번 더 걷는다.
        maskImage:
          "radial-gradient(ellipse 58% 80% at 50% 50%, transparent 52%, black 100%), linear-gradient(to bottom, transparent 0, black 14%)",
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      }}
    >
      {/* ── 필지 ─────────────────────────────────────── */}
      <svg aria-hidden="true" className="absolute inset-0 size-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern height="10" id="fb-rows-a" patternTransform="rotate(-24)" patternUnits="userSpaceOnUse" width="10">
            <line className="text-telemetry" stroke="currentColor" strokeOpacity="0.2" strokeWidth="1" x1="0" x2="10" y1="5" y2="5" />
          </pattern>
          <pattern height="9" id="fb-rows-b" patternTransform="rotate(62)" patternUnits="userSpaceOnUse" width="9">
            <line className="text-telemetry" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1" x1="0" x2="9" y1="4.5" y2="4.5" />
          </pattern>
          <pattern height={TILE} id="fb-parcels" patternTransform="rotate(-8) scale(2.4)" patternUnits="userSpaceOnUse" width={TILE}>
            {PARCELS.map(({ d, fill }) => (
              <path
                className={
                  fill === "ndvi"
                    ? "text-telemetry"
                    : fill === "soil"
                      ? "text-earth"
                      : "text-fg-subtle"
                }
                d={d}
                fill={
                  fill === "rows-a" || fill === "rows-b"
                    ? `url(#fb-${fill})`
                    : fill
                      ? "currentColor"
                      : "none"
                }
                fillOpacity={fill === "ndvi" ? 0.1 : fill === "soil" ? 0.09 : undefined}
                key={d}
                stroke="var(--color-fg-subtle)"
                strokeOpacity="0.3"
                strokeWidth="0.6"
              />
            ))}
          </pattern>
        </defs>
        <rect fill="url(#fb-parcels)" height="100%" width="100%" />
      </svg>

      {/* ── 지도 격자 · 지상 궤적 · 촬영 폭 ──────────────────────── */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 size-full"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 1600 1000"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g className="text-fg-subtle" stroke="currentColor" strokeDasharray="2 10" strokeOpacity="0.35" strokeWidth="1">
          {[200, 400, 600, 800].map((y) => (
            <line key={`lat-${y}`} x1="0" x2="1600" y1={y} y2={y} />
          ))}
          {[200, 400, 600, 800, 1000, 1200, 1400].map((x) => (
            <line key={`lon-${x}`} x1={x} x2={x} y1="0" y2="1000" />
          ))}
        </g>

        <g className="text-accent" fill="none" stroke="currentColor">
          {/* 촬영 폭. 궤적을 따라가는 넓고 옅은 띠 — 이 안의 필지가 이번 패스에 찍힌다. */}
          <path d={GROUND_TRACK} strokeLinecap="round" strokeOpacity="0.09" strokeWidth="110" />
          <path d={GROUND_TRACK} strokeDasharray="1 7" strokeLinecap="round" strokeOpacity="0.5" strokeWidth="1.5" />
        </g>
      </svg>

      {/* 위성 표지. 궤적의 오른쪽 위 마루(1460,180 부근)에 둔다 — 가운데 기둥 밖이라 마스크에 안 먹힌다. */}
      <div className="absolute top-[18%] right-[9%] size-2.5">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-accent" />
        <span className="absolute inset-0 rounded-full bg-accent ring-4 ring-accent/15" />
      </div>
    </div>
  );
}

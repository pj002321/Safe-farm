/**
 * ---------------------------------------------
 * [Feature]: 위성 수신 로딩 — 관측을 한 줄씩 받는 동안 보여주는 판독기
 *
 * [Description]
 * - 스피너를 쓰지 않는다. 이 서비스가 그때 실제로 하는 일(**위성 관측을 받아
 *   필지에 얹는다**)을 그대로 그린다. 기다리는 시간이 곧 설명이 되게 한다.
 * - **띠가 움직이지 않는다. 장면이 움직인다.** 실제 푸시브룸 센서(Sentinel-2 의
 *   MSI 같은 선형 검출기)는 완성된 사진 위를 훑지 않는다. 검출기는 한 자리에
 *   고정돼 있고 위성이 날아가며 **한 줄씩 기록**한다. 그래서 여기서도 검출선은
 *   화면에 박혀 있고 장면이 그 아래에서 위로 흘러간다.
 *     · 검출선 **위** = 수신 완료. 관측값이 들어와 면이 채워진 상태.
 *     · 검출선 **아래** = 지적 경계만 아는 상태. 필지 윤곽은 지적도에서 미리
 *       알지만 그 위의 관측값은 아직 없다 — 그래서 파선 윤곽만 그린다.
 *       이건 연출이 아니라 이 제품의 실제 데이터 사정이다.
 *   필지가 선을 넘으면 눈앞에서 채워진다. "읽고 있다"가 그림으로 성립한다.
 *
 * - 예전 구현의 문제는 셋이었고 전부 구조에서 왔다:
 *     ① 띠가 SVG 와 다른 좌표계에 살았다. 그림은 `viewBox="0 0 100 88"` 인데
 *        띠는 HTML 기준 `h-1/2` 라, 정사각 칸에 생긴 위아래 여백까지 덮었다.
 *        어디와도 맞아떨어지지 않으니 스캔이 아니라 그라디언트 덩어리로 읽혔다.
 *        지금은 viewBox 가 정사각(96×96)이라 여백 자체가 없다.
 *     ② 필지가 꼭짓점을 공유하지 않아 틈이 벌어졌다 — 농지가 아니라 깨진 타일.
 *        지금 `PARCELS` 는 틈 없이 맞물리는 테셀레이션이다.
 *     ③ 필지는 한 번에 다 그려지고 띠는 위에 라임을 덧칠만 했다. 조명만 바뀌니
 *        "읽고 있다"가 성립할 수 없었다. 지금은 상태 자체가 바뀐다.
 *
 * - ⚠️ **모션이 꺼져도 읽혀야 한다.** globals.css 전역 블록이 duration 을 0.01ms,
 *   iteration-count 를 1 로 눌러 애니메이션을 즉시 끝낸다. 그래서 이렇게 설계했다:
 *     · 스트립의 시작(translateY 0)과 끝(-96)이 **같은 그림**이다. 타일 두 장이
 *       이음매 없이 이어져 있어, 멈춘 자리가 어디든 "위는 수신됨 · 아래는 대기 ·
 *       가운데 검출선"이라는 완성된 계기 화면이 남는다.
 *     · `animation-delay` 를 쓰지 않는다. 전역 블록은 duration 만 죽이고 delay 는
 *       남겨서, 스태거를 걸면 영영 안 나타나는 조각이 생긴다.
 *   (앞 구현은 이 점에서 **주석이 거짓이었다.** `--animate-sweep` 에 fill-mode 가
 *    없어 계산값이 base 로 되돌아갔고, 모션을 끈 사용자에게는 위쪽 절반을 덮은
 *    정지된 초록 띠가 남았다. 지금 토큰은 `both` 를 명시한다.)
 * - 진행률을 **거짓으로 그리지 않는다.** 얼마나 남았는지 모르므로 퍼센트도,
 *   차오르는 막대도 두지 않는다. 스트립은 끝나지 않고 흐른다.
 *
 * [Usage]
 * ```tsx
 * <SatelliteScan labelKo="생육 기상(GDD) 지도를 읽는 중" />
 * <SatelliteScan compact labelKo="앞들 배추밭 예보를 읽는 중" />
 * ```
 * ---------------------------------------------
 */

/**
 * 타일 한 장의 높이(사용자 단위).
 *
 * ⚠️ globals.css 의 `@keyframes acquire` 가 `translateY(-96px)` 로 이 값을 박아
 *    쓴다. 한쪽만 바꾸면 한 바퀴마다 그림이 튄다. 둘은 같이 움직인다.
 */
const SCENE = 96;

/** 검출선 위치. 위 58 은 수신 완료, 아래 38 은 대기 구역이다. */
const LINE_Y = 58;

/**
 * 필지. 96×96 을 **틈 없이 덮는 테셀레이션**이다. 두 가지를 지킨다:
 *   ① 인접 필지가 꼭짓점을 공유한다 — 틈이 있으면 농지가 아니라 깨진 타일이 된다.
 *   ② 맨 윗줄과 맨 아랫줄의 x 가 같고 y 가 정확히 0 / 96 이다. 타일을 세로로 이어
 *      붙일 때 경계가 맞아야 스트립에 이음매가 안 보인다.
 * 직각은 피한다. 반듯한 사각형이 줄지어 있으면 농지가 아니라 표로 읽힌다.
 */
const PARCELS = [
  "M0 0 L30 0 L27 30 L0 35 Z",
  "M30 0 L67 0 L62 36 L27 30 Z",
  "M67 0 L96 0 L96 29 L62 36 Z",
  "M0 35 L27 30 L34 67 L0 62 Z",
  "M27 30 L62 36 L58 61 L34 67 Z",
  "M62 36 L96 29 L96 68 L58 61 Z",
  "M0 62 L34 67 L30 96 L0 96 Z",
  "M34 67 L58 61 L67 96 L30 96 Z",
  "M58 61 L96 68 L96 96 L67 96 Z",
] as const;

/**
 * compact 전용 라스터. 6단위마다 한 줄, 길이만 다르다.
 *
 * 64px 에서 필지 9개는 뭉개진다 — 112px 그림을 그대로 줄이면 그게 결함이 된다.
 * 그 크기에서 읽히는 것은 **원시 데이터 줄**이고, 그건 지상국이 수신 중에 실제로
 * 보는 화면이다. 같은 계기의 다른 배율이지 다른 은유가 아니다.
 */
const RASTER = [62, 78, 41, 70, 55, 80, 34, 66, 74, 47, 59, 82, 38, 71, 52, 64];

interface SatelliteScanProps {
  /** 지금 무엇을 하고 있는지. 화면과 스크린리더가 같은 문장을 쓴다. */
  labelKo: string;
  /** 한 줄로 낮게 놓는 형태. 카드 안이나 좁은 자리에 쓴다. */
  compact?: boolean;
  className?: string;
}

/** 타일 한 장. `pending` 이 수신 완료/대기를 가른다 — 기하는 같고 표현만 다르다. */
function SceneTile({
  compact,
  pending,
}: {
  compact: boolean;
  pending: boolean;
}) {
  if (compact) {
    return (
      <g
        className="text-earth"
        stroke="currentColor"
        strokeLinecap="round"
        strokeOpacity={pending ? 0.24 : 0.7}
        strokeWidth="2.5"
      >
        {RASTER.map((width, index) => {
          const y = 3 + index * 6;
          return (
            // 대기 구역에서는 **줄의 시작 눈금만** 그린다. 받을 자리는 알지만 값은
            // 아직 모른다 — 길이를 미리 그리면 없는 데이터를 그리는 셈이다.
            <line key={y} x1="8" x2={pending ? 12 : 8 + width} y1={y} y2={y} />
          );
        })}
      </g>
    );
  }

  return (
    <g
      className="text-earth"
      fill={pending ? "none" : "currentColor"}
      fillOpacity={pending ? undefined : 0.3}
      stroke="currentColor"
      strokeDasharray={pending ? "3 3" : undefined}
      strokeLinejoin="round"
      strokeOpacity={pending ? 0.32 : 0.75}
      strokeWidth="1"
    >
      {PARCELS.map((d) => (
        <path d={d} key={d} />
      ))}
    </g>
  );
}

/**
 * 흐르는 스트립 한 줄기.
 *
 * 타일을 **두 장** 이어 놓고 한 장 높이만큼 밀어 올린다. 끝나는 자리가 시작하는
 * 자리와 정확히 같은 그림이라 이음매가 없고, 멈춰도 깨지지 않는다.
 * 잘라내기는 중첩 `<svg>` 가 한다 — `clipPath` 는 문서에 유일한 id 가 필요한데
 * 이 컴포넌트는 날씨 화면에서 밭 수만큼 동시에 뜬다(id 가 충돌한다).
 */
function Strip({
  compact,
  pending,
  y,
  height,
}: {
  compact: boolean;
  pending: boolean;
  y: number;
  height: number;
}) {
  return (
    // 바깥 svg 가 이미 제목을 갖고 있고 타일 전체가 aria-hidden 이라, 안쪽은
    // 순수 장식이다. 여기에 제목을 또 달면 스크린리더가 같은 그림을 세 번 읽는다.
    <svg
      height={height}
      role="presentation"
      viewBox={`0 ${y} ${SCENE} ${height}`}
      width={SCENE}
      x="0"
      y={y}
    >
      <g className="animate-acquire">
        <SceneTile compact={compact} pending={pending} />
        <g transform={`translate(0 ${SCENE})`}>
          <SceneTile compact={compact} pending={pending} />
        </g>
      </g>
    </svg>
  );
}

export function SatelliteScan({
  labelKo,
  compact = false,
  className = "",
}: SatelliteScanProps) {
  return (
    // <output> 은 role="status"(aria-live polite)를 이미 갖고 있다. 화면을 떠나
    // 있어도 무엇을 기다리는지 읽힌다. 안쪽 도형은 장식이라 트리에서 뺀다.
    <output
      className={`flex items-center gap-4 ${compact ? "" : "flex-col justify-center py-10 text-center"} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`relative block shrink-0 overflow-hidden rounded-xl border border-border bg-surface-2 ${
          compact ? "size-16" : "size-28"
        }`}
      >
        {/* viewBox 가 정사각이라 칸에 꽉 찬다 — 예전처럼 위아래 여백이 생기지 않는다. */}
        <svg
          className="block size-full"
          role="presentation"
          viewBox={`0 0 ${SCENE} ${SCENE}`}
        >
          <title>위성 관측 수신</title>

          {/* 아래: 아직 안 받은 구역. 위: 받은 구역. 둘은 같은 장면의 다른 상태다. */}
          <Strip compact={compact} height={SCENE - LINE_Y} pending y={LINE_Y} />
          <Strip compact={compact} height={LINE_Y} pending={false} y={0} />

          {/* 검출선. 이 그림에서 유일하게 움직이지 않는 것이고, 그게 요점이다. */}
          <line
            className="text-telemetry"
            stroke="currentColor"
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
            x1="0"
            x2={SCENE}
            y1={LINE_Y}
            y2={LINE_Y}
          />
          {/* 검출선 양 끝 눈금. 선이 화면을 가로지르는 계측선임을 짧게 말해 준다. */}
          {/* ⚠️ `vector-effect` 는 **상속되지 않고** `<g>` 에는 적용 대상도 아니다.
              그룹에 걸면 조용히 아무 일도 안 일어나서, 눈금만 칸 크기에 따라
              굵기가 달라진다(64px 에서 1.6px, 112px 에서 2.9px). 그리는 요소에
              직접 건다. stroke 계열은 상속되므로 그룹에 그대로 둔다. */}
          <g
            className="text-telemetry"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.5"
          >
            <line
              vectorEffect="non-scaling-stroke"
              x1="0"
              x2="7"
              y1={LINE_Y}
              y2={LINE_Y}
            />
            <line
              vectorEffect="non-scaling-stroke"
              x1={SCENE - 7}
              x2={SCENE}
              y1={LINE_Y}
              y2={LINE_Y}
            />
          </g>
        </svg>
      </span>

      {/* 예전의 "위성 관측을 읽는 중입니다" 둘째 줄은 뺐다 — 바로 위 labelKo 가
          이미 "…읽는 중"이라 같은 말을 두 번 하고 있었다. */}
      <span
        className={`font-medium text-fg ${compact ? "min-w-0 text-sm" : ""}`}
      >
        {labelKo}
      </span>
    </output>
  );
}

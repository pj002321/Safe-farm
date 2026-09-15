/**
 * ---------------------------------------------
 * [Feature]: 좌우 여백에 까는 필지 기하 무늬
 *
 * [Description]
 * - 넓은 화면에서 본문(`max-w-6xl`) 양옆에 남는 빈 띠를 쓴다. 그 자리가 비어 있어
 *   화면이 회백색 한 톤으로 읽혔다.
 * - **잎사귀를 그리지 않는다.** 처음에 고랑과 잎을 그렸다가 걷어냈다. 알아볼 수
 *   있는 잎을 여백에 늘어놓으면 클립아트로 읽히고, 무엇보다 이 프로젝트의 색
 *   언어(globals.css)가 "농업 앱의 관행색을 버리고 지구관측 인터페이스의 언어를
 *   쓴다"고 못 박고 있다. 잎 그림은 그 방침에 정면으로 어긋난다.
 *   대신 **위성에서 내려다본 필지 경계**를 쓴다 — 지적도의 불규칙한 사각형과
 *   등고선. 농지를 말하되 그림이 아니라 데이터의 언어로 말한다.
 * - **3D 를 쓰지 않는다.** 히어로에 이미 three.js 지구본이 있다. 장식 하나에
 *   번들과 GPU 를 한 번 더 물릴 이유가 없다. SVG 는 의존성이 0 이다.
 * - **폭이 여백을 그대로 따라간다**: `max(0px, (100% - 72rem) / 2)`.
 *   고정 폭으로 두면 1280px 언저리에서 본문을 덮는다. 여백이 없으면 폭이 0 이
 *   되므로 저절로 사라진다.
 * - **위아래를 마스크로 흐린다.** 무늬가 섹션 경계에서 칼같이 끊기면 붙여 놓은
 *   티가 난다. 이 한 줄이 "디자인한 것"과 "얹은 것"을 가른다.
 * - **장식이다.** `aria-hidden` + `pointer-events-none`. 내용은 담지 않는다 —
 *   여기 정보를 넣으면 좁은 화면 사용자만 그 정보를 못 보게 된다.
 *
 * [Usage]
 * ```tsx
 * <div className="relative overflow-hidden">
 *   <FieldGutter className="text-telemetry" side="left" />
 *   <FieldGutter className="text-earth" side="right" />
 *   <section className="relative mx-auto max-w-6xl">…</section>
 * </div>
 * ```
 * ---------------------------------------------
 */

interface FieldGutterProps {
  side: "left" | "right";
  /** 색 토큰. `text-telemetry` 처럼 준다. */
  className?: string;
}

/** 본문 폭. `max-w-6xl`(72rem)과 **반드시 같아야** 한다 — 어긋나면 무늬가 본문을 덮는다. */
const CONTENT_WIDTH = "72rem";

/**
 * 필지. 위성 사진 위에 지적 경계를 얹은 모습에서 가져왔다.
 * 직각을 피하고 변 길이를 흩어 놓는다 — 반듯한 사각형이 줄지어 있으면
 * 농지가 아니라 표로 읽힌다.
 */
const PARCELS = [
  { d: "M6 40 L74 22 L92 92 L18 112 Z", fill: 0.05 },
  { d: "M18 112 L92 92 L104 168 L28 186 Z", fill: 0 },
  { d: "M-8 196 L28 186 L44 268 L-4 280 Z", fill: 0.04 },
  { d: "M44 268 L104 252 L118 330 L56 346 Z", fill: 0 },
  { d: "M-2 352 L56 346 L68 430 L4 440 Z", fill: 0.06 },
  { d: "M68 430 L112 420 L122 500 L78 512 Z", fill: 0 },
  { d: "M4 452 L64 444 L76 540 L12 552 Z", fill: 0.03 },
] as const;

export function FieldGutter({ side, className = "" }: FieldGutterProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 hidden overflow-hidden xl:block ${
        side === "left" ? "left-0" : "right-0"
      } ${className}`}
      style={{
        width: `max(0px, calc((100% - ${CONTENT_WIDTH}) / 2))`,
        // 위아래를 흐려 섹션 경계에서 무늬가 끊기지 않게 한다.
        maskImage:
          "linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent, black 18%, black 82%, transparent)",
      }}
    >
      <svg
        className="h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        role="presentation"
        viewBox="0 0 120 560"
      >
        <title>필지 경계 무늬</title>

        {/* 좌우를 거울로 두면 대칭이 눈에 띈다. 한쪽만 뒤집어 어긋나게 한다. */}
        <g transform={side === "right" ? "translate(120 0) scale(-1 1)" : ""}>
          {/* 등고선. 아주 얇게 깔아 필지 아래 지형이 있다는 것만 암시한다. */}
          <g
            fill="none"
            opacity="0.16"
            stroke="currentColor"
            strokeWidth="0.75"
          >
            {[70, 150, 230, 310, 390, 470].map((y, index) => (
              <path
                d={`M-20 ${y} C 20 ${y - 18 - index * 2}, 70 ${y + 16}, 140 ${y - 8}`}
                key={y}
              />
            ))}
          </g>

          {/* 필지 경계. 선은 또렷하게, 면은 거의 안 보이게 — 지적도의 인상이다. */}
          <g stroke="currentColor" strokeLinejoin="round" strokeWidth="1">
            {PARCELS.map((parcel) => (
              <path
                d={parcel.d}
                fill="currentColor"
                fillOpacity={parcel.fill}
                key={parcel.d}
                opacity="0.3"
              />
            ))}
          </g>

          {/* 관측점 몇 개. 데이터가 찍히는 자리라는 신호이고, 직선뿐인 화면에
              점을 섞으면 무늬가 덜 딱딱해진다. */}
          <g fill="currentColor" opacity="0.4">
            {[
              [40, 76],
              [62, 224],
              [22, 392],
              [90, 470],
            ].map(([cx, cy]) => (
              <circle cx={cx} cy={cy} key={`${cx}-${cy}`} r="1.6" />
            ))}
          </g>
        </g>
      </svg>
    </div>
  );
}

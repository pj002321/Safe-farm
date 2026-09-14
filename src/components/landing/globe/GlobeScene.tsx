"use client";

import { Canvas } from "@react-three/fiber";
import { type RefObject, Suspense, useEffect, useRef, useState } from "react";
import type { ObservationSite } from "@/features/monitoring/domain/hazards";
import { Earth } from "./Earth";
import { useThemeColors } from "./palette";
import { Satellite } from "./Satellite";
import { SiteMarkers } from "./SiteMarkers";
import { Starfield } from "./Starfield";
import { useGlobeRotation } from "./useGlobeRotation";

/**
 * ---------------------------------------------
 * [Feature]: 3D 위성 지구본 씬
 *
 * [Description]
 * - 랜딩 히어로의 중심. 지구·대기·별·위성·관측 마커를 한 캔버스에 올린다.
 * - **화면 밖이면 렌더를 멈춘다.** 지구본은 랜딩 최상단에만 있는데, 스크롤을
 *   내린 뒤에도 GPU 를 계속 돌리면 노트북 팬이 돌고 모바일 배터리가 샌다.
 *   IntersectionObserver 로 frameloop 를 always/never 사이에서 토글한다.
 * - **WebGL 이 없으면 빈 화면을 두지 않는다.** 구형 브라우저·GPU 차단 환경·
 *   하드웨어 가속 끈 상태에서도 히어로는 비어 보이면 안 되므로 CSS 로 그린
 *   정적 지구본으로 갈아끼운다.
 * - 마커 선택은 이 컴포넌트 밖(부모의 목록 버튼)에서도 가능해야 한다.
 *   그래서 `aria-hidden` 을 쓰지 않고 `role="img"` + 설명만 준다 —
 *   3D 캔버스 자체는 키보드로 조작할 수 없기 때문에, 접근 경로는 부모가 쥔다.
 *
 * [Usage]
 * ```tsx
 * <GlobeScene
 *   sites={OBSERVATION_SITES}
 *   selectedId={selectedId}
 *   onSelect={setSelectedId}
 *   className="h-[32rem]"
 * />
 * ```
 * ---------------------------------------------
 */

interface GlobeSceneProps {
  sites: readonly ObservationSite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

const EARTH_RADIUS = 1.05;
const STAR_RADIUS = 14;

/** 궤도 2개. 경사각을 크게 벌려야 두 위성이 겹쳐 보이지 않는다. */
const ORBITS = [
  { id: "leo-a", radius: 1.72, inclinationDeg: 38, speed: 0.055 },
  { id: "leo-b", radius: 1.98, inclinationDeg: -72, speed: 0.036 },
] as const;

/** 자동회전 각속도 (rad/s). 한 바퀴에 100초쯤 — 눈에 거슬리지 않는 속도다. */
const AUTO_SPIN = 0.062;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return reduced;
}

/** 컨테이너가 뷰포트에 걸쳐 있는지. once 가 아니라 들고 날 때마다 갱신한다. */
function useInViewport(ref: RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      // 화면에 조금이라도 걸치면 살린다. 스크롤 중 경계에서 깜빡이는 걸 막는다.
      { threshold: 0, rootMargin: "120px" },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return inView;
}

/**
 * WebGL 사용 가능 여부. 컨텍스트를 실제로 만들어 보는 것 말고 확실한 방법이 없다.
 * 프라이버시 확장이나 정책으로 getContext 자체가 던지는 환경이 있어 감싼다 —
 * 오류를 숨기는 게 아니라, "못 쓴다"는 결과로 환산하는 것이다.
 */
function detectWebgl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export function GlobeScene({
  sites,
  selectedId,
  onSelect,
  className = "",
}: GlobeSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const inView = useInViewport(containerRef);

  // null = 아직 확인 전(로딩 표시), true/false = 확인 끝.
  const [webglReady, setWebglReady] = useState<boolean | null>(null);
  const [sceneReady, setSceneReady] = useState(false);

  const { groupRef, handlers } = useGlobeRotation({
    autoSpeed: AUTO_SPIN,
    enabled: !reducedMotion && inView,
  });

  useEffect(() => {
    setWebglReady(detectWebgl());
  }, []);

  const label = `위성 2기가 지구 궤도를 돌며 관측 지점 ${sites.length}곳의 재해 상황을 감시하는 3차원 지구본`;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label}
      className={`relative isolate overflow-hidden bg-space ${className}`}
      // 터치에서 드래그가 페이지 스크롤로 새지 않게 한다(useGlobeRotation 전제).
      style={{ touchAction: "none" }}
      {...handlers}
    >
      {webglReady === false ? (
        <StaticGlobeFallback />
      ) : (
        webglReady === true && (
          <Canvas
            // 거리 5.5 / fov 42 면 화면 절반 높이가 약 2.1 월드유닛이다.
            // 바깥 궤도 반지름(1.98)이 여기 들어와야 궤도 타원이 잘리지 않는다.
            // 3.4 로 두면 반높이가 1.3 이라 궤도와 적도 링이 프레임 밖으로 나간다.
            camera={{ position: [0, 0.9, 5.5], fov: 42 }}
            dpr={[1, 2]}
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: "high-performance",
            }}
            frameloop={inView ? "always" : "never"}
            style={{ touchAction: "none" }}
            onCreated={() => setSceneReady(true)}
          >
            <ambientLight intensity={0.35} />
            <directionalLight position={[3, 2, 2]} intensity={1.4} />
            {/* 뒤쪽 림라이트. 위성 실루엣이 밤하늘에 묻히지 않게 한다. */}
            <pointLight
              position={[-4, 1, -3]}
              intensity={2.2}
              color={colors.telemetry}
            />

            <Suspense fallback={null}>
              <Starfield radius={STAR_RADIUS} animate={!reducedMotion} />

              <group ref={groupRef}>
                <Earth radius={EARTH_RADIUS} scanEnabled={!reducedMotion} />
                <SiteMarkers
                  radius={EARTH_RADIUS}
                  sites={sites}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  animate={!reducedMotion}
                />
                {ORBITS.map((orbit) => (
                  <Satellite
                    key={orbit.id}
                    radius={orbit.radius}
                    earthRadius={EARTH_RADIUS}
                    inclinationDeg={orbit.inclinationDeg}
                    speed={orbit.speed}
                    paused={reducedMotion}
                  />
                ))}
              </group>
            </Suspense>
          </Canvas>
        )
      )}

      {webglReady !== false && !sceneReady && <SceneLoading />}
    </div>
  );
}

/** 첫 프레임이 나오기 전까지 덮어 두는 표시. 빈 검정 사각형을 막는다. */
function SceneLoading() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-space">
      <div className="flex flex-col items-center gap-3">
        <div className="size-10 animate-spin rounded-full border-2 border-space-border border-t-telemetry" />
        <p className="font-mono text-space-muted text-xs tracking-tight">
          관측 데이터를 불러오는 중
        </p>
      </div>
    </div>
  );
}

/**
 * WebGL 이 없을 때 대신 세우는 정적 지구본.
 *
 * 3D 를 흉내내지 않는다. 같은 색 언어(우주·궤도선·핫스팟)를 쓰되 납작한
 * 도식으로 보여주는 편이, 어설프게 입체인 척하는 것보다 정직하고 가볍다.
 */
function StaticGlobeFallback() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-space">
      <div className="relative size-64">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 32% 28%, var(--accent) 0%, var(--space) 72%)",
            boxShadow: "0 0 48px -12px var(--telemetry)",
          }}
        />
        <div className="absolute inset-0 rounded-full border border-space-border" />
        {/* 궤도선 2개 */}
        <div className="-inset-6 absolute rounded-full border border-space-border" />
        <div className="-inset-10 absolute rotate-45 rounded-full border border-space-border" />
        {/* 핫스팟 — 위치는 장식이다. 정확한 좌표는 3D 씬에서만 의미가 있다. */}
        <span className="absolute top-[38%] left-[46%] size-2 rounded-full bg-caution" />
        <span className="absolute top-[54%] left-[58%] size-2 rounded-full bg-unsuitable" />
        <span className="absolute top-[62%] left-[38%] size-2 rounded-full bg-telemetry" />
      </div>
    </div>
  );
}

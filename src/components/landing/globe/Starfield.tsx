import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Points } from "three";
import { useThemeColors } from "./palette";

/**
 * ---------------------------------------------
 * [Feature]: 배경 별
 *
 * [Description]
 * - 지구본 뒤에 깊이를 만드는 점 구름. 아주 느리게 회전해 정지 화면이 아님을
 *   알리되, 시선을 끌지는 않는다.
 * - **좌표는 useMemo 로 한 번만 만든다.** 렌더마다 Math.random 을 돌리면 별이
 *   매번 다른 자리로 튄다(리렌더 = 별자리 리셋). 게다가 수천 개 난수를
 *   프레임마다 뽑는 비용도 그냥 낭비다.
 * - 난수는 시드 고정 LCG 를 쓴다. 같은 별자리가 새로고침마다 재현되면
 *   스크린샷 비교나 디자인 리뷰에서 차이를 눈으로 잡을 수 있다.
 *
 * [Usage]
 * ```tsx
 * <Starfield radius={14} animate={!reducedMotion} />
 * ```
 * ---------------------------------------------
 */

interface StarfieldProps {
  /** 별 개수. 기본 1400 */
  count?: number;
  /** 별을 뿌릴 구껍질 반지름 */
  radius: number;
  /** 회전 여부. prefers-reduced-motion 이면 false */
  animate?: boolean;
}

/** 고정 시드. 값 자체에 의미는 없고, 재현성만 있으면 된다. */
const SEED = 20260912;
/** 한 바퀴에 수 분이 걸리는 속도. 이보다 빠르면 배경이 앞으로 나선다. */
const SPIN_SPEED = 0.008;

/**
 * 선형 합동 생성기(LCG). 0~1 난수를 돌려준다.
 *
 * 품질이 좋은 난수가 아니지만 배경 별에는 충분하고, 의존성이 0 이다.
 * 상수는 Numerical Recipes 의 값이다.
 */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function Starfield({
  count = 1400,
  radius,
  animate = true,
}: StarfieldProps) {
  const colors = useThemeColors();
  const pointsRef = useRef<Points>(null);

  const positions = useMemo(() => {
    const random = createRandom(SEED);
    const array = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      // 구면 균일 분포: z 를 균등하게 뽑아야 극에 별이 몰리지 않는다.
      const z = random() * 2 - 1;
      const theta = random() * Math.PI * 2;
      const ring = Math.sqrt(1 - z * z);
      // 껍질에 살짝 두께를 줘서 한 겹 벽처럼 보이지 않게 한다.
      const r = radius * (0.82 + random() * 0.18);

      array[i * 3] = ring * Math.cos(theta) * r;
      array[i * 3 + 1] = z * r;
      array[i * 3 + 2] = ring * Math.sin(theta) * r;
    }

    return array;
  }, [count, radius]);

  useFrame((_, delta) => {
    if (!animate || !pointsRef.current) return;
    pointsRef.current.rotation.y += delta * SPIN_SPEED;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={colors.muted}
        size={radius * 0.0045}
        sizeAttenuation
        transparent
        opacity={0.7}
        depthWrite={false}
      />
    </points>
  );
}

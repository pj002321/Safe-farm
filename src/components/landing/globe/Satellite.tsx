import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AdditiveBlending,
  FrontSide,
  type Group,
  type MeshBasicMaterial,
} from "three";
import { orbitPosition } from "@/features/monitoring/domain/geo";
import { useThemeColors } from "./palette";

/**
 * ---------------------------------------------
 * [Feature]: 궤도 위성 + 궤도선 + 스캔 콘
 *
 * [Description]
 * - 지구를 도는 위성 한 기와, 그 위성이 지표를 훑는 원뿔형 관측 범위를 그린다.
 * - 위치는 `geo.ts` 의 `orbitPosition` 만 쓴다. 여기서 삼각함수를 다시 쓰면
 *   위성과 마커의 축 규약이 어긋나 서로 다른 반구에 찍히게 된다.
 * - 궤도선은 `<lineLoop>` 로 그린다. `<line>` 은 SVG 의 동명 intrinsic 과
 *   타입이 충돌해 TS 에러가 나고, 어차피 닫힌 궤도라 LineLoop 가 의미도 맞다.
 * - 궤도 샘플 배열은 useMemo 로 고정한다(렌더마다 128점을 다시 계산할 이유가 없다).
 *
 * [Usage]
 * ```tsx
 * <Satellite radius={1.75} earthRadius={1.05} inclinationDeg={38} speed={0.05} paused={false} />
 * ```
 * ---------------------------------------------
 */

interface SatelliteProps {
  /** 궤도 반지름 (씬 단위) */
  radius: number;
  /**
   * 지구 반지름. 스캔 콘이 지표에 정확히 닿게 하려면 필요하다.
   * 궤도 반지름에서 역산하면 지구 크기를 바꿀 때마다 콘이 떠 버린다.
   */
  earthRadius: number;
  /** 궤도 경사각 (도) */
  inclinationDeg: number;
  /** 초당 공전 횟수 */
  speed: number;
  /** true 면 위치 갱신과 맥동을 멈춘다 */
  paused: boolean;
}

/** 궤도선 샘플 수. 128점이면 이 크기에서 각진 곳이 보이지 않는다. */
const ORBIT_SEGMENTS = 128;

export function Satellite({
  radius,
  earthRadius,
  inclinationDeg,
  speed,
  paused,
}: SatelliteProps) {
  const colors = useThemeColors();
  const groupRef = useRef<Group>(null);
  const coneMaterialRef = useRef<MeshBasicMaterial>(null);
  const phase = useRef(0);
  const elapsed = useRef(0);

  const orbitPoints = useMemo(() => {
    const array = new Float32Array(ORBIT_SEGMENTS * 3);
    for (let i = 0; i < ORBIT_SEGMENTS; i += 1) {
      const p = orbitPosition(i / ORBIT_SEGMENTS, radius, inclinationDeg);
      array[i * 3] = p.x;
      array[i * 3 + 1] = p.y;
      array[i * 3 + 2] = p.z;
    }
    return array;
  }, [radius, inclinationDeg]);

  // 위성 몸체 치수는 궤도 반지름에 비례시킨다. 절대값으로 박으면 지구본
  // 크기를 바꿀 때 위성만 혼자 커지거나 사라진다.
  const bodySize = radius * 0.038;
  const coneHeight = radius - earthRadius;
  const coneRadius = earthRadius * 0.22;

  useFrame((_, delta) => {
    const group = groupRef.current;
    if (!group) return;

    if (!paused) {
      phase.current += delta * speed;
      elapsed.current += delta;
    }

    // paused 여도 위치는 매번 써 넣는다. 위상만 멈추는 것이 목적이고,
    // 건너뛰면 위성이 원점(지구 중심)에 박힌 채로 첫 프레임이 나간다.
    const p = orbitPosition(phase.current, radius, inclinationDeg);
    group.position.set(p.x, p.y, p.z);
    // lookAt 은 오브젝트의 로컬 +Z 를 대상 쪽으로 돌린다. 아래 자식들의
    // 방향(+Z = 지구 쪽)은 전부 이 규약에 기대고 있다.
    group.lookAt(0, 0, 0);

    if (coneMaterialRef.current) {
      // 관측 빔이 살아 있다는 신호. 진폭을 작게 둬야 깜빡이로 보이지 않는다.
      coneMaterialRef.current.opacity =
        0.05 + 0.02 * Math.sin(elapsed.current * 2.1);
    }
  });

  return (
    <group>
      {/* 궤도선 */}
      <lineLoop>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[orbitPoints, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color={colors.telemetry}
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </lineLoop>

      <group ref={groupRef}>
        {/* 본체 */}
        <mesh>
          <boxGeometry args={[bodySize, bodySize, bodySize * 1.4]} />
          <meshStandardMaterial
            color={colors.muted}
            metalness={0.6}
            roughness={0.35}
          />
        </mesh>

        {/* 태양전지판 2장 */}
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * bodySize * 1.9, 0, 0]}>
            <boxGeometry args={[bodySize * 2.6, bodySize * 0.08, bodySize]} />
            <meshStandardMaterial
              color={colors.accent}
              metalness={0.4}
              roughness={0.5}
              emissive={colors.accent}
              emissiveIntensity={0.25}
            />
          </mesh>
        ))}

        {/* 안테나 — 지구 반대쪽(-Z)을 향하는 짧은 원뿔 */}
        <mesh
          position={[0, 0, -bodySize * 1.1]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <coneGeometry args={[bodySize * 0.3, bodySize * 0.9, 12]} />
          <meshStandardMaterial color={colors.muted} metalness={0.5} />
        </mesh>

        {/* 스캔 콘 — 꼭짓점이 위성, 밑면이 지표.
            DoubleSide + 가산합성은 앞뒷면이 두 번 더해져 불투명한 유리판처럼
            보인다. FrontSide 로 한 겹만 그리고 불투명도를 낮게 유지한다.
            기본 cone 은 축이 +Y 이고 꼭짓점이 +Y 쪽이다. X 로 -90° 돌리면
            꼭짓점이 -Z 로 가므로, 다시 높이의 절반만큼 +Z 로 밀어
            꼭짓점을 위성 원점에 맞춘다. */}
        <mesh position={[0, 0, coneHeight / 2]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[coneRadius, coneHeight, 32, 1, true]} />
          <meshBasicMaterial
            ref={coneMaterialRef}
            color={colors.telemetry}
            transparent
            opacity={0.05}
            side={FrontSide}
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      </group>
    </group>
  );
}

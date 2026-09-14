import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, BackSide, Color, DoubleSide } from "three";
import { useThemeColors } from "./palette";
import {
  ATMOSPHERE_FRAGMENT,
  ATMOSPHERE_VERTEX,
  EARTH_FRAGMENT,
  EARTH_VERTEX,
} from "./shaders";

/**
 * ---------------------------------------------
 * [Feature]: 지구 구체 + 대기광 + 궤도면 링
 *
 * [Description]
 * - 지구본의 바탕. 본체 구·대기 껍질·적도 링 세 덩어리로만 이루어진다.
 * - **uniform 객체는 useMemo 로 한 번만 만든다.** React Compiler 가 켜져 있어도
 *   three 객체의 참조 동일성까지 보장해 주지는 않는다. 매 렌더마다 새 uniforms 를
 *   넘기면 three 가 셰이더 프로그램을 다시 컴파일해 프레임이 튄다.
 * - 색은 uniform 안의 Color 인스턴스에 `copy` 로 덮어쓴다. 새 Color 를 대입하면
 *   위와 같은 이유로 참조가 깨진다.
 * - `scanEnabled=false`(모션 최소화)면 스캔 밴드를 적도에 고정한다. 없애지 않는
 *   이유는, 밴드가 사라지면 "관측 중"이라는 의미까지 같이 사라지기 때문이다.
 *
 * [Usage]
 * ```tsx
 * <Earth radius={1.05} scanEnabled={!reducedMotion} />
 * ```
 * ---------------------------------------------
 */

interface EarthProps {
  /** 지구 반지름 (씬 단위) */
  radius: number;
  /** 스캔 밴드를 움직일지 여부. prefers-reduced-motion 이면 false */
  scanEnabled: boolean;
}

/** 스캔 밴드가 남극 → 북극을 한 번 훑는 데 걸리는 시간(초)의 역수. */
const SCAN_SPEED = 0.07;
/** 모션을 끈 상태에서 밴드를 세워 둘 위도(uv.y 기준 = 적도). */
const SCAN_PARKED = 0.5;

export function Earth({ radius, scanEnabled }: EarthProps) {
  const colors = useThemeColors();
  const scanPhase = useRef(SCAN_PARKED);

  // 두 셰이더의 uniform. 마운트 동안 같은 객체를 유지해야 한다(상단 주석 참고).
  const earthUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uScan: { value: SCAN_PARKED },
      uLand: { value: new Color() },
      uVeg: { value: new Color() },
      uOcean: { value: new Color() },
      uGrid: { value: new Color() },
      uRim: { value: new Color() },
      uOpacity: { value: 1 },
    }),
    [],
  );

  const atmosphereUniforms = useMemo(
    () => ({
      uColor: { value: new Color() },
      uIntensity: { value: 0.48 },
    }),
    [],
  );

  useEffect(() => {
    // 육지는 NDVI false-color 의 두 끝을 쓴다: 나지(점토) → 밀생(라임).
    // 점토색을 원본 밝기로 쓰면 관측 인터페이스가 아니라 지구본 장난감이 된다.
    earthUniforms.uLand.value.copy(colors.earth).multiplyScalar(0.42);
    earthUniforms.uVeg.value.copy(colors.telemetry).multiplyScalar(0.55);
    // 바다는 우주색에 브랜드 인디고를 살짝 섞어, 검정으로 죽지 않게 한다.
    earthUniforms.uOcean.value.copy(colors.space).lerp(colors.accent, 0.18);
    earthUniforms.uGrid.value.copy(colors.accent);
    earthUniforms.uRim.value.copy(colors.telemetry);
    atmosphereUniforms.uColor.value.copy(colors.telemetry);
  }, [colors, earthUniforms, atmosphereUniforms]);

  useFrame((_, delta) => {
    earthUniforms.uTime.value += delta;

    if (scanEnabled) {
      scanPhase.current = (scanPhase.current + delta * SCAN_SPEED) % 1;
      earthUniforms.uScan.value = scanPhase.current;
    } else {
      earthUniforms.uScan.value = SCAN_PARKED;
    }
  });

  return (
    <group>
      {/* 본체 */}
      <mesh>
        <sphereGeometry args={[radius, 96, 96]} />
        <shaderMaterial
          uniforms={earthUniforms}
          vertexShader={EARTH_VERTEX}
          fragmentShader={EARTH_FRAGMENT}
        />
      </mesh>

      {/* 대기광 — 본체보다 조금 큰 구를 안쪽에서 본다.
          depthWrite 를 끄지 않으면 뒤쪽 마커와 궤도선이 잘려 나간다. */}
      <mesh>
        <sphereGeometry args={[radius * 1.035, 64, 64]} />
        <shaderMaterial
          uniforms={atmosphereUniforms}
          vertexShader={ATMOSPHERE_VERTEX}
          fragmentShader={ATMOSPHERE_FRAGMENT}
          side={BackSide}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>

      {/* 적도면 링 — 위성 궤도가 어느 평면을 도는지 읽히게 하는 기준선.
          DoubleSide 가 아니면 카메라가 적도 아래로 내려갔을 때 사라진다. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius * 1.3, radius * 1.312, 160]} />
        <meshBasicMaterial
          color={colors.telemetry}
          transparent
          opacity={0.18}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import {
  type Color,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  Vector3,
} from "three";
import { latLonToVec3 } from "@/features/monitoring/domain/geo";
import {
  HAZARDS,
  type HazardMeta,
  type ObservationSite,
} from "@/features/monitoring/domain/hazards";
import { type GlobeColors, useThemeColors } from "./palette";

/**
 * ---------------------------------------------
 * [Feature]: 관측 지점 핫스팟 마커
 *
 * [Description]
 * - 관측 지점을 지구 표면에 찍고, 재해 심각도에 따라 색을 나눈다. 색은
 *   hazards.ts 의 `toneToken` 을 그대로 따르므로, 재해 분류를 바꾸면 지구본도
 *   자동으로 따라온다(여기서 색을 다시 정하지 않는다).
 * - **지구 뒤편 마커는 흐려진다.** 3D 에서 작은 점은 깊이 테스트만으로 가려지지
 *   않고 대기광·반투명 재질을 뚫고 그대로 보인다. 그러면 앞뒤 구분이 사라져
 *   지구가 유리구슬처럼 싸구려로 보인다. 그래서 매 프레임 법선과 시선의 내적으로
 *   앞/뒤를 판정해 불투명도를 직접 낮춘다.
 * - 마커 선택은 3D 밖의 버튼으로도 가능해야 하므로(키보드 접근), 여기서는
 *   포인터 입력만 다룬다. 커서 변경은 언마운트 시 반드시 되돌린다 —
 *   안 그러면 지구본이 사라진 뒤에도 페이지 전체가 손가락 커서로 남는다.
 *
 * [Usage]
 * ```tsx
 * <SiteMarkers radius={1.05} sites={OBSERVATION_SITES}
 *   selectedId={selected} onSelect={setSelected} animate />
 * ```
 * ---------------------------------------------
 */

interface SiteMarkersProps {
  /** 지구 반지름 (마커는 이보다 살짝 바깥에 놓인다) */
  radius: number;
  sites: readonly ObservationSite[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 링 맥동 여부. prefers-reduced-motion 이면 false */
  animate: boolean;
}

/** 링 2개의 시작 위상. 어긋나게 둬야 물결이 이어져 보인다. */
const RING_PHASES = [0, 0.5] as const;
/** 링이 한 번 퍼지는 데 걸리는 시간의 역수(초당 사이클). */
const RING_SPEED = 0.42;

/**
 * 프레임마다 쓰는 임시 벡터. 콜백 안에서 즉시 소비되고 프레임을 넘기지 않으므로
 * 모듈 상수로 공유해도 안전하다. 마커마다 new Vector3 을 만들면 GC 가 매 프레임
 * 돌아 스크롤이 끊긴다.
 */
const WORLD_POSITION = new Vector3();
const TO_CAMERA = new Vector3();

/** 재해 색 토큰 → 실제 팔레트. hazards.ts 가 색의 단일 출처다. */
function toneColor(colors: GlobeColors, tone: HazardMeta["toneToken"]): Color {
  if (tone === "caution") return colors.caution;
  if (tone === "unsuitable") return colors.unsuitable;
  if (tone === "info") return colors.info;
  return colors.telemetry;
}

interface SiteMarkerProps {
  site: ObservationSite;
  radius: number;
  color: Color;
  selected: boolean;
  onSelect: (id: string) => void;
  animate: boolean;
}

function SiteMarker({
  site,
  radius,
  color,
  selected,
  onSelect,
  animate,
}: SiteMarkerProps) {
  const groupRef = useRef<Group>(null);
  const ringsRef = useRef<Group>(null);
  const coreMaterialRef = useRef<MeshBasicMaterial>(null);
  const elapsed = useRef(0);

  // 마커를 지표에서 1% 띄운다. 딱 붙이면 구면과 z-fighting 이 난다.
  const position = latLonToVec3(site.coord, radius * 1.01);
  const coreRadius = radius * (selected ? 0.019 : 0.012);
  const ringInner = radius * 0.02;
  const ringOuter = radius * 0.026;

  useEffect(() => {
    // 포인터가 마커 위에 있는 동안 언마운트되면 onPointerOut 이 오지 않는다.
    // 커서 복구를 여기서 한 번 더 보장한다.
    return () => {
      document.body.style.cursor = "";
    };
  }, []);

  useFrame(({ camera }, delta) => {
    const group = groupRef.current;
    if (!group) return;

    elapsed.current += delta;

    // 앞/뒤 판정: 마커의 바깥 법선과 "마커 → 카메라" 방향의 내적.
    // 지구 중심이 씬 원점이므로 월드 위치의 방향이 곧 법선이다.
    group.getWorldPosition(WORLD_POSITION);
    TO_CAMERA.copy(camera.position).sub(WORLD_POSITION).normalize();
    const facing = WORLD_POSITION.normalize().dot(TO_CAMERA);
    // -0.12 ~ 0.28 구간에서 서서히 넘긴다. 딱 자르면 실루엣에서 깜빡인다.
    const front = Math.min(1, Math.max(0, (facing + 0.12) / 0.4));

    if (coreMaterialRef.current) {
      coreMaterialRef.current.opacity = 0.06 + 0.94 * front;
    }

    const rings = ringsRef.current;
    if (!rings) return;

    // 링은 항상 카메라를 마주봐야 원으로 보인다. lookAt 은 부모 회전을
    // 보정해 주므로, 회전하는 지구 안에서도 그대로 쓸 수 있다.
    rings.lookAt(camera.position);

    for (let i = 0; i < rings.children.length; i += 1) {
      const ring = rings.children[i] as Mesh;
      const material = ring.material as MeshBasicMaterial;
      const phase = animate
        ? (elapsed.current * RING_SPEED + RING_PHASES[i]) % 1
        : RING_PHASES[i];

      ring.scale.setScalar(1 + phase * 2.4);
      material.opacity = (1 - phase) * (selected ? 0.7 : 0.45) * front;
    }
  });

  const handleOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    document.body.style.cursor = "pointer";
  };

  const handleOut = () => {
    document.body.style.cursor = "";
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    onSelect(site.id);
  };

  return (
    <group ref={groupRef} position={[position.x, position.y, position.z]}>
      {/* 핵 */}
      <mesh>
        <sphereGeometry args={[coreRadius, 16, 16]} />
        <meshBasicMaterial
          ref={coreMaterialRef}
          color={color}
          transparent
          depthWrite={false}
        />
      </mesh>

      {/* 퍼지는 링 */}
      <group ref={ringsRef}>
        {RING_PHASES.map((phase) => (
          <mesh key={phase}>
            <ringGeometry args={[ringInner, ringOuter, 48]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>

      {/* 히트 영역 — 핵만으로는 모바일에서 누르기 어렵다.
          visible={false} 대신 opacity 0 을 쓰는 이유는, 보이지 않는 오브젝트가
          레이캐스트에서 빠지는 구현이 있어 클릭이 통째로 죽을 수 있어서다. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: three.js 요소다. DOM 이 아니라 role 을 줄 수 없고, 키보드 경로는 부모의 목록 버튼이 담당한다 */}
      <mesh
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[radius * 0.036, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function SiteMarkers({
  radius,
  sites,
  selectedId,
  onSelect,
  animate,
}: SiteMarkersProps) {
  const colors = useThemeColors();

  return (
    <group>
      {sites.map((site) => (
        <SiteMarker
          key={site.id}
          site={site}
          radius={radius}
          color={toneColor(colors, HAZARDS[site.hazard].toneToken)}
          selected={site.id === selectedId}
          onSelect={onSelect}
          animate={animate}
        />
      ))}
    </group>
  );
}

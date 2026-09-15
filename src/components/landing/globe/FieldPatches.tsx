import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  Color,
  type InstancedMesh,
  type MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import { generateFieldPatches } from "@/features/monitoring/domain/fieldPatches";
import { latLonToVec3 } from "@/features/monitoring/domain/geo";
import { useThemeColors } from "./palette";

/**
 * ---------------------------------------------
 * [Feature]: 지구본 위의 경작지 패치
 *
 * [Description]
 * - 랜딩이 "위성이 보는 땅"을 말하는데 지구본에는 재해 마커 몇 개뿐이라 정작
 *   농지가 화면에 없었다. 한반도 곡창지대에 **불규칙한 필지**를 뿌려 그 말을
 *   그림으로 잇는다.
 * - **작물 그림을 그리지 않는다.** 잎사귀·트랙터는 클립아트로 읽히고, 이
 *   프로젝트의 색 언어는 지구관측 인터페이스다(`FieldGutter` 와 같은 방침).
 *   대신 NDVI false-color 를 축약해 흙빛↔라임 사이로 칠한다 — 위성 영상에서
 *   식생이 건강할수록 라임으로 나오는 그 규칙이다.
 *
 * - **앞뒤 판정을 직접 하지 않는다.** 패치는 지표에 접하는 평면이라 지구 뒤편에
 *   있으면 법선이 카메라 반대를 향하고, `side: FrontSide`(기본값)면 그대로
 *   컬링된다. `SiteMarkers` 는 구(球)라 컬링이 안 통해 매 프레임 내적을
 *   계산하지만, 평면은 그 계산이 공짜다.
 * - 그래서 **매 프레임 도는 계산이 없다.** 행렬과 색은 마운트 때 한 번만 쓰고,
 *   움직임은 재질 불투명도 하나만 흔든다. 인스턴스 90개를 개별 mesh 로 만들면
 *   draw call 이 90개가 되지만 `InstancedMesh` 는 하나다.
 * - `prefers-reduced-motion` 이면 숨쉬기도 멈춘다(`animate={false}`).
 *
 * [Usage]
 * ```tsx
 * <FieldPatches radius={EARTH_RADIUS} animate={!reducedMotion} />
 * ```
 * ---------------------------------------------
 */

interface FieldPatchesProps {
  /** 지구 반지름. 패치는 이보다 아주 살짝 바깥에 놓인다. */
  radius: number;
  /** 숨쉬기 여부. prefers-reduced-motion 이면 false. */
  animate: boolean;
}

/** 패치 한 변의 기준 길이(반지름 대비). 너무 크면 타일 바닥처럼 보인다. */
const BASE_SIZE = 0.024;

/** 숨쉬기 주기(초당 사이클)와 진폭. 데이터가 갱신되는 듯한 아주 옅은 맥동. */
const BREATH_SPEED = 0.18;
const BREATH_DEPTH = 0.12;
const BASE_OPACITY = 0.55;

/** 평면 지오메트리의 법선. 이 축을 지표 법선으로 돌린다. */
const PLANE_NORMAL = new Vector3(0, 0, 1);

export function FieldPatches({ radius, animate }: FieldPatchesProps) {
  const meshRef = useRef<InstancedMesh>(null);
  const materialRef = useRef<MeshBasicMaterial>(null);
  const elapsed = useRef(0);
  const colors = useThemeColors();

  const patches = useMemo(() => generateFieldPatches(), []);

  // 행렬·색은 한 번만 쓴다. 지구가 도는 것은 부모 group 의 회전이라
  // 인스턴스를 다시 계산할 일이 없다.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const dummy = new Object3D();
    const normal = new Vector3();
    const quaternion = new Quaternion();
    const spin = new Quaternion();
    const color = new Color();

    patches.forEach((patch, index) => {
      // 지표에서 0.5% 띄운다. 딱 붙이면 구면과 z-fighting 으로 지직거린다.
      const position = latLonToVec3(patch.coord, radius * 1.005);
      normal.set(position.x, position.y, position.z).normalize();

      // 평면의 +Z 를 지표 법선에 맞추고, 그 축으로 한 번 더 돌려
      // 필지가 격자처럼 줄 서지 않게 한다.
      quaternion.setFromUnitVectors(PLANE_NORMAL, normal);
      spin.setFromAxisAngle(normal, patch.spinRad);
      quaternion.multiply(spin);

      dummy.position.set(position.x, position.y, position.z);
      dummy.quaternion.copy(quaternion);
      dummy.scale.setScalar(radius * BASE_SIZE * patch.sizeScale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);

      // 활력이 낮으면 흙빛, 높으면 라임. NDVI false-color 의 축약이다.
      color.copy(colors.earth).lerp(colors.telemetry, patch.vigor);
      // 관측 지역은 한 번 더 밝힌다. 세계 곡창지대를 옅게 깔았으므로, 밝기
      // 차이가 곧 "우리가 보는 곳"을 말한다. 크기는 generateFieldPatches 가 키운다.
      if (!patch.home) color.multiplyScalar(0.62);
      mesh.setColorAt(index, color);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [patches, radius, colors]);

  useFrame((_, delta) => {
    const material = materialRef.current;
    if (!material) return;

    if (!animate) {
      material.opacity = BASE_OPACITY;
      return;
    }

    elapsed.current += delta;
    material.opacity =
      BASE_OPACITY +
      Math.sin(elapsed.current * BREATH_SPEED * Math.PI * 2) * BREATH_DEPTH;
  });

  return (
    <instancedMesh
      // key 로 개수를 묶는다. args 의 개수는 마운트 때 정해지므로, 개수가
      // 바뀌면 새로 만들어야 버퍼 크기가 맞는다.
      args={[undefined, undefined, patches.length]}
      key={patches.length}
      ref={meshRef}
    >
      <planeGeometry args={[1, 1]} />
      {/*
        depthWrite 를 끈다. 반투명 패치끼리 깊이를 쓰면 그리는 순서에 따라
        뒤엣것이 사라진다. 대기광·마커와 같은 방침이다.
      */}
      <meshBasicMaterial
        depthWrite={false}
        ref={materialRef}
        toneMapped={false}
        transparent
      />
    </instancedMesh>
  );
}

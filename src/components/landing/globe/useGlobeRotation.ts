"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
} from "react";
import type { Group } from "three";

/**
 * ---------------------------------------------
 * [Feature]: 지구본 드래그 회전 + 관성 + 자동회전
 *
 * [Description]
 * - 지구본 그룹의 yaw/pitch 를 직접 굴린다. 회전값을 React state 로 두지 않는 것이
 *   핵심이다 — 프레임마다 setState 를 하면 60fps 로 리렌더가 돌아 입력이 밀린다.
 * - **핸들러는 Canvas 를 감싼 div 에 붙인다.** 3D 오브젝트 이벤트로 받으면
 *   지구 바깥(빈 공간)에서 시작한 드래그가 잡히지 않고, 포인터가 구체를 벗어나는
 *   순간 회전이 끊긴다.
 * - 호출부는 그 div 에 `touch-action: none` 을 줘야 한다. 없으면 모바일에서
 *   지구본을 돌리려는 제스처가 페이지 스크롤로 먹힌다.
 * - rAF 루프는 할 일이 없으면(드래그 중 아니고, 관성 0, 자동회전 꺼짐) 스스로
 *   멈춘다. 화면 밖 지구본이 메인 스레드를 계속 깨우지 않게 하기 위해서다.
 *
 * [Usage]
 * ```tsx
 * const { groupRef, handlers } = useGlobeRotation({ autoSpeed: 0.06, enabled: !reducedMotion });
 * <div {...handlers} style={{ touchAction: "none" }}>
 *   <Canvas><group ref={groupRef}>...</group></Canvas>
 * </div>
 * ```
 * ---------------------------------------------
 */

interface GlobeRotationOptions {
  /** 자동회전 각속도 (rad/s) */
  autoSpeed: number;
  /** 자동회전 사용 여부. false 여도 드래그는 계속 된다 */
  enabled: boolean;
}

interface GlobeRotationHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

/** 픽셀 이동량 → 라디안. 화면 폭 절반을 끌면 반 바퀴쯤 돈다. */
const DRAG_SENSITIVITY = 0.006;
/** 위/아래로 넘어가 지구가 뒤집히는 것을 막는 한계각. */
const PITCH_LIMIT = 0.6;
/** 60fps 기준 프레임당 감속률. 프레임레이트와 무관하게 만들려고 지수로 쓴다. */
const FRICTION_PER_FRAME = 0.94;
/** 이보다 느려지면 관성을 끄고 자동회전으로 넘긴다 (rad/s). */
const IDLE_VELOCITY = 0.004;

export function useGlobeRotation({ autoSpeed, enabled }: GlobeRotationOptions) {
  const groupRef = useRef<Group>(null);

  const motion = useRef({
    yaw: 0,
    pitch: 0,
    yawVelocity: 0,
    pitchVelocity: 0,
    dragging: false,
    lastX: 0,
    lastY: 0,
  });

  // 캡처 해제를 위해 잡고 있는 대상. 언마운트 시 반드시 풀어야 한다.
  const capture = useRef<{ element: HTMLElement; pointerId: number } | null>(
    null,
  );

  const frame = useRef<number | null>(null);
  const lastTime = useRef(0);
  // 콜백 안에서 최신 옵션을 봐야 하는데, rAF 루프는 한 번만 만들어진다.
  const options = useRef({ autoSpeed, enabled });

  const ensureLoop = useRef<() => void>(() => {});

  useEffect(() => {
    const tick = (time: number) => {
      const state = motion.current;
      const { autoSpeed: speed, enabled: autoEnabled } = options.current;

      const delta =
        lastTime.current === 0 ? 0 : (time - lastTime.current) / 1000;
      lastTime.current = time;
      // 탭이 백그라운드에 다녀오면 delta 가 수 초로 튄다. 그대로 곱하면
      // 지구본이 한 프레임에 몇 바퀴를 돈다.
      const step = Math.min(delta, 0.05);

      if (!state.dragging) {
        const friction = FRICTION_PER_FRAME ** (step * 60);
        state.yawVelocity *= friction;
        state.pitchVelocity *= friction;

        if (Math.abs(state.yawVelocity) < IDLE_VELOCITY) state.yawVelocity = 0;
        if (Math.abs(state.pitchVelocity) < IDLE_VELOCITY) {
          state.pitchVelocity = 0;
        }

        state.yaw += state.yawVelocity * step;
        state.pitch += state.pitchVelocity * step;

        // 관성이 다 죽은 뒤에만 자동회전이 이어받는다. 같이 더하면
        // 손으로 반대로 돌렸을 때 지구가 끌려가듯 되돌아간다.
        if (autoEnabled && state.yawVelocity === 0) {
          state.yaw += speed * step;
        }
      }

      state.pitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, state.pitch));

      const group = groupRef.current;
      if (group) {
        group.rotation.y = state.yaw;
        group.rotation.x = state.pitch;
      }

      const busy =
        state.dragging ||
        state.yawVelocity !== 0 ||
        state.pitchVelocity !== 0 ||
        (autoEnabled && speed !== 0);

      frame.current = busy ? requestAnimationFrame(tick) : null;
      if (!busy) lastTime.current = 0;
    };

    ensureLoop.current = () => {
      if (frame.current !== null) return;
      lastTime.current = 0;
      frame.current = requestAnimationFrame(tick);
    };

    ensureLoop.current();

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;

      // 포인터를 잡은 채 언마운트되면 브라우저가 계속 이 엘리먼트로 이벤트를
      // 보낸다. 캡처는 컴포넌트 수명과 무관하게 해제해야 한다.
      const held = capture.current;
      if (held?.element.hasPointerCapture(held.pointerId)) {
        held.element.releasePointerCapture(held.pointerId);
      }
      capture.current = null;
    };
  }, []);

  // 옵션 갱신은 렌더가 아니라 커밋 후에 한다(렌더 중 ref 변경은 부작용이다).
  // 자동회전이 다시 켜졌다면 멈춰 있던 루프도 여기서 되살린다.
  useEffect(() => {
    options.current = { autoSpeed, enabled };
    if (enabled) ensureLoop.current();
  }, [autoSpeed, enabled]);

  const releaseCapture = () => {
    const held = capture.current;
    if (held?.element.hasPointerCapture(held.pointerId)) {
      held.element.releasePointerCapture(held.pointerId);
    }
    capture.current = null;
  };

  const endDrag = () => {
    if (!motion.current.dragging) return;
    motion.current.dragging = false;
    releaseCapture();
    ensureLoop.current();
  };

  const handlers: GlobeRotationHandlers = {
    onPointerDown: (event) => {
      const element = event.currentTarget;
      element.setPointerCapture(event.pointerId);
      capture.current = { element, pointerId: event.pointerId };

      const state = motion.current;
      state.dragging = true;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      state.yawVelocity = 0;
      state.pitchVelocity = 0;

      ensureLoop.current();
    },
    onPointerMove: (event) => {
      const state = motion.current;
      if (!state.dragging) return;

      const dx = event.clientX - state.lastX;
      const dy = event.clientY - state.lastY;
      state.lastX = event.clientX;
      state.lastY = event.clientY;

      state.yaw += dx * DRAG_SENSITIVITY;
      state.pitch += dy * DRAG_SENSITIVITY;

      // 놓았을 때 쓸 속도. 프레임 간격으로 나누지 않고 상수 배율을 쓰는 이유는,
      // pointermove 가 프레임과 1:1 로 오지 않아 나누면 값이 심하게 튀기 때문이다.
      state.yawVelocity = dx * DRAG_SENSITIVITY * 18;
      state.pitchVelocity = dy * DRAG_SENSITIVITY * 18;
    },
    onPointerUp: endDrag,
    onPointerLeave: endDrag,
    onPointerCancel: endDrag,
  };

  return { groupRef, handlers };
}

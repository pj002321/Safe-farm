"use client";

import { ErrorState } from "@/components/shared/ErrorState";

/**
 * ---------------------------------------------
 * [Feature]: (app) 구간 오류 경계
 *
 * [Description]
 * - Next 의 `error.tsx` 는 **클라이언트 컴포넌트여야** 하고, 이 파일이 감싸는
 *   구간에서 렌더 중 던진 오류를 받는다. 화면 자체는 ErrorState 가 그린다.
 * - ⚠️ **레이아웃에서 난 오류는 여기서 못 잡는다.** 같은 구간의 layout.tsx 는
 *   이 경계 바깥이기 때문이다. 로그인·동의 검사가 던지면 상위로 올라간다.
 * ---------------------------------------------
 */
export default function AppError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState {...props} />;
}

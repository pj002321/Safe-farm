"use client";

import { ErrorState } from "@/components/shared/ErrorState";

/**
 * ---------------------------------------------
 * [Feature]: (admin) 구간 오류 경계
 *
 * [Description]
 * - `accounts.ts` 는 설정·네트워크 오류를 **일부러 던진다** — 삼키면 키가 틀려도
 *   "없는 사람" 으로 보여 아무도 눈치 못 채기 때문이다. 받는 경계가 없으면 그 던짐이
 *   Next 의 맨 오류 화면(셸도 메뉴도 없는)으로 떨어져 던진 보람이 없다.
 * - 화면은 `ErrorState` 가 그린다. 돌아갈 곳만 관리자 홈으로 바꾼다 — 기본값
 *   `/dashboard` 는 사용자 화면이라, 관리자가 갇힌 곳에서 나가는 문이 아니다.
 * - ⚠️ **레이아웃에서 난 오류는 여기서 못 잡는다.** `(admin)/layout.tsx` 는 이 경계
 *   바깥이다. `requireAdminOrRedirect` 가 던지면 상위로 올라간다.
 * ---------------------------------------------
 */
export default function AdminError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      {...props}
      backHref="/admin"
      backKo="관리자 홈으로"
      whatKo="관리자 화면을 불러오지 못했습니다"
    />
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/shared/Button";
import { signOutEverywhere } from "@/shared/auth/supabaseSignIn";

/**
 * ---------------------------------------------
 * [Feature]: 탈퇴 버튼 — **지금은 로그아웃만 한다**
 *
 * [Description]
 * - ⚠️ 이름이 탈퇴지만 동작은 로그아웃이다. 계정 삭제가 아직 붙지 않았고,
 *   그 사실을 `WithdrawPanel` 이 화면에서 분명히 말한다. 라벨을 "탈퇴"로 두고
 *   조용히 로그아웃만 하면 사용자는 계정이 사라진 줄 알고 떠난다 — 그게 이
 *   기능에서 가장 나쁜 결과라, 버튼 글자도 실제 동작대로 적는다.
 *
 * - **삭제를 붙일 때 고칠 곳은 여기 하나다.** `handleClick` 이
 *   `supabase.rpc("delete_own_account")` 를 부르고, 그다음 로그아웃하면 된다.
 *   지울 대상을 파라미터로 받지 않는 `security definer` 함수여야 한다 —
 *   `auth.uid()` 로 고정해야 남의 계정을 지울 입력 자체가 없다.
 *   ⚠️ 그때 `features/legal/domain/privacy.ts` 6조도 같은 커밋에서 고칠 것.
 *      지금 방침은 익명화 보존을 허용하지 않는다.
 *
 * - `SignOutButton` 과 같은 이유로 클라이언트 컴포넌트다: 서버 쿠키만 지우면
 *   브라우저 SDK 는 여전히 로그인 상태라, 다음 인증 시도가 이전 계정으로 조용히
 *   이어진다. 양쪽을 함께 끊는 일은 브라우저에서만 할 수 있다.
 *   그 버튼을 그대로 쓰지 않는 이유는 라벨·variant·이동 경로가 달라서다.
 *
 * [Usage]
 * ```tsx
 * <WithdrawButton />
 * ```
 * ---------------------------------------------
 */

export function WithdrawButton() {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  const handleClick = async () => {
    setPending(true);
    try {
      await signOutEverywhere();
      // 랜딩으로 보낸다. 로그아웃 뒤 앱 화면에 남아 있으면 게이트가 다시 로그인
      // 화면으로 튕기는데, 나가려던 사람에게는 그게 실패로 읽힌다.
      router.replace("/");
      // 없으면 서버 컴포넌트가 캐시된 로그인 상태를 계속 보여준다.
      router.refresh();
    } catch {
      setPending(false);
    }
  };

  return (
    <Button
      loading={pending}
      onClick={handleClick}
      size="sm"
      type="button"
      variant="outline"
    >
      로그아웃하고 나가기
    </Button>
  );
}

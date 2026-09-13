import { AlertTriangleIcon } from "@/components/icons";

/**
 * ---------------------------------------------
 * [Feature]: 인증 실패 안내 박스
 *
 * [Description]
 * - 인증이 클라이언트로 내려오면서 실패 문구를 보여 줄 곳이 셋으로 늘었다
 *   (로그인 폼 · 가입 폼 · 구글 버튼). 예전에는 `?error=` 로 왕복해 페이지가
 *   한 번만 그렸지만, 이제는 각 폼이 자기 자리에서 보여준다. 같은 마크업을
 *   세 번 적으면 그중 하나는 반드시 `role="alert"` 를 빠뜨린다.
 * - `role="alert"` 가 핵심이다. 색과 아이콘만으로는 스크린리더 사용자가
 *   제출이 실패한 사실 자체를 모른 채 버튼만 다시 누르게 된다.
 * - `message` 가 없으면 아무것도 그리지 않는다. 부르는 쪽에서 조건 분기를
 *   반복하지 않게 하려는 의도다.
 *
 * [Usage]
 * ```tsx
 * <AuthError message={error} />
 * ```
 * ---------------------------------------------
 */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      className="flex items-start gap-2.5 rounded-md border border-unsuitable/30 bg-unsuitable/10 px-4 py-3 text-sm text-unsuitable"
      role="alert"
    >
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

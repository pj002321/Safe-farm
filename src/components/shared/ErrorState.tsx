"use client";

import { AlertTriangleIcon } from "@/components/icons";
import { Button, ButtonLink } from "@/components/shared/Button";

/**
 * ---------------------------------------------
 * [Feature]: 오류 화면 (원인 · 해결 방법 · 재시도)
 *
 * [Description]
 * - 정의서가 **원인과 해결 방법을 명시하고 재시도 버튼을 제공**하라고 한다.
 *   "오류가 발생했습니다"만 띄우면 사용자는 새로고침 말고 할 수 있는 게 없다.
 * - ⚠️ **오류 원문을 화면에 그대로 내보내지 않는다.** 스택과 예외 메시지에는
 *   내부 경로·접속 문자열·설정 상태가 섞여 나온다. 사용자에게는 우리 문구를
 *   보여 주고 원문은 콘솔로만 보낸다.
 * - `digest` 는 보여 준다. 서버 로그와 이 화면을 잇는 유일한 끈이라, 문의가
 *   들어왔을 때 그 값 하나로 해당 요청을 찾을 수 있다. 내용은 들어 있지 않다.
 * - **재시도와 돌아가기를 함께** 준다. 일시적인 문제면 재시도로 풀리고,
 *   아니면 사용자가 갇힌다 — 나갈 문이 항상 있어야 한다.
 * - `"use client"` 다. Next 의 `error.tsx` 는 클라이언트 컴포넌트여야 하고
 *   `reset()` 도 브라우저에서만 의미가 있다.
 *
 * [Usage]
 * ```tsx
 * // app/(app)/error.tsx
 * "use client";
 * export default function Error(props) { return <ErrorState {...props} />; }
 * ```
 * ---------------------------------------------
 */

interface ErrorStateProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** 무엇을 못 불러왔는지. 화면마다 다르게 준다. */
  whatKo?: string;
  /** 돌아갈 곳. */
  backHref?: string;
  backKo?: string;
}

export function ErrorState({
  error,
  reset,
  whatKo = "화면을 불러오지 못했습니다",
  backHref = "/dashboard",
  backKo = "홈으로",
}: ErrorStateProps) {
  // 원문은 콘솔에만. 화면에는 우리 문구만 나간다.
  console.error("[error]", error);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-unsuitable/10 text-2xl text-unsuitable">
        <AlertTriangleIcon />
      </span>

      <h1 className="mt-4 font-semibold text-fg text-xl">{whatKo}</h1>

      <div className="mt-3 w-full rounded-lg border border-border bg-surface p-4 text-left">
        <p className="font-medium text-fg text-sm">이럴 때 생깁니다</p>
        <ul className="mt-2 flex flex-col gap-1.5 text-fg-muted text-sm leading-relaxed">
          <li>· 잠깐 연결이 끊겼을 때</li>
          <li>· 기상 관측 자료를 받아오지 못했을 때</li>
          <li>· 로그인이 만료됐을 때</li>
        </ul>

        <p className="mt-3 border-border border-t pt-3 font-medium text-fg text-sm">
          이렇게 해보세요
        </p>
        <p className="mt-1.5 text-fg-muted text-sm leading-relaxed">
          아래 <b className="text-fg">다시 시도</b> 를 눌러 주세요. 그래도 안
          되면 잠시 뒤에 다시 열어 보시고, 계속 같으면 아래 번호를 알려 주세요.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <Button onClick={reset} size="lg">
          다시 시도
        </Button>
        <ButtonLink href={backHref} size="lg" variant="outline">
          {backKo}
        </ButtonLink>
      </div>

      {/* 서버 로그와 이 화면을 잇는 끈. 값 자체에는 내용이 없다. */}
      {error.digest && (
        <p className="mt-5 font-mono text-[0.68rem] text-fg-subtle">
          오류 번호 {error.digest}
        </p>
      )}
    </div>
  );
}

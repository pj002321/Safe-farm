import { type ComponentProps, type ReactNode, useId } from "react";

/**
 * ---------------------------------------------
 * [Feature]: 공용 폼 필드 (라벨 + 입력 + 힌트 + 오류)
 *
 * [Description]
 * - 라벨·설명·오류를 입력과 **연결하는 일**이 이 컴포넌트의 존재 이유다. 화면에 글자를
 *   나란히 놓는 것만으로는 스크린리더가 셋을 한 덩어리로 읽지 못한다. id 를 손으로 짓게
 *   두면 한 페이지에 같은 필드가 두 번 나오는 순간(로그인/회원가입 탭) 중복된다.
 *   그래서 `useId()` 로 렌더마다 고유한 id 를 만들고 htmlFor·aria-describedby 를 잇는다.
 * - **"use client" 를 붙이지 않는다.** useId 는 서버 컴포넌트에서도 동작하고, 이 필드는
 *   `<form action={serverAction}>` 안에서 서버 렌더돼야 JS 없이도 제출이 된다.
 *   지시자를 붙이는 순간 로그인 폼 전체가 클라이언트 번들로 끌려 들어간다.
 * - 오류를 색(border-unsuitable)으로만 표시하지 않는다. `aria-invalid` 와 `role="alert"`
 *   문구가 함께 나가야 색을 못 보는 사용자도 무엇이 틀렸는지 안다.
 *
 * [Usage]
 * ```tsx
 * <Field
 *   label="이메일"
 *   name="email"
 *   type="email"
 *   icon={<MailIcon />}
 *   hint="가입에 사용한 주소를 입력하세요."
 *   error={state?.error}
 *   required
 * />
 * ```
 * ---------------------------------------------
 */

interface FieldProps extends Omit<ComponentProps<"input">, "className" | "id"> {
  label: string;
  name: string;
  /** 입력 아래 상시 노출되는 보조 설명. */
  hint?: string;
  /** 있으면 오류 상태로 바뀐다. 서버 액션의 반환값을 그대로 넣는 용도. */
  error?: string;
  /** 입력 왼쪽에 겹쳐 놓는 아이콘. */
  icon?: ReactNode;
}

export function Field({
  label,
  name,
  type = "text",
  hint,
  error,
  icon,
  ...props
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  // 오류를 먼저 읽히게 순서를 잡는다. 힌트보다 지금 고쳐야 할 정보가 우선이다.
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-medium text-fg text-sm" htmlFor={id}>
        {label}
      </label>

      <div className="relative">
        {icon && (
          <span
            aria-hidden="true"
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 text-fg-subtle"
          >
            {icon}
          </span>
        )}
        <input
          aria-describedby={describedBy}
          aria-invalid={error ? "true" : undefined}
          className={`w-full rounded-md border bg-surface py-2.5 text-fg placeholder:text-fg-subtle transition-colors ${
            icon ? "pr-3 pl-10" : "px-3"
          } ${
            error
              ? "border-unsuitable"
              : "border-border hover:border-accent focus:border-accent"
          }`}
          id={id}
          name={name}
          type={type}
          {...props}
        />
      </div>

      {hint && (
        <p className="text-fg-muted text-xs" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="text-unsuitable text-xs" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

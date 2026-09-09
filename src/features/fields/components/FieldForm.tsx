"use client";

import { useActionState } from "react";
import { createFieldAction } from "../actions";

/**
 * ---------------------------------------------
 * [Feature]: 농지 등록 폼
 *
 * [Description]
 * - Server Action을 `<form action={...}>` 에 그대로 넘긴다. fetch도 URL도 없다.
 * - `useActionState` 로 서버가 돌려준 검증 오류를 그대로 표시한다.
 *   클라이언트에서 검증을 중복 구현하지 않는다 — 서버가 신뢰 경계다.
 * - 로딩·오류·성공 상태를 모두 다룬다. 빈 상태는 목록 쪽 책임.
 * ---------------------------------------------
 */
export function FieldForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      const result = await createFieldAction(formData);
      return result.ok ? null : result.error;
    },
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-fg-muted text-sm">농지 이름</span>
        <input
          name="name"
          required
          maxLength={50}
          className="rounded-md border border-border bg-surface p-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-fg-muted text-sm">면적 (m²)</span>
        <input
          name="areaM2"
          type="number"
          min={1}
          required
          className="rounded-md border border-border bg-surface p-2"
        />
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-fg-muted text-sm">위도</span>
          <input
            name="lat"
            type="number"
            step="any"
            required
            className="rounded-md border border-border bg-surface p-2"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-fg-muted text-sm">경도</span>
          <input
            name="lng"
            type="number"
            step="any"
            required
            className="rounded-md border border-border bg-surface p-2"
          />
        </label>
      </div>

      {state && (
        <p role="alert" className="text-sm text-unsuitable">
          {state}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent p-2 text-bg disabled:opacity-50"
      >
        {pending ? "등록 중…" : "농지 등록"}
      </button>
    </form>
  );
}

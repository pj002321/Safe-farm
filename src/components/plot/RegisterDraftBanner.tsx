"use client";

import type { Draft } from "@/features/plots/domain/registerDraft";
import { toElapsedKo } from "@/features/plots/domain/registerDraft";

/**
 * ---------------------------------------------
 * [Feature]: 임시 저장본을 불러왔다고 알리는 배너
 *
 * [Description]
 * - 모달이 아니라 배너인 까닭: 열 번 중 아홉은 "이어서 쓸게" 다. 그때마다 길을 막으면
 *   손해가 크고, 모달은 **뭐가 저장돼 있는지 못 본 채** 예/아니오를 강요한다.
 * - 대신 **무엇이 복원됐는지 보여준다.** 지난주에 쓰다 만 밭의 좌표로 오늘 다른 밭을
 *   등록하는 사고를 막는 것이 이 배너의 진짜 목적이다 — 좌표가 틀리면 날씨·GDD·
 *   재해 경보가 전부 엉뚱한 지역 것이 된다.
 * - 시각("2시간 전" / "8일 전")이 판단을 돕는다. 기한을 두어 오래된 것을 말없이 버리지
 *   않는다 — "왜 없어졌지" 를 만들기 때문이다. 사용자가 보고 정한다.
 * ---------------------------------------------
 */

export function RegisterDraftBanner({
  draft,
  onStartOver,
}: {
  draft: Draft;
  onStartOver: () => void;
}) {
  const elapsed = toElapsedKo(draft.savedAt);
  // 사용자가 "어느 밭이었는지" 를 알아보는 데 쓰는 두 토막. 없으면 그 자리를 비운다
  const summary = [draft.values.addressKo?.[0], draft.values.name?.[0]]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-accent/40 bg-accent-subtle px-4 py-3">
      <p className="text-fg text-sm">
        {elapsed ? `${elapsed}에 ` : ""}쓰던 내용을 불러왔습니다.
      </p>
      {summary && <p className="text-fg-muted text-sm">{summary}</p>}
      <button
        className="ml-auto rounded-md border border-border bg-surface px-3 py-1.5 font-medium text-fg text-xs transition-colors duration-200 ease-out-expo hover:border-accent hover:text-accent"
        onClick={onStartOver}
        type="button"
      >
        새로 시작
      </button>
      {/* 되돌릴 수 없는 동작이라 누르기 전에 알린다. 확인 절차 대신 문구로 두는 까닭은
          잃는 것이 아직 등록 안 된 입력값뿐이고, 다시 채우면 되는 정도라서다. */}
      <p className="w-full text-fg-subtle text-xs">
        새로 시작하면 저장된 내용이 지워지고 빈 양식으로 돌아갑니다.
      </p>
    </div>
  );
}

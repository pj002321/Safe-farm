"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "welcome-back-dismissed";

/**
 * 닫으면 그 부재(`dismissKey` = 마지막 활동 시각)를 기억해 다시 띄우지 않는다.
 * 다음에 또 오래 비우면 마지막 활동 시각이 바뀌어 새 인사로 뜬다.
 * 닫았는지는 마운트 뒤에야 알 수 있어 그 전에는 그리지 않는다 — 닫은 카드가 번쩍이지 않게.
 */
export function WelcomeBackCard({
  dismissKey,
  greeting,
  items,
}: {
  dismissKey: string;
  greeting: string;
  items: string[];
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(localStorage.getItem(STORAGE_KEY) !== dismissKey);
  }, [dismissKey]);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, dismissKey);
    setVisible(false);
  };

  return (
    <section
      aria-label="오랜만에 오신 분께"
      className="flex flex-col gap-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3"
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 font-semibold text-[0.92rem] text-fg">
          {greeting}
        </p>
        <button
          className="-mr-1 shrink-0 rounded-full px-1.5 py-0.5 text-accent/70 text-lg leading-none transition-colors hover:bg-accent/10 hover:text-accent"
          onClick={dismiss}
          type="button"
        >
          <span className="sr-only">인사 닫기</span>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-[0.85rem] text-fg-muted leading-relaxed">
        {items.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </section>
  );
}

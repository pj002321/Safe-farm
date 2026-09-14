import Link from "next/link";
import type { LegalDocument } from "@/features/legal/domain/types";

/**
 * ---------------------------------------------
 * [Feature]: 법적 고지 문서 렌더러
 *
 * [Description]
 * - 약관과 개인정보처리방침이 같은 화면을 쓴다. 둘은 구조가 같고, 따로 만들면
 *   한쪽만 고쳐져 서식이 어긋난다.
 * - **목차를 둔다.** 이런 문서는 처음부터 읽히지 않고 "환불 조항이 어디"처럼
 *   찾아 들어온다. 각 조항에 `id` 가 있어 링크로 특정 조항을 가리킬 수 있다.
 *   (globals.css 가 `[id]` 에 scroll-margin-top 을 줘서 헤더에 가리지 않는다.)
 * - **표는 자기 안에서만 가로 스크롤한다.** 좁은 화면에서 표 때문에 페이지
 *   본문이 통째로 옆으로 밀리면 읽을 수가 없다.
 * - 본문 폭을 `max-w-[68ch]` 로 제한한다. 한 줄이 길면 다음 줄 첫 글자를 찾기가
 *   어려워진다 — 법적 문서처럼 길고 촘촘한 글에서 특히 그렇다.
 *
 * [Usage]
 * ```tsx
 * <LegalDocumentView document={PRIVACY_POLICY} />
 * ```
 * ---------------------------------------------
 */

export function LegalDocumentView({ document }: { document: LegalDocument }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-border border-b">
        <div className="mx-auto max-w-5xl px-5 py-6 sm:px-8">
          <Link
            className="font-mono text-[0.72rem] text-fg-subtle transition-colors hover:text-fg"
            href="/"
          >
            ← Safe Farm
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-14">
        <main className="min-w-0">
          <h1 className="font-semibold text-3xl text-fg tracking-tight sm:text-4xl">
            {document.titleKo}
          </h1>
          <p className="mt-2 font-mono text-[0.75rem] text-fg-subtle">
            시행일 {document.effectiveDateKo}
          </p>

          {/* 전문을 안 읽는 사람이 대부분이다. 요약을 먼저 준다. */}
          <p className="mt-6 rounded-xl border border-border bg-surface px-5 py-4 text-[0.95rem] text-fg-muted leading-relaxed">
            {document.summaryKo}
          </p>

          <div className="mt-10 flex flex-col gap-10">
            {document.sections.map((section) => (
              <section className="min-w-0" id={section.id} key={section.id}>
                <h2 className="font-semibold text-fg text-lg">
                  {section.titleKo}
                </h2>

                {section.paragraphs?.map((text) => (
                  <p
                    className="mt-3 max-w-[68ch] text-[0.95rem] text-fg-muted leading-[1.75]"
                    key={text.slice(0, 30)}
                  >
                    {text}
                  </p>
                ))}

                {section.bullets && (
                  <ul className="mt-3 flex max-w-[68ch] flex-col gap-2">
                    {section.bullets.map((item) => (
                      <li
                        className="flex gap-2.5 text-[0.95rem] text-fg-muted leading-[1.75]"
                        key={item.slice(0, 30)}
                      >
                        <span
                          aria-hidden="true"
                          className="mt-[0.6em] size-1 shrink-0 rounded-full bg-fg-subtle"
                        />
                        <span className="min-w-0">{item}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {section.table && (
                  // 표만 안에서 스크롤한다. 페이지 본문은 옆으로 밀리지 않는다.
                  <div className="mt-4 overflow-x-auto rounded-xl border border-border">
                    <table className="w-full min-w-[34rem] border-collapse text-left">
                      <thead>
                        <tr className="border-border border-b bg-surface-2">
                          {section.table.headers.map((header) => (
                            <th
                              className="px-4 py-2.5 font-medium text-[0.8rem] text-fg"
                              key={header}
                              scope="col"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.table.rows.map((row) => (
                          <tr
                            className="border-border border-b last:border-b-0"
                            key={row.join("|")}
                          >
                            {row.map((cell) => (
                              <td
                                className="px-4 py-2.5 align-top text-[0.85rem] text-fg-muted leading-relaxed"
                                key={cell}
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {section.noteKo && (
                  <p className="mt-4 max-w-[68ch] border-accent border-l-2 pl-4 text-[0.9rem] text-fg leading-[1.75]">
                    {section.noteKo}
                  </p>
                )}
              </section>
            ))}
          </div>

          <section className="mt-14 border-border border-t pt-8" id="history">
            <h2 className="font-mono text-[0.7rem] text-fg-subtle uppercase tracking-[0.14em]">
              개정 이력
            </h2>
            <ul className="mt-3 flex flex-col gap-1.5">
              {document.history.map((entry) => (
                <li
                  className="font-mono text-[0.8rem] text-fg-muted"
                  key={entry.dateKo}
                >
                  {entry.dateKo} — {entry.changeKo}
                </li>
              ))}
            </ul>
          </section>
        </main>

        {/* 목차. 좁은 화면에서는 본문 위가 아니라 아래로 보내지 않고 숨긴다 —
            조항 수가 많아 위에 놓으면 본문에 닿기까지 한참 스크롤해야 한다. */}
        <nav
          aria-label="목차"
          className="hidden lg:sticky lg:top-10 lg:block lg:self-start"
        >
          <p className="font-mono text-[0.7rem] text-fg-subtle uppercase tracking-[0.14em]">
            목차
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {document.sections.map((section) => (
              <li key={section.id}>
                <a
                  className="text-[0.8rem] text-fg-muted leading-snug transition-colors hover:text-accent"
                  href={`#${section.id}`}
                >
                  {section.titleKo}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

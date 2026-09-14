import { LogoWordmark } from "@/components/icons";
import { DATA_SOURCES } from "@/features/monitoring/domain/plots";

/**
 * ---------------------------------------------
 * [Feature]: 랜딩 푸터
 *
 * [Description]
 * - 서버 컴포넌트다. 상태도 이벤트도 없으므로 클라이언트 번들에 넣지 않는다.
 * - **죽은 링크를 만들지 않는다.** 지금 실제로 존재하는 경로는 랜딩의 앵커들과
 *   `/login`·`/signup` 뿐이다. 이용약관·개인정보처리방침처럼 아직 페이지가 없는
 *   항목은 `<a>` 로 걸지 않고 그냥 글자로 둔다. 빈 링크를 미리 깔아 두면
 *   사용자는 404 를 만나고, 크롤러는 없는 페이지를 색인한다.
 * - 한 칸은 **데이터 출처**다. 마케팅 링크보다 먼저 자리를 준다 — Open-Meteo 의
 *   CC BY 4.0 은 표기 의무가 있는 라이선스라 화면에서 지우면 안 된다.
 *   출처는 계측 정보라 `font-mono` 로 둔다. 브랜드 문구와 같은 서체면 출처 표기가
 *   카피처럼 읽힌다.
 *
 * [Usage]
 * ```tsx
 * <LandingFooter />
 * ```
 * ---------------------------------------------
 */

interface FooterItem {
  label: string;
  /** 없으면 링크가 아니라 글자로 그린다(위 주석 참고). */
  href?: string;
}

interface FooterColumn {
  title: string;
  items: readonly FooterItem[];
}

const COLUMNS: readonly FooterColumn[] = [
  {
    title: "보는 것",
    items: [
      { label: "위성이 보는 것", href: "#eyes" },
      { label: "세 가지 밭", href: "#plots" },
      { label: "위성 영상", href: "#sat" },
      { label: "근거", href: "#proof" },
    ],
  },
  {
    title: "쓰는 것",
    items: [
      { label: "내 밭", href: "#my" },
      { label: "오늘 상주", href: "#today" },
      { label: "로그인", href: "/login" },
      { label: "밭 등록하기", href: "/signup" },
    ],
  },
];

export function LandingFooter() {
  return (
    <footer className="border-border border-t bg-surface">
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-4 lg:pr-8">
            <LogoWordmark className="text-fg" />
            <p className="text-pretty text-fg-muted text-sm leading-relaxed">
              위성 관측과 기상 예보를 이어 붙여, 땅에서 일어나는 변화를 하루 두
              번 읽어 드립니다.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav aria-label={column.title} key={column.title}>
              <h2 className="font-mono text-fg-subtle text-xs uppercase tracking-[0.18em]">
                {column.title}
              </h2>
              <ul className="mt-4 flex flex-col gap-3">
                {column.items.map((item) => (
                  <li key={item.label}>
                    {item.href ? (
                      <a
                        className="text-fg-muted text-sm transition-colors duration-200 ease-out-expo hover:text-accent"
                        href={item.href}
                      >
                        {item.label}
                      </a>
                    ) : (
                      <span className="text-fg-subtle text-sm">
                        {item.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <section aria-labelledby="footer-sources">
            <h2
              className="font-mono text-fg-subtle text-xs uppercase tracking-[0.18em]"
              id="footer-sources"
            >
              데이터 출처
            </h2>
            <ul className="mt-4 flex flex-col gap-3">
              {DATA_SOURCES.map((source) => (
                <li className="text-sm" key={source.nameKo}>
                  <span className="text-fg-muted">{source.nameKo}</span>
                  <span className="mt-0.5 block font-mono text-fg-subtle text-xs">
                    {source.detailKo}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-border border-t pt-6 font-mono text-fg-subtle text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>세이프팜 · 소규모 영농인을 위한 관측 기반 의사결정 보조</p>
          <p>© 2026 Safe Farm AI</p>
        </div>
      </div>
    </footer>
  );
}

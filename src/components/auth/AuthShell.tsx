import Link from "next/link";
import type { ReactNode } from "react";
import { LogoWordmark } from "@/components/icons";

/**
 * ---------------------------------------------
 * [Feature]: 인증 화면 공통 셸 (로그인 · 회원가입)
 *
 * [Description]
 * - 두 화면이 같은 2단 분할을 쓴다. 각 페이지에 브랜드 패널을 복사해 두면
 *   문구 하나 고칠 때마다 두 곳을 맞춰야 하고, 결국 어긋난다.
 * - 왼쪽 패널에 3D 캔버스를 두지 않았다. 인증 화면은 아직 로그인도 안 된
 *   사용자가 보는 첫 화면이라, 여기서 three.js 런타임을 내려받게 하면 느린
 *   회선에서 가장 먼저 이탈이 난다. 궤도 장식은 CSS 로 충분하다.
 * - 모바일에서는 왼쪽 패널을 통째로 숨긴다. 작은 화면에서 폼보다 먼저 오는
 *   장식은 "로그인까지 걸리는 스크롤"일 뿐이다.
 * - **홈으로 가는 길은 로고 하나뿐이다.** 별도의 "홈으로" 버튼을 두면 인증
 *   화면에서 눌러야 할 것이 늘어나 진짜 행동(로그인·가입)이 묻힌다.
 *   로고를 누르면 홈이라는 건 웹의 보편적 규약이라 따로 배울 필요도 없다.
 *   대신 링크라는 사실이 보조기기에도 전달되도록 `aria-label` 을 준다.
 *
 * [Usage]
 * ```tsx
 * <AuthShell title="다시 오신 걸 환영합니다" description="...">
 *   <LoginForm next="/dashboard" />
 * </AuthShell>
 * ```
 * ---------------------------------------------
 */

/** 왼쪽 패널 하단의 관측 메타. 장식이지만 "이 제품이 무엇을 보는지"를 말한다. */
const OBSERVATION_META = [
  { label: "관측 구역", value: "35°49'24\"N 127°08'11\"E" },
  { label: "관측 위성", value: "SENTINEL-2B · L2A" },
  { label: "재방문 주기", value: "5일 · 최근 04:12 KST" },
];

/**
 * CSS 로만 그린 궤도 장식. 의미를 전달하지 않는 순수 장식이므로 접근성 트리에서
 * 뺀다. 모션은 globals.css 의 prefers-reduced-motion 규칙이 전역으로 잡아준다.
 */
function OrbitDecoration() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div className="-left-32 absolute top-16 size-[30rem] animate-drift rounded-full border border-space-border" />
      <div className="-right-48 -bottom-40 absolute size-[38rem] rounded-full border border-space-border" />
      <div className="absolute top-1/2 left-1/3 size-64 animate-drift rounded-full border border-space-border [animation-delay:-4.5s]">
        {/* 궤도 위의 관측점. 가운데 점이 위성, 퍼지는 링이 관측 신호다. */}
        <span className="-translate-x-1/2 -translate-y-1/2 absolute top-0 left-1/2 block size-2 rounded-full bg-telemetry" />
        <span className="-translate-x-1/2 -translate-y-1/2 absolute top-0 left-1/2 block size-2 animate-pulse-ring rounded-full bg-telemetry" />
      </div>
    </div>
  );
}

interface AuthShellProps {
  title: string;
  description: string;
  /** 브랜드 패널의 큰 문구. 화면마다 말이 달라야 해서 밖에서 받는다. */
  headline: ReactNode;
  /** 폼 아래 안내(가입 링크·문의 등). */
  footer?: ReactNode;
  children: ReactNode;
}

export function AuthShell({
  title,
  description,
  headline,
  footer,
  children,
}: AuthShellProps) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-space p-12 text-space-fg lg:flex lg:flex-col">
        <OrbitDecoration />

        <Link
          aria-label="Safe Farm AI 홈으로"
          className="relative w-fit rounded-sm"
          href="/"
        >
          <LogoWordmark className="text-space-fg" />
        </Link>

        <div className="relative my-auto max-w-md">
          <p className="text-balance font-semibold text-4xl leading-tight tracking-tight xl:text-5xl">
            {headline}
          </p>
          <p className="mt-6 text-space-muted leading-relaxed">
            궤도에서 내려온 관측값과 기상 예보를 겹쳐, 생육 이상과 재해 위험을
            밭 단위로 짚어 드립니다.
          </p>
        </div>

        <dl className="relative grid gap-2 border-space-border border-t pt-6 font-mono text-space-muted text-xs tabular-nums">
          {OBSERVATION_META.map((row) => (
            <div
              className="flex items-center justify-between gap-4"
              key={row.label}
            >
              <dt>{row.label}</dt>
              <dd className="text-space-fg">{row.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm">
          {/* 왼쪽 패널이 없는 좁은 화면에서도 어느 서비스인지 보여야 한다.
              여기서는 이 로고가 홈으로 가는 유일한 길이므로 반드시 링크여야 한다. */}
          <Link
            aria-label="Safe Farm AI 홈으로"
            className="mb-10 block w-fit rounded-sm lg:hidden"
            href="/"
          >
            <LogoWordmark className="text-fg" />
          </Link>

          <h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
          <p className="mt-2 text-fg-muted text-sm">{description}</p>

          {children}

          {footer}
        </div>
      </section>
    </main>
  );
}

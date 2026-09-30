import type { Metadata } from "next";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { AccountPanel } from "@/components/me/AccountPanel";
import { AskHistoryPanel } from "@/components/me/AskHistoryPanel";
import { MeRail } from "@/components/me/MeRail";
import { ME_SECTIONS } from "@/components/me/meSections";
import { RecordPanel } from "@/components/me/RecordPanel";
import { ButtonLink } from "@/components/shared/Button";
import { SectionHeading } from "@/components/shared/SectionHeading";
import { listAskHistory } from "@/features/ask/askHistoryStore";
import { countPlots, listCultivationRecords } from "@/features/plots/plotStore";
import { requireConsentOrRedirect } from "@/shared/auth/consentGate";
import { updateAccount } from "./actions";

/**
 * ---------------------------------------------
 * [Feature]: 마이페이지  →  /me
 *
 * [Description]
 * - 이 파일은 **조립만** 한다. 마크업은 `components/me/` 의 패널 넷에 있다.
 * - 기능 넷을 **구역 셋**으로 접었다. 'CSV 내보내기'는 버튼 하나라서 독립 구역으로
 *   올리면 눌러 들어가 버튼 하나를 보는 화면이 된다 — 재배 기록 머리에 붙여
 *   "지금 보고 있는 것을 내보낸다"가 되게 했다(연도 필터가 곧 내보내기 범위다).
 * - 넓은 화면은 왼쪽 레일로 구역을 갈아 끼우고, 좁은 화면은 셋을 그냥 쌓는다.
 *   설정 화면은 훑어보는 곳이라 좁은 화면에서 탭을 하나 더 만들 이유가 없다.
 * - 하단 독은 **삭제를 겨냥하는 순간** 앱 탭에서 확인 바로 변신한다(`MeDeleteDock`).
 *   목록이 길면 겨냥한 줄이 스크롤 밖으로 나가는데, 그때도 취소·삭제가 엄지 자리에
 *   남는다.
 * - ⚠️ `group/me` 가 이 래퍼 div 에 있다. 독이 `fixed` 라 `backdrop-filter` 를 가진
 *   조상 안에 들어가면 안 되고, `group-has` 는 조상에서 내려다보므로 레일·패널·독을
 *   **함께 감싸는** 것이 그룹을 들어야 한다(등록 마법사가 같은 이유로 폼이 아니라
 *   부모 div 에 그룹을 걸었다).
 * - `searchParams` 를 읽으므로 이 화면은 동적으로 렌더된다. 로그인이 필요한
 *   화면이라 어차피 정적일 수 없다.
 * ---------------------------------------------
 */

export const metadata: Metadata = { title: "내 정보" };

/** 연도 쿼리를 숫자로. 이상한 값이 오면 '전체'로 떨어뜨린다. */
function parseYear(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const year = Number(value);
  return Number.isInteger(year) && year > 1900 && year < 2200 ? year : null;
}

/**
 * 처음 열릴 구역. `?section=records` 처럼 **id 에서 `me-` 를 뗀 값**으로 받는다.
 *
 * 없거나 모르는 값이면 첫 구역(계정)이다 — 예전엔 늘 그랬다. 이 파라미터가 필요한
 * 이유는 lg 이상에서 고른 구역 하나만 보이기 때문이다: 연도 칩(`/me?year=2025`)이나
 * 내보내기가 되돌려 보낸 주소(`/me?error=records-none`)로 다시 열리면 **계정 구역이
 * 떠서** 방금 고른 연도도, 되돌아온 까닭도 안 보였다(2026-09-22). 라디오라
 * 스크립트 없이 고를 방법은 `defaultChecked` 뿐이다.
 */
function parseSection(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const wanted = value ? `me-${value}` : null;
  return (
    ME_SECTIONS.find((section) => section.id === wanted)?.id ??
    ME_SECTIONS[0].id
  );
}

export default async function Page({
  searchParams,
}: PageProps<"/me">): Promise<React.ReactElement> {
  const { profile } = await requireConsentOrRedirect();
  const params = await searchParams;

  const plotCount = await countPlots(profile.id);
  const year = parseYear(params.year);
  const activeSectionId = parseSection(params.section);
  // 조회가 실패해도 마이페이지 전체가 500이 되면 안 된다 — 계정·텃밭 구역은
  // 멀쩡한데 질문 기록 하나 때문에 화면이 통째로 죽을 이유가 없다(dashboard/history
  // 와 같은 방침).
  const askHistory = await listAskHistory(profile.id).catch(
    (error: unknown) => {
      console.error("[me] 질문 기록 조회 실패", error);
      return [];
    },
  );
  const records = await listCultivationRecords(profile.id).catch(
    (error: unknown) => {
      console.error("[me] 재배 기록 조회 실패", error);
      return [];
    },
  );

  const savedKey = Array.isArray(params.saved) ? params.saved[0] : params.saved;
  const errorKey = Array.isArray(params.error) ? params.error[0] : params.error;
  const rawMessage = Array.isArray(params.message)
    ? params.message[0]
    : params.message;
  // 쿼리 문자열은 사용자가 고칠 수 있다. 액션이 넣은 문장만 그대로 쓰되 길이를
  // 잘라, 주소창으로 화면에 긴 글을 밀어 넣지 못하게 한다.
  const message = rawMessage?.slice(0, 120);

  return (
    <main className="mx-auto max-w-5xl px-6 py-6 sm:py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading
          description="계정과 등록한 텃밭, 지난 재배 기록을 여기서 관리합니다."
          eyebrow="account"
          title="내 정보"
        />
        <SignOutButton size="sm" variant="ghost" />
      </div>

      <div className="group/me mt-7">
        {/* 구역 상태를 들고 있는 라디오 셋. sr-only 지만 실제 포커스를 받으므로
            키보드 화살표로 구역이 넘어간다. fieldset 으로 묶어야 스크린리더가
            "3개 중 2번째"가 무엇의 3개인지 말할 수 있다. */}
        <fieldset>
          <legend className="sr-only">내 정보 구역</legend>
          {ME_SECTIONS.map((section) => (
            <input
              aria-label={section.labelKo}
              className="sr-only"
              defaultChecked={section.id === activeSectionId}
              id={section.id}
              key={section.id}
              name="__me_section"
              type="radio"
            />
          ))}
        </fieldset>

        <div className="grid gap-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
          <MeRail />

          {/* min-w-0 이 없으면 긴 주소와 표가 그리드 칸을 밀어내 가로 스크롤이 생긴다. */}
          <div className="flex min-w-0 flex-col gap-10 lg:gap-0">
            <Section section={ME_SECTIONS[0]}>
              <AccountPanel
                error={errorKey === "account" ? message : undefined}
                onSave={updateAccount}
                profile={profile}
                saved={savedKey === "account"}
              />
            </Section>

            {/*
              텃밭 관리 화면은 `/plots` 하나뿐이다. 여기에도 목록을 그리면 같은
              기능이 두 벌이 되고, 한쪽만 고쳐지는 순간 같은 밭이 화면마다 다르게
              보인다. 여기서는 개수만 말하고 그쪽으로 보낸다.
            */}
            <Section section={ME_SECTIONS[1]}>
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface px-5 py-4">
                <p className="text-fg-muted text-sm">
                  등록한 텃밭{" "}
                  <span className="font-mono text-fg tabular-nums">
                    {plotCount}
                  </span>
                  개
                </p>
                <ButtonLink href="/plots" size="sm" variant="secondary">
                  텃밭 관리
                </ButtonLink>
              </div>
            </Section>

            <Section section={ME_SECTIONS[2]}>
              {/* `error` 는 내보내기 라우트가 되돌려 보낸 키다(`records-none` ·
                  `records-many`). 문장은 패널이 코드로 갖는다 — 주소로 온 글을
                  그리지 않기 위해서다. */}
              <RecordPanel error={errorKey} records={records} year={year} />
            </Section>

            <Section section={ME_SECTIONS[3]}>
              <AskHistoryPanel entries={askHistory} />
            </Section>
          </div>
        </div>
      </div>
    </main>
  );
}

function Section({
  section,
  children,
}: {
  section: (typeof ME_SECTIONS)[number];
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${section.id}-title`} className={section.panel}>
      {/* 넓은 화면에서는 왼쪽 레일이 같은 말을 하므로 제목을 숨긴다. 좁은 화면은
          셋이 쌓여 있어 제목이 없으면 어디서 어디까지인지 알 수 없다. */}
      <h2
        className="mb-4 font-semibold text-[1.05rem] text-fg tracking-tight lg:sr-only"
        id={`${section.id}-title`}
      >
        {section.titleKo}
      </h2>
      {children}
    </section>
  );
}

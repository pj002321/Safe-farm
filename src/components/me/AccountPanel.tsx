import { GoogleIcon, MailIcon } from "@/components/icons";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Checkbox } from "@/components/shared/Checkbox";
import { Field } from "@/components/shared/Field";
import type { Profile } from "@/shared/auth/profile";
import { formatFarmDate } from "@/shared/utils/format";

/**
 * ---------------------------------------------
 * [Feature]: 마이페이지 — 계정 정보 조회·수정
 *
 * [Description]
 * - **'보기 모드 / 수정 모드' 토글을 만들지 않았다.** 고칠 수 있는 값이 둘(이름,
 *   메일 수신)뿐이라 토글은 상태만 늘리고, 회색으로 잠긴 칸을 본 사용자가 "왜 안
 *   써지지" 하고 멈추는 벽을 하나 세운다. 못 고치는 사실은 `<dl>` 로 읽히고,
 *   고칠 수 있는 것만 그 아래 폼에 있다 — 화면이 곧 설명이 된다.
 * - **'닉네임' 컬럼을 새로 만들지 않았다.** `profiles.full_name` 이 이미 있고
 *   `displayNameOf()` 가 그걸 표시 이름으로 쓴다. 요구사항의 '닉네임' 은 라벨이지
 *   스키마가 아니다.
 * - '변경 불가' 배지는 장식이 아니라 **RLS 의 사실을 옮긴 것**이다. 정책
 *   `profiles_update_own` 이 `email`·`role` 을 with-check 동일성으로 잠갔다.
 *   빨강이 아니라 neutral 로 둔다 — 못 하는 일을 위험한 일처럼 칠하지 않는다.
 * - 상태가 없어 **서버 컴포넌트**다. `useActionState` 로 저장 결과를 받으면 이
 *   패널 전체가 클라이언트 번들로 끌려간다. 결과는 액션이 `?saved=account` 로
 *   돌려보내고 페이지가 읽어 한 줄 띄운다.
 *
 * [Usage]
 * ```tsx
 * <AccountPanel profile={profile} saved={saved} error={error} />
 * ```
 * ---------------------------------------------
 */

interface AccountPanelProps {
  profile: Profile;
  /** 저장 액션. 페이지가 넘긴다 — 컴포넌트가 라우트를 알 이유가 없다. */
  onSave: (formData: FormData) => Promise<void>;
  /** 방금 저장을 마쳤는가. 페이지가 searchParams 에서 읽어 넘긴다. */
  saved: boolean;
  /** 저장이 실패한 이유. 없으면 그리지 않는다. */
  error?: string;
}

/** 가입 경로를 사람이 읽는 말로. 모르는 값이 와도 화면이 비지 않게 한다. */
function providerLabel(provider: string): {
  ko: string;
  icon: React.ReactNode;
} {
  if (provider === "google") return { ko: "Google", icon: <GoogleIcon /> };
  return { ko: "이메일", icon: <MailIcon /> };
}

export function AccountPanel({
  profile,
  onSave,
  saved,
  error,
}: AccountPanelProps) {
  const provider = providerLabel(profile.signupProvider);

  return (
    <div>
      {/* ── 못 고치는 사실 ───────────────────────── */}
      <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        <Row label="이메일">
          <span className="min-w-0 break-all font-mono text-fg text-sm">
            {profile.email}
          </span>
          <Badge size="sm" tone="neutral">
            변경 불가
          </Badge>
        </Row>

        <Row label="가입일">
          <time
            className="font-mono text-fg text-sm tabular-nums"
            dateTime={profile.createdAt}
          >
            {formatFarmDate(new Date(profile.createdAt))}
          </time>
        </Row>

        <Row label="연결된 계정">
          <Badge icon={provider.icon} size="sm" tone="neutral">
            {provider.ko}
          </Badge>
        </Row>
      </dl>

      {/* ── 고칠 수 있는 것 ──────────────────────── */}
      <form
        action={onSave}
        className="mt-4 flex flex-col gap-5 rounded-xl border border-border bg-surface p-5"
      >
        <Field
          defaultValue={profile.fullName ?? ""}
          hint="대시보드와 리포트에 이 이름으로 표시됩니다."
          label="이름"
          maxLength={40}
          name="fullName"
          placeholder="나농민"
        />

        <Checkbox
          badge="선택"
          defaultChecked={profile.marketingOptIn}
          description="새 기능과 작물별 관리 팁을 가끔 보내 드립니다. 언제든 끄실 수 있습니다."
          label="서비스 소식 메일 받기"
          name="marketingOptIn"
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" type="submit">
            저장
          </Button>
          {/* 저장 결과. role 로 알려 스크린리더가 옮겨 가지 않아도 읽게 한다.
              사라지는 토스트를 쓰지 않는 것은 이 저장소의 방침이다. */}
          {saved && (
            // <output> 은 폼 결과를 위한 요소이고 role="status"(aria-live polite)를
            // 이미 갖고 있다. 직접 role 을 다는 것보다 이쪽이 맞다.
            <output className="text-good text-sm">저장했습니다.</output>
          )}
          {error && (
            <p className="text-unsuitable text-sm" role="alert">
              {error}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}

/** `<dl>` 한 줄. 좁으면 위아래로, 넓으면 라벨·값 두 칸으로. */
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 px-5 py-4 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center sm:gap-4 sm:py-3.5">
      <dt className="text-fg-muted text-sm">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-2">{children}</dd>
    </div>
  );
}

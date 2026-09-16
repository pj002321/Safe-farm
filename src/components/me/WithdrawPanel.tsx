import { AlertTriangleIcon } from "@/components/icons";
import { WithdrawButton } from "./WithdrawButton";

/**
 * ---------------------------------------------
 * [Feature]: 회원 탈퇴 — 파기 항목 사전 고지
 *
 * [Description]
 * - 요구사항은 셋이다: **식별정보 즉시 파기 · 재배 기록 익명화 보존 ·
 *   파기 항목 사전 고지.** 이 화면은 그중 **사전 고지**를 담당한다.
 *
 * - ⚠️ **아직 계정을 지우지 않는다.** 지금 버튼은 로그아웃만 한다. 그래서 화면이
 *   그 사실을 숨기지 않고 말한다 — "탈퇴했다"고 믿고 떠난 사용자가 실제로는
 *   계정이 남아 있는 상태가 가장 나쁜 결과다. 라벨만 탈퇴로 두고 동작을 다르게
 *   하는 것은 사용자를 속이는 것이고, 제14조(파괴적 작업에는 명확한 경고)와
 *   정면으로 어긋난다.
 *   실제 삭제를 붙일 때 바꿀 것은 `WithdrawButton` 의 동작 하나뿐이고,
 *   아래 고지 표는 그대로 쓴다.
 *
 * - ⚠️ **개인정보처리방침과 같은 말을 해야 한다.** 지금 방침(6조)은 "회원 탈퇴 시
 *   지체 없이 파기"와 "법령이 보존을 요구하는 기록만 분리 보관"만 말한다.
 *   **익명화 보존을 허용하는 조항이 없다.** 이 표의 '익명으로 남습니다' 칸은
 *   방침을 함께 고치기 전에는 실제로 시행하면 안 된다 —
 *   `features/legal/domain/privacy.ts` 주석이 같은 경고를 적어 두었다.
 *
 * - 빨간 'Danger Zone' 상자를 만들지 않았다. 2019년 GitHub 설정 페이지이고, 이
 *   저장소의 말투(건조하고 사실적)와 맞지 않는다. 계정 구역 맨 아래에 접어 두고,
 *   펼쳤을 때만 경고색이 나온다.
 *
 * [Usage]
 * ```tsx
 * <WithdrawPanel />   // 계정 구역 맨 아래
 * ```
 * ---------------------------------------------
 */

/** 파기 항목 사전 고지. 사용자 언어로 적는다 — '위경도'가 아니라 '밭 위치'. */
const NOTICE = [
  {
    when: "즉시 파기",
    tone: "text-unsuitable",
    items: [
      "이메일 주소 · 로그인 정보",
      "이름(표시 이름)",
      "연결된 소셜 계정",
      "등록한 텃밭의 위치와 주소",
      "약관·개인정보·위치정보 동의 기록",
    ],
  },
  {
    when: "익명으로 남습니다",
    tone: "text-telemetry",
    items: [
      "작물 종류와 파종·수확 시기",
      "지역 단위(시군구) 재배 통계",
      "누가 재배했는지는 남지 않습니다",
    ],
  },
] as const;

export function WithdrawPanel() {
  return (
    <details className="mt-8 [&_summary]:list-none">
      <summary className="inline-flex w-fit cursor-pointer items-center rounded-md px-3 py-1.5 font-medium text-fg-subtle text-sm transition-colors duration-200 ease-out-expo hover:bg-surface-2 hover:text-fg">
        탈퇴하기
      </summary>

      <div className="mt-3 rounded-xl border border-border bg-surface p-5">
        <h3 className="font-semibold text-fg">탈퇴하면 이렇게 됩니다</h3>
        <p className="mt-1 text-fg-muted text-sm leading-relaxed">
          아래 내용을 확인하신 뒤 진행해 주세요. 되돌릴 수 없습니다.
        </p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          {NOTICE.map((group) => (
            <div key={group.when}>
              <p className={`font-medium text-sm ${group.tone}`}>
                {group.when}
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {group.items.map((item) => (
                  <li
                    className="flex gap-2 text-fg-muted text-sm leading-relaxed"
                    key={item}
                  >
                    <span aria-hidden="true" className="text-fg-subtle">
                      ·
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/*
          거짓말하지 않기 위한 칸이다. 지금 버튼은 로그아웃만 한다.
          삭제를 실제로 붙이면 이 블록을 지우고 WithdrawButton 의 동작을 바꾼다.
        */}
        <div className="mt-5 flex gap-3 rounded-lg border border-caution/25 bg-caution/10 p-4">
          <span aria-hidden="true" className="shrink-0 text-caution">
            <AlertTriangleIcon />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-fg text-sm">
              계정 삭제는 아직 준비 중입니다
            </p>
            <p className="mt-1 text-fg-muted text-sm leading-relaxed">
              지금 아래 버튼을 누르시면 <strong>로그아웃만</strong> 됩니다.
              계정과 등록하신 텃밭은 그대로 남아 있고, 다시 로그인하시면 이어서
              쓰실 수 있습니다. 실제 탈퇴가 필요하시면 고객센터로 알려 주세요.
            </p>
          </div>
        </div>

        <div className="mt-5">
          <WithdrawButton />
        </div>
      </div>
    </details>
  );
}

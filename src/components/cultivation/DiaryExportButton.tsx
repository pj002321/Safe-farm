import { ButtonLink } from "@/components/shared/Button";

/**
 * ---------------------------------------------
 * [Feature]: 영농일지 내보내기 — 이 재배 한 건
 *
 * [Description]
 * - 농민이 보조금·인증 서류를 쓸 때 한 철치를 한눈에 보려면 파일이 편하다.
 *   GAP·친환경 인증 심사는 **수확 전**에 오고 재해보험 손해평가는 재해가 난
 *   그때 오므로, **기르는 중에도 뽑을 수 있어야 한다**(2026-09-22 결정).
 *   마이페이지 재배기록은 끝난 것만 담아 그 몫을 못 한다.
 *
 * - **파일은 서버가 만든다.** 여기는 `<a>` 한 줄이라 **JS 가 0줄**이다.
 *   마이페이지의 체크박스 폼과 **같은 라우트**(`/api/me/diary-csv`)로 간다 —
 *   두 벌로 두면 한쪽만 고쳐져 같은 재배가 화면마다 다른 파일을 낸다.
 *   ⚠️ 그래서 `CsvDownloadButton` 을 안 쓴다. BOM·한글 파일 이름·주인 확인이
 *     전부 라우트 한 자리에 모여 있다.
 *
 * - **주인 확인은 라우트가 한다.** 주소에 남의 재배 id 를 적어 넣어도
 *   `plots!inner(user_id)` 에서 걸러져 404 가 된다.
 *
 * ⚠️ 예전에는 `disabled` 인 채 "준비 중입니다" 를 달고 있었다. 줄을 만드는 쪽
 *    (`domain/diaryCsv.ts`)이 먼저 다 되어 있었고 버튼만 잠겨 있던 것이다.
 *
 * [Usage]
 * ```tsx
 * <DiaryExportButton cultivationId={card.id} />
 * ```
 * ---------------------------------------------
 */

export function DiaryExportButton({
  cultivationId,
}: {
  cultivationId: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {/* ⚠ `download` 속성을 달지 않는다. 파일 이름은 라우트가
          `Content-Disposition` 으로 정한다 — 여기서 또 적으면 두 벌이 되고,
          한글 이름은 `filename*=UTF-8''…` 이라야 안 깨진다. */}
      <ButtonLink
        href={`/api/me/diary-csv?id=${encodeURIComponent(cultivationId)}`}
        size="sm"
        variant="outline"
      >
        파일로 내려받기
      </ButtonLink>
      <span className="text-fg-subtle text-xs">
        지금까지 적은 기록을 CSV 로 받습니다
      </span>
    </div>
  );
}

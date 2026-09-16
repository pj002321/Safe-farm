import { FieldIcon, SproutIcon } from "@/components/icons";
import { Button } from "@/components/shared/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { Field } from "@/components/shared/Field";
import type { PlotCard } from "@/features/plots/domain/plotSummary";
import { cropById } from "./crops";
import { plotFaceClass } from "./plotFace";
import { ARM_CLASS, ARM_NONE_ID, DELETE_FORM_ID } from "./plotManage";

/**
 * ---------------------------------------------
 * [Feature]: 마이페이지 — 등록 텃밭 목록 · 수정 · 삭제
 *
 * [Description]
 * - 카드가 아니라 **줄**이다. 대시보드의 `PlotStrip` 은 '오늘 상태'를 보는 카드고,
 *   여기는 '목록을 관리'하는 곳이다. 같은 데이터라도 목적이 다르면 밀도도 다르다.
 *
 * - **고칠 수 있는 것은 이름과 넓이뿐이다.** 위치·작물·파종일은 등록 화면으로
 *   보낸다. 감이 아니라 근거가 있다: `grid_x`·`grid_y` 는 위경도에서 계산되는
 *   값이라 지도 없는 폼이 좌표를 받으면 **좌표만 바뀌고 격자는 그대로 남아 엉뚱한
 *   동네의 예보**를 받게 된다(`editPlot.ts`·`20260915120000_plots_manage.sql`).
 *   그리고 이름·넓이는 마법사 2단계가 "나중에 바꿀 수 있습니다"라고 한 바로 그 값이다.
 *
 * - 펼치기에 네이티브 `<details>` 를 쓴다. JS 0줄이고 키보드 조작이 공짜로 따라온다.
 *
 * - **삭제는 의도적인 행동을 두 번 요구한다**(제14조).
 *     ① '삭제' 를 열면 그 줄이 물들고, **밭 이름을 부르는 경고**가 펼쳐진다.
 *     ② 결과가 적힌 버튼('삭제합니다')을 누른다. '확인' 이라고 적지 않는다.
 *   되돌리기는 **일부러 만들지 않았다** — soft delete 는 컬럼·정책·모든 읽기 경로의
 *   필터가 한 벌로 따라오는데, 날아가는 것은 방금 본인이 만든 한 행이고 이 행을
 *   참조하는 테이블이 하나도 없다. 제14조는 '경고와 확인 **또는** 복구 수단'이다.
 *   // ponytail: 하드 삭제. 되살리기가 필요해지면 deleted_at + 읽기 필터로 올린다.
 *
 * - ⚠️ 겨냥 라디오는 **삭제 폼 밖에 있으면서 `form` 속성으로 그 폼에 속한다.**
 *   줄 안에 있어야 `has-[:checked]:` 로 그 줄을 물들일 수 있고(그건 DOM 조상
 *   관계다), 동시에 폼 소유자가 삭제 폼이어야 값이 함께 제출된다. 폼을 목록
 *   바깥에 두는 이유는 **폼은 중첩할 수 없기** 때문이다 — 줄마다 수정 폼이 따로 있다.
 *
 * [Usage]
 * ```tsx
 * <PlotManagePanel plots={plots} onSave={updatePlot} onDelete={removePlot} />
 * ```
 * ---------------------------------------------
 */

interface PlotManageListProps {
  plots: readonly PlotCard[];
  onSave: (formData: FormData) => Promise<void>;
  onDelete: (formData: FormData) => Promise<void>;
}

/** 넓이를 사람이 읽는 말로. 안 적었으면 '넓이 미입력'. */
function areaKo(areaM2: number | null): string {
  if (areaM2 === null) return "넓이 미입력";
  const pyeong = Math.round(areaM2 / 3.305785);
  return `${Math.round(areaM2).toLocaleString("ko-KR")}㎡ · 약 ${pyeong.toLocaleString("ko-KR")}평`;
}

export function PlotManageList({
  plots,
  onSave,
  onDelete,
}: PlotManageListProps) {
  if (plots.length === 0) {
    return (
      <EmptyState
        actionHref="/plots/new"
        actionKo="텃밭 등록하기"
        bodyKo="밭 위치와 작물을 알려 주시면, 그 자리의 기상 관측으로 할 일을 만들어 드립니다."
        icon={<SproutIcon />}
        titleKo="아직 등록한 텃밭이 없습니다"
      />
    );
  }

  return (
    <>
      {/*
        삭제 폼. **비어 있다** — 겨냥 라디오가 목록 안에서 `form` 속성으로 이 폼을
        가리키고, 독의 제출 버튼도 같은 방식으로 붙는다. 폼을 목록 바깥에 두어야
        줄마다 있는 수정 폼과 중첩되지 않는다.
      */}
      <form action={onDelete} id={DELETE_FORM_ID} />

      {/* 아무것도 겨냥하지 않은 상태. '취소'가 이걸 고른다. */}
      <input
        className="sr-only"
        defaultChecked
        form={DELETE_FORM_ID}
        id={ARM_NONE_ID}
        name="plotId"
        type="radio"
        value=""
      />

      <ul className="flex flex-col gap-3">
        {plots.map((plot) => (
          <PlotRow key={plot.id} onSave={onSave} plot={plot} />
        ))}
      </ul>

      <p className="mt-4 text-fg-subtle text-xs leading-relaxed">
        위치·작물·파종일을 바꾸시려면 지도가 필요합니다.{" "}
        <a className="text-accent hover:underline" href="/plots/new">
          새로 등록
        </a>
        해 주세요.
      </p>
    </>
  );
}

function PlotRow({
  plot,
  onSave,
}: {
  plot: PlotCard;
  onSave: (formData: FormData) => Promise<void>;
}) {
  const armId = `arm-${plot.id}`;
  const cropsKo =
    plot.cropIds.length > 0 ? plot.cropIds.join(" · ") : "작물 미지정";

  return (
    // 겨냥되면 줄 전체가 물든다. `has-[:checked]` 는 이 <li> 가 겨냥 라디오의
    // 조상이라 성립한다 — 폼 소유자가 누구인지와는 무관하다.
    <li className="group/row overflow-hidden rounded-xl border border-border bg-surface transition-colors duration-200 ease-out-expo has-[:checked]:border-unsuitable/50 has-[:checked]:bg-unsuitable/5">
      <input
        aria-label={`${plot.nameKo ?? "이름 없는 밭"} 삭제 대상으로 고르기`}
        className={`${ARM_CLASS} sr-only`}
        form={DELETE_FORM_ID}
        id={armId}
        name="plotId"
        type="radio"
        value={plot.id}
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
        {/* 홈 카드와 **같은 얼굴**이다. 화면이 달라도 같은 밭은 같게 보여야
            "아까 그 밭"이라는 것이 한눈에 붙는다. */}
        <span
          aria-hidden="true"
          className={`grid size-9 shrink-0 place-items-center rounded-full ${plotFaceClass(plot.id)}`}
        >
          {cropById(plot.cropIds[0])?.icon ?? <FieldIcon />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-fg">
            {plot.nameKo ?? "이름 없는 밭"}
          </p>
          <p className="mt-0.5 truncate text-fg-muted text-xs">
            {plot.regionKo}
          </p>
        </div>
        <p className="font-mono text-fg-muted text-xs tabular-nums">
          {areaKo(plot.areaM2)} · {cropsKo}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
        {/* ── 수정 ─────────────────────────────── */}
        <details className="w-full [&_summary]:list-none">
          <summary className="inline-flex w-fit cursor-pointer items-center rounded-md px-3 py-1.5 font-medium text-fg-muted text-sm transition-colors duration-200 ease-out-expo hover:bg-surface-2 hover:text-fg">
            수정
          </summary>
          <form
            action={onSave}
            className="mt-3 grid gap-4 rounded-lg bg-surface-2 p-4 sm:grid-cols-2"
          >
            <input name="plotId" type="hidden" value={plot.id} />
            <Field
              defaultValue={plot.nameKo ?? ""}
              label="텃밭 이름"
              maxLength={40}
              name="name"
              placeholder="배추밭"
            />
            <Field
              defaultValue={plot.areaM2 === null ? "" : Math.round(plot.areaM2)}
              hint="어림잡으셔도 됩니다."
              inputMode="numeric"
              label="넓이(㎡)"
              min={1}
              name="areaM2"
              type="number"
            />
            <input name="areaUnit" type="hidden" value="m2" />
            <div className="sm:col-span-2">
              <Button size="sm" type="submit">
                저장
              </Button>
            </div>
          </form>
        </details>

        {/* ── 삭제 ─────────────────────────────── */}
        <label
          className="inline-flex w-fit cursor-pointer items-center rounded-md px-3 py-1.5 font-medium text-fg-muted text-sm transition-colors duration-200 ease-out-expo hover:bg-unsuitable/10 hover:text-unsuitable"
          htmlFor={armId}
        >
          삭제
        </label>
      </div>

      {/*
        경고. 겨냥했을 때만 펼쳐진다. **파괴 대상의 이름을 그 자리에서 부른다** —
        목록이 길면 어느 줄을 눌렀는지 스스로도 헷갈린다.
        이 블록만으로 삭제가 완결되므로 독이 없는 넓은 화면에서도 동작한다.
      */}
      <div className="hidden border-unsuitable/25 border-t bg-unsuitable/5 px-5 py-4 group-has-[:checked]/row:block">
        <p className="text-fg text-sm leading-relaxed">
          <strong className="font-semibold">
            &ldquo;{plot.nameKo ?? "이름 없는 밭"}&rdquo;
          </strong>
          을 삭제합니다. 위치·작물·파종일이 함께 사라지고{" "}
          <strong className="font-semibold text-unsuitable">
            되돌릴 수 없습니다.
          </strong>{" "}
          지난 재배 기록은 남습니다.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            form={DELETE_FORM_ID}
            size="sm"
            type="submit"
            variant="danger"
          >
            삭제합니다
          </Button>
          <label
            className="cursor-pointer rounded-md px-3 py-1.5 font-medium text-fg-muted text-sm transition-colors duration-200 ease-out-expo hover:bg-surface-2 hover:text-fg"
            htmlFor={ARM_NONE_ID}
          >
            취소
          </label>
        </div>
      </div>
    </li>
  );
}

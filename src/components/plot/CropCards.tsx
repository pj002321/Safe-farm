"use client";

import { type ReactNode, useState } from "react";
import {
  CalendarIcon,
  CheckIcon,
  HarvestIcon,
  LeafIcon,
  SearchIcon,
  SproutIcon,
} from "@/components/icons";
import type {
  CropOption,
  MaturityOption,
} from "@/features/crops/domain/cropOption";
import { DEFAULT_MATURITY } from "@/shared/growth/maturity";

/**
 * ---------------------------------------------
 * [Feature]: 작물 카드 복수 선택 + 작물별 파종 정보 (마크업 전용)
 *
 * [Description]
 * - 칩에서 카드로 올렸다. 스펙이 **난이도와 재배 기간을 카드에 표기**하라고 해서,
 *   한 줄짜리 칩으로는 담을 자리가 없다. 처음 짓는 사람이 "배추가 쉬운가"를
 *   고르는 자리이므로 그 정보가 선택 옆에 있어야 한다.
 * - **선택 상태는 여전히 JS 로 들고 있지 않는다.** 네이티브 체크박스를 숨기고
 *   `has-[:checked]:` 로 카드 모양만 바꾼다. 키보드·스크린리더·폼 제출이 공짜로
 *   따라온다 — 검색을 붙이면서도 이 부분은 그대로 뒀다.
 * - **검색만 `"use client"` 다.** CSS 는 타이핑한 문자열과 형제 요소의 텍스트를
 *   비교할 방법이 없어서(그런 선택자가 없다) 여기만은 `useState` 로 입력값을
 *   들고, 안 맞는 카드에 `hidden` 을 붙인다. 배열에서 걸러내지 않고 **DOM 에는
 *   그대로 남기는** 이유: 검색어를 지우기 전에 걸러진 카드가 체크돼 있었다면,
 *   배열에서 빼는 순간 그 입력(체크·파종일)이 통째로 사라진다.
 * - 선택을 **색으로만** 알리지 않는다. 오른쪽 위 체크 표시가 형태로 함께 말한다.
 *   선택 색은 `good`(NDVI 초록) 토큰을 쓴다 — 다른 카드는 회색이라 눈에 바로
 *   띈다.
 * - 난이도는 점 세 개로 그린다. "쉬움/보통/어려움" 글자를 함께 두되(스크린리더가
 *   읽는 것은 글자다), 눈으로는 점 개수가 빠르다.
 * - 작물 목록은 **호출자가 넘긴다.** 예전에는 여기 세 개가 박혀 있었는데, 그 id
 *   ("cabbage")가 작물 마스터(`crops.name` = "배추")와 달라 저장할 때 작물을
 *   찾을 수 없었다. 제출값은 `crop_id` 다 — 이름은 바뀌어도 id 는 안 바뀐다.
 * - **작물마다 파종일이 다를 수 있다**(배추는 8월, 무는 9월). 그래서 파종
 *   정보를 폼 전체에 하나만 두지 않고, 카드마다 체크되면 펼쳐지는 자기 몫의
 *   파종 필드를 둔다. 필드 이름은 `sowingDate.<cropId>` 식으로 cropId 를
 *   매단다 — 서버는 `parseCultivationSelections` 로 다시 묶는다.
 * - 체크박스는 `<label>` 안에, 파종 필드는 그 `<label>` **밖**(같은 카드
 *   `<div>` 안)에 둔다. 파종 필드를 label 안에 두면 날짜 칸을 클릭하는 것도
 *   "이 작물 클릭"으로 잡혀 체크가 풀린다.
 * - ⚠️ 카드 강조·펼침은 `has-[>label>input:checked]` 로, **label 의 직계
 *   체크박스만** 본다. 처음엔 `has-[:checked]` 로 했다가 카드 133장이 전부
 *   초록으로 뜨는 버그가 났다 — :has() 는 자손을 깊이와 무관하게 보므로,
 *   같은 `<div>` 안 파종 필드의 "씨앗" 라디오(`defaultChecked`, 카드마다 항상
 *   켜져 있다)까지 걸려서 실제로는 아무것도 안 골랐는데 다 골라진 것처럼
 *   보였다. 그 상태로는 진짜 선택과 구분이 안 돼 제출해도 `cropIds` 가
 *   비어 있었다 — "작물 추가가 안 된다"의 원인.
 * - 파종일은 **오늘까지만** 고를 수 있다(`maxSowingDate`). 미래 날짜를 넣으면
 *   "날짜를 압니다" 경로가 `GROWING` 으로 저장해, 아직 심지도 않은 작물이
 *   "자라는 중"으로 뜨고 적산온도까지 쌓기 시작한다. 브라우저의 `max` 는 달력만
 *   막으므로 서버(`toCultivationInputs`)도 같은 판정을 한다.
 *
 * [Usage]
 * ```tsx
 * const crops = await listCropOptions();
 * <CropCards crops={crops} defaultSelected={[5]} />
 * ```
 * ---------------------------------------------
 */

/**
 * 작물 이름 → 아이콘.
 *
 * 아이콘은 표시일 뿐이라 DB 에 둘 성질이 아니다. 여기 없는 작물이 마스터에
 * 추가돼도 기본 아이콘으로 그려진다 — 화면이 멈추지는 않는다.
 */
const ICONS: Record<string, ReactNode> = {
  상추: <LeafIcon />,
  배추: <LeafIcon />,
  무: <SproutIcon />,
  감자: <SproutIcon />,
  방울토마토: <HarvestIcon />,
  고추: <HarvestIcon />,
  오이: <HarvestIcon />,
  가지: <HarvestIcon />,
};

interface CropCardsProps {
  crops: readonly CropOption[];
  /** 폼 필드 이름. 선택한 값이 이 이름으로 여러 개 제출된다. */
  name?: string;
  /** 미리 선택해 둘 `crop_id`. */
  defaultSelected?: readonly number[];
  /**
   * 파종일로 고를 수 있는 마지막 날(한국 기준 오늘). 서버가 정해 내려보낸다 —
   * 여기서 `new Date()` 를 읽으면 서버가 그린 마크업과 달라 하이드레이션이 어긋난다.
   */
  maxSowingDate?: string;
  /**
   * 검색창 오른쪽에 붙일 제출 버튼. 주면 검색줄이 **화면 위에 붙어 따라온다.**
   *
   * ⚠️ 왜 여기로 올렸나 — 밭 상세의 '작물 추가' 는 버튼이 카드 79장 **아래**에 있어서
   *   두 장만 고르고도 끝까지 스크롤해야 눌렀다. 카드 수가 자료에 따라 늘기 때문에
   *   버튼을 아래 두면 화면이 길어질수록 나빠진다.
   * ⚠️ 등록 마법사(`plots/new`)는 주지 않는다. 거기는 하단 독(`PlotWizardDock`)이
   *   제출을 맡고 있어서, 주면 제출 버튼이 한 화면에 둘이 된다.
   * ⚠️ `CropCards` 는 폼 **안**에 있으므로 여기 버튼에 `form` 속성이 필요 없다.
   *   폼 밖에 두는 독과 다른 점이다.
   */
  action?: ReactNode;
}

export function CropCards({
  crops,
  name = "cropIds",
  defaultSelected = [],
  maxSowingDate,
  action,
}: CropCardsProps) {
  const [query, setQuery] = useState("");
  // 검색으로 걸러져도 **이미 고른 작물은 계속 보인다.** 안 그러면 체크한 채로
  // 검색하다가 카드가 사라져서 "선택이 풀렸나" 헷갈린다 — 값은 안 사라지는데
  // 눈에도 안 보이면 사용자 입장에선 사라진 것과 같다.
  const [selected, setSelected] = useState(() => new Set(defaultSelected));
  const trimmed = query.trim();
  const anyVisible = crops.some(
    (crop) => selected.has(crop.cropId) || crop.nameKo.includes(trimmed),
  );

  return (
    <div className="flex flex-col gap-3">
      {/* action 이 있을 때만 붙어 따라온다. `top-[4.5rem]` 은 앱 헤더(sticky top-0) 아래다 —
          `MeRail` 이 같은 값으로 헤더 밑에 붙는다. 데스크톱 헤더가 약 61px 라 `top-14`(56px)
          로 두면 검색창 윗부분이 헤더 밑에 숨는다. 배경을 칠하는 이유는 카드가 이 줄
          **뒤로** 흘러가기 때문이다. 음수 여백은 폼의 p-4 를 상쇄해 줄 전체를 덮는다. */}
      <div
        className={
          action
            ? "-mx-4 -mt-4 sticky top-[4.5rem] z-10 flex items-center gap-2 border-border border-b bg-surface-2 px-4 py-3"
            : "relative"
        }
      >
        <div className="relative flex-1">
          <span
            aria-hidden="true"
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 text-fg-subtle"
          >
            <SearchIcon className="size-4" />
          </span>
          <input
            aria-label="작물 검색"
            className="w-full rounded-md border border-border bg-surface py-2 pr-3 pl-10 text-fg text-sm transition-colors hover:border-accent focus:border-accent"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="작물 이름으로 검색"
            type="search"
            value={query}
          />
        </div>
        {action}
      </div>

      {!anyVisible && (
        <p className="rounded-md border border-border border-dashed px-4 py-6 text-center text-fg-muted text-sm">
          &ldquo;{query}&rdquo;와 일치하는 작물이 없습니다.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {crops.map((crop) => {
          // DOM 에서 지우지 않고 숨기기만 하는 이유는 위 docstring 참고 — 걸러진
          // 카드의 선택값을 잃지 않기 위해서다. 이미 고른 작물은 검색과 무관하게 둔다.
          const hidden =
            !selected.has(crop.cropId) &&
            trimmed !== "" &&
            !crop.nameKo.includes(trimmed);

          return (
            <div
              className={`group/crop overflow-hidden rounded-lg border border-border bg-surface transition-colors duration-200 ease-out-expo has-[>label>input:checked]:border-good has-[>label>input:checked]:bg-good/10 ${hidden ? "hidden" : ""}`}
              key={crop.cropId}
            >
              <label className="relative flex cursor-pointer flex-col p-4 transition-transform duration-200 ease-out-expo hover:-translate-y-0.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-offset-2">
                <input
                  className="peer sr-only"
                  defaultChecked={defaultSelected.includes(crop.cropId)}
                  name={name}
                  onChange={(e) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(crop.cropId);
                      else next.delete(crop.cropId);
                      return next;
                    });
                  }}
                  type="checkbox"
                  value={crop.cropId}
                />

                {/* 입력의 형제라야 peer-checked 가 닿는다. 색 말고 형태로도 알린다. */}
                <span className="absolute top-3 right-3 hidden size-5 place-items-center rounded-full bg-good text-accent-on peer-checked:grid">
                  <CheckIcon className="size-3" strokeWidth={3} />
                </span>

                {/* 체크 표시와 같은 구석이다. 체크되면 왼쪽으로 비켜선다 — 겹치면 글자가 가린다.
                    이것도 input 의 형제라야 peer-checked 가 닿는다. */}
                {crop.sowingNow && (
                  <span className="absolute top-3 right-3 rounded-full bg-accent-subtle px-2 py-0.5 text-[0.65rem] text-accent leading-4 peer-checked:right-10">
                    지금 심기 좋음
                  </span>
                )}

                <span className="grid size-10 place-items-center rounded-full bg-surface-2 text-xl text-fg-muted">
                  {ICONS[crop.nameKo] ?? <LeafIcon />}
                </span>

                <span className="mt-3 font-semibold text-[1.05rem] text-fg">
                  {crop.nameKo}
                </span>

                <span className="mt-3 flex items-center gap-2 border-border border-t pt-3">
                  <Difficulty
                    labelKo={crop.difficultyKo}
                    level={crop.difficultyLevel}
                  />
                  {/* 품종이 없으면 기간을 모른다. "약 0일"을 적지 않고 자리를 비운다. */}
                  {crop.durationKo && (
                    <span className="ml-auto font-mono text-[0.7rem] text-fg-subtle tabular-nums">
                      {crop.durationKo}
                    </span>
                  )}
                </span>
              </label>

              {/* 체크됐을 때만 펼쳐진다. label 밖이라 여길 눌러도 체크가 안 풀린다. */}
              <div className="hidden flex-col gap-3 border-border border-t bg-surface-2/60 p-4 group-has-[>label>input:checked]/crop:flex">
                <CropSowingFields
                  cropId={crop.cropId}
                  maturities={crop.maturities}
                  maxDate={maxSowingDate}
                  required={selected.has(crop.cropId)}
                  sowingWindowKo={crop.sowingWindowKo}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 작물 한 장 몫의 파종일·파종 미정·재배 방식. 필드 이름에 cropId 를 매단다.
 *
 * "날짜를 압니다"/"아직 안 심었어요" 를 **둘 다 안 고르고 넘어갈 수 있었다.**
 * 체크박스 하나로는 "안 심었어요" 만 표현할 뿐 "아무것도 안 골랐다"를 막을 수
 * 없어서(체크 안 함이 그 자체로 유효한 상태였다), 같은 이름의 필수 라디오
 * 두 개로 바꿨다 — `required` 라디오 그룹은 브라우저가 **하나를 고르기 전엔
 * 제출 자체를 막는다.**
 *
 * ⚠️ `required` 는 **이 작물이 실제로 선택됐을 때만** 건다(`required` prop,
 * `CropCards` 의 `selected` 상태에서 내려온다). 처음엔 항상 걸어 뒀다가 크게
 * 데었다 — 작물 카드가 500장 넘게 있는데, 안 고른 카드도 이 블록이 DOM 에는
 * 그대로 있고 `hidden`(display:none)으로만 감춰진다. `required` 인 hidden
 * 요소도 폼의 제출 가능 여부에는 그대로 들어간다(숨었다고 검사에서 빠지지
 * 않는다) — 그 결과 아무 작물도 못 골라도 매번 무효가 되어 등록 버튼이
 * **아무 반응 없이** 죽어 있었다. 날짜 입력에는 `required` 를 걸지 않는다 —
 * "아직 안 심었어요"를 고르면 이 칸 자체가 숨는데, 그 상태로 required 면 같은
 * 함정이 재현된다. 대신 서버(`toCultivationInputs`)가 날짜 없이 넘어오면
 * PLANNED 로 떨어뜨리는 안전장치를 그대로 쓴다.
 */
function CropSowingFields({
  cropId,
  required,
  maxDate,
  sowingWindowKo,
  maturities,
}: {
  cropId: number;
  required: boolean;
  maxDate?: string;
  /** "3.1~3.31에 씨를 뿌립니다". 마스터에 파종 창이 없는 작물은 null 이고 문구를 생략한다. */
  sowingWindowKo: string | null;
  /** 고를 수 있는 숙기. 조·중·만 차례다. 둘 이상일 때만 라디오를 띄운다. */
  maturities: readonly MaturityOption[];
}) {
  return (
    <div className="group/sowing flex flex-col gap-3">
      <fieldset className="flex flex-col gap-1.5">
        <legend className="font-medium text-fg text-xs">파종일</legend>
        <SowingStatusOption
          labelKo="날짜를 압니다"
          name={`sowingStatus.${cropId}`}
          required={required}
          value="known"
        />
        <SowingStatusOption
          labelKo="아직 안 심었어요"
          name={`sowingStatus.${cropId}`}
          required={required}
          value="unknown"
        />
      </fieldset>

      {/* "날짜를 압니다"를 골랐을 때만 나타난다 — group-has 가 라디오 값을 본다. */}
      <div className="hidden flex-col gap-1.5 group-has-[input[value=known]:checked]/sowing:flex">
        <label
          className="font-medium text-fg text-xs"
          htmlFor={`sowing-date-${cropId}`}
        >
          날짜 선택
        </label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 text-fg-subtle"
          >
            <CalendarIcon />
          </span>
          <input
            className="w-full rounded-md border border-border bg-surface py-2 pr-3 pl-10 text-fg text-sm transition-colors hover:border-accent focus:border-accent"
            id={`sowing-date-${cropId}`}
            max={maxDate}
            name={`sowingDate.${cropId}`}
            type="date"
          />
        </div>
        {/* ⚠️ 이 칸이 **무엇을 묻는지** 말해 준다. 라벨이 "날짜 선택" 뿐이라 아래 씨앗/모종을
            무엇으로 골랐든 같은 말이었고, 벼처럼 못자리와 모내기가 한 달쯤 떨어진 작물에서
            어느 날짜를 넣을지 알 수 없었다 — 실제로 한 사용자가 두 번 다르게 넣었다.
            작물마다 다른 말(벼 "모내기한 날")로 바꾸려면 마스터의 sow_method 를 화면까지
            날라야 하는데, 배선이 여섯 파일로 번진다. 파종 시기를 씨앗·모종 두 벌로 늘릴 때
            (교안_파종시기_두벌.md §1) 그 배선이 어차피 깔리므로 그때 문장을 나눈다. */}
        <p className="text-fg-subtle text-xs">
          씨앗은 씨 뿌린 날, 모종은 옮겨 심은 날을 넣어 주세요.
        </p>
      </div>

      {/* "아직 안 심었어요" 를 골랐을 때만. 날짜를 아는 사람에게는 권장 시기가 참견이다.
          ⚠️ 작물 기준 창이지 지역 기준이 아니다(마스터에 지역이 없다) — 그래서 안내만 하고
             창 밖이라고 막지 않는다. 틀릴 수 있는 정보로 막으면 안 된다. */}
      {sowingWindowKo && (
        <p className="hidden text-fg-subtle text-xs group-has-[input[value=unknown]:checked]/sowing:block">
          이 작물은 보통 <span className="text-fg">{sowingWindowKo}</span>.
        </p>
      )}

      {/* 숙기가 하나뿐인 56작물(2026-09-18)에는 안 띄운다 — 고를 것도 없는 칸이
          카드의 3분의 1을 채운다. 기본값은 서버(resolveVariantIds)의 대체 순서와 **같은 파일**
          (shared/growth/maturity.ts)에서 온다 — 따로 적으면 화면과 서버가 다른 것을 고른다.
          ⚠️ required 를 걸지 않는다. 안 고르면 서버가 중생으로 떨어뜨리므로 막을 이유가 없고,
             hidden 인 카드에 required 를 걸면 등록 버튼이 조용히 죽는다(위 docstring). */}
      {maturities.length >= 2 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="font-medium text-fg text-xs">품종 숙기</legend>
          <div className="flex gap-2">
            {maturities.map((m) => (
              <CropMaturityOption
                cropId={cropId}
                defaultChecked={m.type === DEFAULT_MATURITY}
                key={m.type}
                // 조·중·만이라는 말이 초보자에게 안 통할 수 있다. 일수를 같이 적으면 고를 수 있다
                labelKo={
                  m.daysToHarvest
                    ? `${m.labelKo} ${m.daysToHarvest}일`
                    : m.labelKo
                }
                value={m.type}
              />
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="flex gap-2">
        <legend className="sr-only">재배 방식</legend>
        <CropSowingMethod
          cropId={cropId}
          defaultChecked
          labelKo="씨앗"
          value="seed"
        />
        <CropSowingMethod cropId={cropId} labelKo="모종" value="seedling" />
      </fieldset>
    </div>
  );
}

/**
 * "날짜를 압니다"/"아직 안 심었어요" 라디오 한 칸.
 *
 * 밭 등록·작물 추가(`CropSowingFields`, cropId 로 필드 이름을 매단다)와 밭
 * 상세의 파종일 수정(`plots/[id]/page.tsx`, 재배 한 건뿐이라 이름이 그대로다)
 * 이 같이 쓴다.
 */
export function SowingStatusOption({
  name,
  value,
  labelKo,
  defaultChecked,
  required = true,
}: {
  name: string;
  value: "known" | "unknown";
  labelKo: string;
  defaultChecked?: boolean;
  /** 기본은 항상 필수(밭 상세의 단독 수정 폼). 여러 작물 카드가 섞인 폼에서는
      선택된 카드만 필수로 걸어야 한다 — `CropSowingFields` 주석 참고. */
  required?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        className="peer sr-only"
        defaultChecked={defaultChecked}
        name={name}
        required={required}
        type="radio"
        value={value}
      />
      {/* peer-checked 는 이 input 의 형제에만 닿으므로 안쪽 점을 따로 두지
          않고, 이 원 자체를 채운다(TaskBoard 의 완료 표시와 같은 방식). */}
      <span className="grid size-4 shrink-0 place-items-center rounded-full border border-border-strong bg-surface transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-focus-visible:outline-offset-2" />
      <span className="select-none text-fg-muted text-xs leading-relaxed">
        {labelKo}
      </span>
    </label>
  );
}

/**
 * 숙기 라디오 한 칸. `CropSowingMethod` 와 같은 모양이되 이름만 다르다.
 *
 * 숙기가 바뀌면 재배 일수와 목표 GDD 가 같이 바뀐다 — 배추 45~55일, 밀 216~264일.
 * 조생종은 셋 중 가장 짧아 잘못 고르면 **늘 이르게** 틀린다(수확 시기를 지났다고 뜬다).
 */
function CropMaturityOption({
  cropId,
  value,
  labelKo,
  defaultChecked,
}: {
  cropId: number;
  value: string;
  labelKo: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex-1 cursor-pointer rounded-md border border-border bg-surface px-2.5 py-1.5 text-center text-xs transition-colors duration-200 ease-out-expo has-[:checked]:border-accent has-[:checked]:bg-accent-subtle has-[:checked]:text-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-offset-2">
      <input
        className="sr-only"
        defaultChecked={defaultChecked}
        name={`maturity.${cropId}`}
        type="radio"
        value={value}
      />
      {labelKo}
    </label>
  );
}

function CropSowingMethod({
  cropId,
  value,
  labelKo,
  defaultChecked,
}: {
  cropId: number;
  value: string;
  labelKo: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex-1 cursor-pointer rounded-md border border-border bg-surface px-2.5 py-1.5 text-center text-xs transition-colors duration-200 ease-out-expo has-[:checked]:border-accent has-[:checked]:bg-accent-subtle has-[:checked]:text-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-offset-2">
      <input
        className="sr-only"
        defaultChecked={defaultChecked}
        name={`sowingMethod.${cropId}`}
        type="radio"
        value={value}
      />
      {labelKo}
    </label>
  );
}

/**
 * 난이도 표시.
 *
 * 점만 그리면 스크린리더가 아무것도 못 읽는다. 점은 `aria-hidden` 으로 감추고
 * 글자를 함께 둔다 — 눈으로는 점이 빠르고, 읽히는 것은 글자다.
 */
function Difficulty({ level, labelKo }: { level: 1 | 2 | 3; labelKo: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className="flex gap-0.5">
        {[1, 2, 3].map((dot) => (
          <span
            className={`size-1.5 rounded-full ${
              dot <= level ? "bg-caution" : "bg-border-strong"
            }`}
            key={dot}
          />
        ))}
      </span>
      <span className="text-[0.7rem] text-fg-muted">{labelKo}</span>
    </span>
  );
}

import { CalendarIcon, SproutIcon } from "@/components/icons";

/**
 * ---------------------------------------------
 * [Feature]: 재배 정보 입력 — 파종일 · 재배 방식 (마크업 전용)
 *
 * [Description]
 * - 파종일은 **네이티브 `<input type="date">`** 다. 달력 UI 를 직접 만들면 키보드
 *   조작·로캘·모바일 기본 달력을 전부 다시 구현해야 하고 대부분 빠뜨린다.
 *   브라우저가 이미 갖고 있는 것을 쓴다.
 * - 씨앗/모종은 **라디오**다. 체크박스가 아닌 이유는 둘 중 하나만 고를 수 있기
 *   때문이고, `<select>` 가 아닌 이유는 선택지가 둘뿐이라 펼치는 동작이 낭비여서다.
 *   모종은 시작 GDD 보정값이 붙는다는 것을 선택지 옆에 적어 둔다 — 왜 묻는지
 *   모르면 아무거나 고른다.
 * - **파종일 미정을 허용한다**(스펙). 체크하면 날짜 대신 권장 파종 시기를
 *   안내하는 자리로 바뀐다. `has-[:checked]:` 로 날짜 칸을 흐리게 하고 안내를
 *   띄우는 것까지가 마크업의 몫이고, 실제 비활성화와 권장 시기 계산은 로직이다.
 * - 과거 날짜를 고르면 GDD 를 소급 계산한다는 것을 **미리** 알린다. 입력 뒤에
 *   알리면 "왜 숫자가 갑자기 생겼지"가 된다.
 *
 * [Usage]
 * ```tsx
 * <SowingFields />
 * ```
 * ---------------------------------------------
 */

export function SowingFields() {
  return (
    // 파종 미정 체크가 아래 날짜 칸의 모양을 바꾼다. 둘이 한 덩어리라 같이 감싼다.
    <div className="group/sowing flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          className="font-medium text-fg text-sm"
          htmlFor="plot-sowing-date"
        >
          파종일
        </label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 text-fg-subtle"
          >
            <CalendarIcon />
          </span>
          <input
            className="w-full rounded-md border border-border bg-surface py-2.5 pr-3 pl-10 text-fg transition-colors hover:border-accent focus:border-accent"
            id="plot-sowing-date"
            name="sowingDate"
            type="date"
          />
        </div>
        <p className="text-fg-muted text-xs">
          지난 날짜를 고르시면 그날부터 오늘까지의 기상으로 적산온도를 거슬러
          계산합니다.
        </p>
      </div>

      {/* 파종 미정. 체크하면 아래 안내가 열린다. */}
      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          className="peer sr-only"
          name="sowingUnknown"
          type="checkbox"
          value="1"
        />
        <span className="mt-0.5 grid size-[1.125rem] shrink-0 place-items-center rounded-sm border border-border-strong bg-surface text-transparent transition-colors peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-on peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-focus-visible:outline-offset-2">
          <span className="text-[0.7rem] leading-none">✓</span>
        </span>
        <span className="select-none text-fg text-sm leading-relaxed">
          아직 안 심었어요
          <span className="mt-0.5 block text-fg-muted text-xs">
            심을 시기를 대신 알려 드립니다.
          </span>
        </span>
      </label>

      {/* 파종 미정일 때만 보이는 안내. group-has 로 위 체크를 본다. */}
      <p className="hidden gap-2 rounded-md bg-accent-subtle px-3.5 py-3 text-accent text-xs leading-relaxed group-has-[input[name='sowingUnknown']:checked]/sowing:flex">
        <SproutIcon className="mt-0.5 shrink-0" />밭 위치와 작물이 정해지면 그
        지역 기준 권장 파종 시기를 계산해 알려드립니다.
      </p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium text-fg text-sm">재배 방식</legend>
        <div className="grid grid-cols-2 gap-2">
          <SowingMethod
            descriptionKo="씨를 뿌린 날부터 셉니다"
            labelKo="씨앗"
            value="seed"
            defaultChecked
          />
          <SowingMethod
            descriptionKo="이미 자란 만큼 보정합니다"
            labelKo="모종"
            value="seedling"
          />
        </div>
      </fieldset>
    </div>
  );
}

function SowingMethod({
  value,
  labelKo,
  descriptionKo,
  defaultChecked,
}: {
  value: string;
  labelKo: string;
  descriptionKo: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="cursor-pointer rounded-md border border-border bg-surface px-3.5 py-3 transition-colors duration-200 ease-out-expo hover:border-accent has-[:checked]:border-accent has-[:checked]:bg-accent-subtle has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring has-[:focus-visible]:outline-offset-2">
      <input
        className="sr-only"
        defaultChecked={defaultChecked}
        name="sowingMethod"
        type="radio"
        value={value}
      />
      <span className="block font-medium text-fg text-sm">{labelKo}</span>
      <span className="mt-0.5 block text-fg-muted text-xs">
        {descriptionKo}
      </span>
    </label>
  );
}

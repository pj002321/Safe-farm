import { type MaturityType, toMaturityType } from "@/shared/growth/maturity";

/**
 * ---------------------------------------------
 * [Feature]: 작물 선택 폼 값 파싱 (순수 함수)
 *
 * [Description]
 * - 밭 등록·밭 상세 "작물 추가" 둘 다 같은 모양의 폼을 쓴다: 작물을 여러 개
 *   고르고, **고른 작물마다** 파종일·파종 미정 여부·재배 방식을 따로 받는다.
 *   필드 이름은 `sowingDate.<cropId>` 식으로 cropId 를 매달아 구분한다 — 한
 *   필드로 합쳐 받으면(예전처럼) 여러 작물이 파종일 하나를 나눠 쓰게 된다.
 * - 두 화면(`app/(app)/plots/new`, `app/(app)/plots/[id]`)이 이 파일을 같이
 *   부른다. `features/plots`·`features/cultivations` 서로는 import 할 수 없어서
 *   (AGENTS.md) 두 액션 다 app 계층에서 이 함수를 직접 부르고, 품종 조회
 *   (`resolveVariantIds`)와 저장(`insertCultivations`)도 거기서 잇는다.
 * ---------------------------------------------
 */

export interface CultivationSelection {
  cropId: number;
  sowingDate: string | null;
  sowingUnknown: boolean;
  sowingMethod: "seed" | "seedling";
  /**
   * 고른 숙기. 라디오가 뜨지 않는 작물(숙기가 하나뿐인 56작물)은 null 이고,
   * 그때는 `resolveVariantIds` 가 중생 우선으로 정한다.
   */
  maturity: MaturityType | null;
}

/** `cropIds` 로 체크된 작물마다, 그 작물 전용 파종 필드를 읽는다. */
export function parseCultivationSelections(
  formData: FormData,
): CultivationSelection[] {
  const cropIds = formData
    .getAll("cropIds")
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);

  return cropIds.map((cropId) => {
    const sowingDate = formData.get(`sowingDate.${cropId}`);
    return {
      cropId,
      sowingDate:
        typeof sowingDate === "string" && sowingDate ? sowingDate : null,
      // 필수 라디오("날짜를 압니다"/"아직 안 심었어요")가 정상적으로 오면 항상
      // 둘 중 하나다. 필드 자체가 없으면(폼 밖에서 직접 POST 한 경우) 미정
      // 취급한다 — 아래 toCultivationInputs 의 안전장치와 같은 방향이다.
      sowingUnknown: formData.get(`sowingStatus.${cropId}`) !== "known",
      sowingMethod:
        formData.get(`sowingMethod.${cropId}`) === "seedling"
          ? ("seedling" as const)
          : ("seed" as const),
      // ⚠ 폼에서 온 글자를 그대로 믿지 않는다. 폼 밖에서 직접 POST 하면 아무 글자나
      //   올 수 있고, 그 값이 DB CHECK 에 걸려 등록 전체가 깨진다. 셋이 아니면 null 로
      //   떨어뜨려 중생 우선 규칙에 맡긴다
      maturity: toMaturityType(formData.get(`maturity.${cropId}`)),
    };
  });
}

/**
 * 선택을 `insertCultivations` 입력 모양으로 바꾼다.
 *
 * `variantIdByCropId` 에 없는 작물(품종 마스터 공백)은 건너뛴다 — 저장할 품종이
 * 없어서다. "아직 안 심었어요"는 `PLANNED` 로, 날짜도 함께 비운다(폼에 남아
 * 있었어도 미정이면 의미가 없다).
 *
 * ⚠️ "아직 안 심었어요"를 **안** 눌렀어도 날짜 칸을 비워 두고 제출할 수 있다
 * (날짜 입력에 `required` 가 없다). 그 경우도 `GROWING` 으로 넣으면
 * `sowing_date` 도 `start_stage_order` 도 없는 행이 되어 DB 의
 * `ck_cultivations_gdd_origin` 제약(둘 다 비면 적산을 시작할 지점이 없다,
 * `20260916000001_cultivations.sql`)에 막혀 insert 가 통째로 실패한다.
 * 그래서 상태는 체크박스가 아니라 **날짜 존재 여부**로 정한다.
 *
 * ⚠️ **오늘보다 뒤의 날짜도 `PLANNED` 다.** 아직 심지 않았는데 `GROWING` 으로
 * 넣으면 카드가 "자라는 중"으로 뜨고, GDD 게이지가 아직 오지 않은 날을 기준점으로
 * 잡는다. 폼은 `max` 로 달력을 오늘에서 끊지만(`CropCards`), 그건 달력 얘기일
 * 뿐이다 — 이 함수를 타는 두 액션이 공개 POST 라 값은 여기서 다시 본다.
 * 다만 날짜 자체는 지우지 않는다 — "미정"과 달리 언제 심을지는 아는 값이고,
 * 스키마도 `PLANNED` 에 심을 예정일을 허용한다(`ck_cultivations_gdd_origin`).
 */
export function toCultivationInputs(
  selections: readonly CultivationSelection[],
  variantIdByCropId: ReadonlyMap<number, number>,
  /** 한국 기준 오늘(`kstDateString()`). 날짜 문자열끼리 비교한다. */
  today: string,
) {
  const inputs: {
    variantId: number;
    status: "PLANNED" | "GROWING";
    sowingDate: string | null;
    sowingType: "SEED" | "SEEDLING";
  }[] = [];

  for (const selection of selections) {
    const variantId = variantIdByCropId.get(selection.cropId);
    if (variantId === undefined) continue;

    const future =
      selection.sowingDate !== null && selection.sowingDate > today;
    const planned = selection.sowingUnknown || !selection.sowingDate || future;
    inputs.push({
      variantId,
      status: planned ? "PLANNED" : "GROWING",
      sowingDate: selection.sowingUnknown ? null : selection.sowingDate,
      sowingType: selection.sowingMethod === "seedling" ? "SEEDLING" : "SEED",
    });
  }

  return inputs;
}

/**
 * ---------------------------------------------
 * [Feature]: 마이페이지 구역 — 단일 출처
 *
 * [Description]
 * - 왼쪽 레일과 각 패널이 **같은 목록**을 본다. 두 벌로 두면 한쪽에만 구역을
 *   더했을 때 레일에 없는 화면이 생긴다(`appTabs.tsx` 와 같은 이유).
 * - **기능 넷을 구역 셋으로 접었다.** 'CSV 내보내기' 는 버튼 하나 + 설명 한 줄이라
 *   독립 구역으로 만들면 눌러 들어가서 버튼 하나를 보는 화면이 된다. 내보내기는
 *   "지금 보고 있는 것을 내보낸다"가 유일하게 말이 되는 자리, 즉 재배 기록 머리에 둔다.
 *   덤으로 연도 필터가 곧 내보내기 범위가 된다.
 * - **좁은 화면에서는 구역을 나누지 않는다.** 셋 다 세로로 쌓는다. 설정 화면은
 *   훑어보는 곳이고, 네 줄짜리 계정 정보를 보려고 탭을 누르게 할 이유가 없다.
 *   넓은 화면에서만 레일로 갈아 끼운다 — 거기서는 세로로 쌓으면 왼쪽이 텅 빈다.
 * - ⚠️ 클래스를 **반복문으로 만들 수 없다.** Tailwind 는 클래스 문자열을 정적으로
 *   읽으므로 `group-has-[#me-${id}:checked]` 같은 조립은 생성되지 않고 조용히
 *   사라진다. 그래서 세 벌을 **리터럴로** 적는다.
 * - 지시자가 없는 평범한 모듈이다. 서버 컴포넌트가 읽어야 하므로 `"use client"` 를
 *   붙이면 안 된다(`bottomTabsLayout.ts` 주석의 함정과 같은 이유).
 *
 * [Usage]
 * ```ts
 * import { ME_SECTIONS } from "@/components/me/meSections";
 * ```
 * ---------------------------------------------
 */

export interface MeSection {
  id: string;
  labelKo: string;
  /** 좁은 화면에서 쌓였을 때 각 구역 위에 붙는 제목. */
  titleKo: string;
  /** 레일 항목이 현재 구역일 때 입는 옷. 완성된 클래스 문자열이어야 한다. */
  rail: string;
  /**
   * 패널 보임 규칙.
   * 좁은 화면은 전부 보이고(`block`), lg 이상에서만 고른 것 하나만 보인다.
   * `lg:hidden`(0,1,0) 보다 `lg:group-has-[#id:checked]`(1,1,0) 의 특이도가
   * 높아서 순서와 무관하게 선택된 구역이 이긴다.
   */
  panel: string;
}

export const ME_SECTIONS: readonly MeSection[] = [
  {
    id: "me-account",
    labelKo: "계정 정보",
    titleKo: "계정 정보",
    rail: "group-has-[#me-account:checked]/me:border-accent group-has-[#me-account:checked]/me:bg-accent-subtle group-has-[#me-account:checked]/me:text-accent group-has-[#me-account:focus-visible]/me:outline group-has-[#me-account:focus-visible]/me:outline-2 group-has-[#me-account:focus-visible]/me:outline-ring group-has-[#me-account:focus-visible]/me:outline-offset-2",
    panel: "block lg:hidden lg:group-has-[#me-account:checked]/me:block",
  },
  {
    id: "me-plots",
    labelKo: "텃밭 관리",
    titleKo: "텃밭 관리",
    rail: "group-has-[#me-plots:checked]/me:border-accent group-has-[#me-plots:checked]/me:bg-accent-subtle group-has-[#me-plots:checked]/me:text-accent group-has-[#me-plots:focus-visible]/me:outline group-has-[#me-plots:focus-visible]/me:outline-2 group-has-[#me-plots:focus-visible]/me:outline-ring group-has-[#me-plots:focus-visible]/me:outline-offset-2",
    panel: "block lg:hidden lg:group-has-[#me-plots:checked]/me:block",
  },
  {
    id: "me-records",
    labelKo: "재배 기록",
    titleKo: "지난 재배 기록",
    rail: "group-has-[#me-records:checked]/me:border-accent group-has-[#me-records:checked]/me:bg-accent-subtle group-has-[#me-records:checked]/me:text-accent group-has-[#me-records:focus-visible]/me:outline group-has-[#me-records:focus-visible]/me:outline-2 group-has-[#me-records:focus-visible]/me:outline-ring group-has-[#me-records:focus-visible]/me:outline-offset-2",
    panel: "block lg:hidden lg:group-has-[#me-records:checked]/me:block",
  },
  {
    id: "me-ask",
    labelKo: "질문 기록",
    titleKo: "지난 질문 기록",
    rail: "group-has-[#me-ask:checked]/me:border-accent group-has-[#me-ask:checked]/me:bg-accent-subtle group-has-[#me-ask:checked]/me:text-accent group-has-[#me-ask:focus-visible]/me:outline group-has-[#me-ask:focus-visible]/me:outline-2 group-has-[#me-ask:focus-visible]/me:outline-ring group-has-[#me-ask:focus-visible]/me:outline-offset-2",
    panel: "block lg:hidden lg:group-has-[#me-ask:checked]/me:block",
  },
];

/**
 * 삭제를 겨냥한 라디오가 공유하는 클래스.
 *
 * 독은 "**어느** 밭이 겨냥됐나"가 아니라 "하나라도 겨냥됐나"만 알면 되므로
 * id 가 아니라 이 클래스를 본다(`group-has-[.arm:checked]/me:`). 덕분에 밭이
 * 몇 개든 클래스를 새로 만들 필요가 없다 — id 로 하면 밭마다 클래스가 달라져
 * Tailwind 가 정적으로 읽지 못한다.
 */
export const ARM_CLASS = "arm";

/** 삭제 폼의 id. 겨냥 라디오와 독의 제출 버튼이 `form` 속성으로 이 폼을 가리킨다. */
export const DELETE_FORM_ID = "plot-delete-form";

/** 아무것도 겨냥하지 않은 상태를 들고 있는 라디오. '취소'가 이걸 고른다. */
export const ARM_NONE_ID = "arm-none";

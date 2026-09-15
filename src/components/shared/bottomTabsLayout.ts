/**
 * ---------------------------------------------
 * [Feature]: 하단 탭이 요구하는 레이아웃 값
 *
 * [Description]
 * - ⚠️ **이 값이 `BottomTabs.tsx` 안에 있으면 안 된다.** 그 파일은 `"use client"`
 *   인데, 서버 컴포넌트가 클라이언트 모듈에서 **컴포넌트가 아닌 값**을 import 하면
 *   Next 가 그것을 "클라이언트 참조 스텁"으로 바꾼다. 함수라서 문자열로 쓰면
 *   클래스 대신 아래 같은 에러 문구가 className 에 그대로 박힌다:
 *
 *     class="min-h-dvh function() { throw new Error("Attempted to call
 *            BOTTOM_TABS_SPACER() from the server but ... is on the client.") }"
 *
 *   타입 검사도 린트도 잡지 못하고, 화면에서는 **여백만 조용히 사라진다.**
 *   실제로 이 함정을 밟아서 파일을 나눴다. 값은 서버·클라이언트 양쪽에서
 *   쓰이므로 지시자 없는 평범한 모듈에 둔다.
 * - 탭 높이와 **한 몸**이다. 탭의 padding 이나 글자 크기를 바꾸면 이 값도 같이
 *   재야 한다. 어긋나면 페이지 마지막 요소가 탭에 가려 영영 안 보인다.
 *
 * [Usage]
 * ```tsx
 * <div className={`min-h-dvh ${BOTTOM_TABS_SPACER}`}>…<BottomTabs /></div>
 * ```
 * ---------------------------------------------
 */

/**
 * 본문 아래 여백.
 *
 * 독이 **떠 있으므로**(가장자리에 붙어 있지 않다) 높이 + 아래 띄운 만큼을 비운다.
 * 독 높이 ≈ 3.5rem, 아래 띄움 0.75rem, 안전 영역은 그때그때 다르다 —
 * env() 를 여기서도 더해 홈 인디케이터가 있는 기기에서 마지막 요소가 가리지
 * 않게 한다. 넓은 화면에서는 독이 숨으므로 여백도 없앤다.
 */
export const BOTTOM_TABS_SPACER =
  "pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-0";

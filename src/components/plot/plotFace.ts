import { plotToneIndex } from "@/features/plots/domain/plotIdentity";

/**
 * ---------------------------------------------
 * [Feature]: 밭 카드의 얼굴색
 *
 * [Description]
 * - 목록에서 카드가 전부 같은 얼굴이면 한눈에 구분이 안 된다. 밭마다 색을 하나씩
 *   고정해 눈이 자리를 기억하게 한다. **번호는 `plotToneIndex`(순수 함수)가
 *   정하고, 이 파일은 그 번호를 실제 클래스로 바꾸기만 한다.**
 * - ⚠️ 클래스를 **조립하지 않는다.** Tailwind 는 클래스 문자열을 정적으로 읽으므로
 *   `bg-${tone}-subtle` 같은 조립은 생성되지 않고 **조용히 사라진다.**
 *   그래서 완성된 문자열을 리터럴로 적는다.
 * - 색은 전부 globals.css 의 시맨틱 토큰이다. 원시 팔레트를 쓰면 그 자리만
 *   다크모드가 깨진다.
 * - ⚠️ 배열 길이는 `PLOT_TONE_COUNT` 와 **같아야 한다.** 짧으면 일부 밭이
 *   `undefined` 를 받아 얼굴이 비고, 길면 영영 안 쓰이는 색이 생긴다.
 *
 * [Usage]
 * ```tsx
 * <span className={plotFaceClass(plot.id)}>{icon}</span>
 * ```
 * ---------------------------------------------
 */

/**
 * 얼굴색 다섯. 의미가 있는 색은 일부러 피했다 — `unsuitable`(경보)이나
 * `caution` 이 섞이면 멀쩡한 밭이 위험해 보인다. 중립적으로 읽히는 것만 쓴다.
 */
const FACES: readonly string[] = [
  "bg-accent-subtle text-accent",
  "bg-telemetry-subtle text-telemetry",
  "bg-earth-subtle text-earth",
  "bg-info/10 text-info",
  "bg-good/10 text-good",
];

/** 밭 id → 얼굴 클래스. 같은 밭은 언제나 같은 색이다. */
export function plotFaceClass(plotId: string): string {
  return FACES[plotToneIndex(plotId)] ?? FACES[0];
}

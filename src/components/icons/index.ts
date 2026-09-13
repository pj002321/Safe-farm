/**
 * ---------------------------------------------
 * [Feature]: 아이콘 배럴
 *
 * [Description]
 * - 아이콘은 전부 여기서만 가져다 쓴다. 개별 파일 경로를 호출부에 퍼뜨리면
 *   나중에 도메인별로 파일을 쪼갤 때 import 를 전부 고쳐야 한다.
 * - 아이콘을 추가할 때 지킬 규격:
 *   1. 도메인에 맞는 파일(satellite/land/crop/weather/alert/ui)에 넣는다.
 *      맞는 곳이 없으면 파일을 새로 만들고 여기에 한 줄 추가한다.
 *   2. `<svg {...ICON_BASE} aria-hidden="true" {...props}>` 로 시작한다.
 *      `{...props}` 가 마지막이어야 호출부가 className·aria-label 을 덮어쓴다.
 *   3. **currentColor 만 쓴다.** hex·그라디언트·filter 를 넣으면 다크모드와
 *      토큰 유틸리티(text-accent 등)가 그 아이콘에서만 안 먹는다.
 *   4. 24x24 격자에 2px 여백(도형은 약 2~22 범위), 선 굵기 1.5 아웃라인.
 *      선 개수가 4~6개를 크게 벗어나면 나란히 놓았을 때 무게가 튄다.
 *   5. 아이콘마다 "무엇을 그린 것인지" 한 줄 주석을 단다.
 *
 * [Usage]
 * ```tsx
 * import { SatelliteIcon, LogoWordmark } from "@/components/icons";
 * ```
 * ---------------------------------------------
 */

export * from "./alert";
export * from "./brand";
export * from "./crop";
export * from "./Logo";
export * from "./land";
export * from "./satellite";
export * from "./types";
export * from "./ui";
export * from "./weather";

import {
  CloudIcon,
  CloudRainIcon,
  SnowflakeIcon,
  SunIcon,
} from "@/components/icons";

/**
 * ---------------------------------------------
 * [Feature]: 사용자가 고른 하늘 → 그림
 *
 * [Description]
 * - 목록에 있는 아이콘을 그대로 쓴다(`components/icons/weather`). 따로 그리면
 *   `/weather` 탭과 같은 날씨가 다르게 보인다.
 * - **모르는 값이면 아무것도 안 그린다.** 하늘은 사용자가 고르는 칸이라 빈 채로
 *   저장된 줄이 흔하다. 짐작해서 그리면 고른 값과 섞인다.
 * ---------------------------------------------
 */

/** 고를 수 있는 하늘 → 아이콘. 목록은 `domain/diaryFields.ts` 의 `SKY_KINDS`. */
const BY_SKY = {
  맑음: SunIcon,
  흐림: CloudIcon,
  비: CloudRainIcon,
  눈: SnowflakeIcon,
} as const;

export function WeatherIcon({ skyKo }: { skyKo: string }) {
  const Icon = BY_SKY[skyKo as keyof typeof BY_SKY];
  return Icon ? <Icon className="size-3.5 shrink-0" /> : null;
}

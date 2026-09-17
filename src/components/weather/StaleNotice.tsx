/**
 * ---------------------------------------------
 * [Feature]: 보관해 둔 예보임을 알리는 줄
 *
 * [Description]
 * - ai-service 가 잠깐 죽었을 때 화면 전체를 "불러오지 못했습니다"로 만드는 대신
 *   마지막으로 받아 둔 예보를 보여준다(`lastGoodForecast`). 그때 **반드시** 이
 *   줄이 함께 뜬다.
 * - 언제 것인지 말하지 않고 옛 예보를 보여주는 건 폴백이 아니라 거짓말이다.
 *   서리 예보처럼 하루가 지나면 뒤집히는 값이 섞여 있어서, 사용자가 이걸 오늘
 *   것으로 읽으면 실제 피해가 난다.
 * - 경고색(unsuitable)이 아니라 주의색(caution)이다. 데이터가 틀린 게 아니라
 *   **오래된** 것이라, 빨간 줄로 띄우면 진짜 위험 경고와 구별되지 않는다.
 * ---------------------------------------------
 */

import { AlertTriangleIcon } from "@/components/icons";

/** 분 단위로 말한다. "3600초 전"은 사람이 읽는 단위가 아니다. */
function agoKo(cachedAt: Date, now: Date): string {
  const minutes = Math.max(
    0,
    Math.floor((now.getTime() - cachedAt.getTime()) / 60_000),
  );
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분 전`;
}

export function StaleNotice({ cachedAt }: { cachedAt: Date }) {
  return (
    // ⚠️ flex 안에 <b> 를 두지 않는다. 자식이 각자 flex 아이템이 되어 "지금 예보를 /
    //    받지 못해 / 1시간 35분 전 / 받아 둔 값을" 처럼 토막나 줄이 세 줄이 됐다(실측).
    //    아이콘만 띄우고 글은 한 덩어리로 흐르게 둔다.
    <p className="rounded-lg border border-caution/40 bg-caution/10 px-3 py-2 text-caution text-xs leading-relaxed">
      <AlertTriangleIcon className="-mt-0.5 mr-1.5 inline size-3.5 align-middle" />
      지금 예보를 받지 못해 <b>{agoKo(cachedAt, new Date())}</b> 받아 둔 값을
      보여 드립니다.
    </p>
  );
}

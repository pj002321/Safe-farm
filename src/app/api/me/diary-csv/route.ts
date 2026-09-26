import { listStageNamesByVariants } from "@/features/cultivations/cultivationStore";
import {
  DIARY_CSV_HEADERS,
  DIARY_EXPORT_MAX,
  diaryCsvBundleName,
  diaryCsvFileName,
  diaryCsvRows,
} from "@/features/cultivations/domain/diaryCsv";
import { buildTimeline } from "@/features/cultivations/domain/timeline";
import { listEventsByCultivations } from "@/features/cultivations/eventStore";
import { listCultivationsForExport } from "@/features/plots/plotStore";
import { requireUser } from "@/shared/auth/session";
import { type CsvValue, toCsv } from "@/shared/utils/csv";

/**
 * ---------------------------------------------
 * [Feature]: 영농일지 CSV 내려받기  →  GET /api/me/diary-csv?id=…&id=…
 *
 * [Description]
 * - **고른 재배들의 일지를 한 파일로** 만들어 돌려준다. 마이페이지의 체크박스 폼과
 *   재배 상세의 내보내기 버튼이 **같은 이 라우트**를 쓴다 — 두 벌로 두면 한쪽만
 *   고쳐져 같은 재배가 화면마다 다른 파일을 낸다.
 * - 화면 쪽은 평범한 `<form method="get">` 이라 **JS 가 0줄**이다. 체크 상태를
 *   React 상태로 들 이유가 없다 — 브라우저가 이미 들고 있고, 누르면 `?id=a&id=b`
 *   로 온다.
 * - 조립이 여기인 까닭: `features/plots`(재배·밭)와 `features/cultivations`
 *   (타임라인·CSV)를 둘 다 써야 하는데 **features 끼리 import 는 금지**다. 규약이
 *   정한 자리가 `app/` 이다(AGENTS.md).
 *
 * 🔴 **주인 확인은 `listCultivationsForExport` 가 한다.** `?id=` 는 브라우저가
 *    보내는 값이라 남의 재배 id 를 섞을 수 있다. 그 함수가 `plots!inner` 로
 *    `user_id` 를 걸어 루트 행부터 걸러 낸다. 여기서는 **걸러진 뒤의 id 로만**
 *    기록을 읽는다.
 *
 * ⚠️ **캐시를 막는다.** 로그인한 사람의 농사 기록이라 CDN·프록시에 남으면 안 된다
 *    (`shared/supabase/proxy.ts` 가 같은 이유로 헤더를 얹는다).
 *
 * [Usage]
 * ```
 * GET /api/me/diary-csv?id=<재배id>            (상세 화면 — 한 건)
 * GET /api/me/diary-csv?id=<a>&id=<b>&year=2026 (마이페이지 — 고른 것)
 * ```
 * ---------------------------------------------
 */

/**
 * 고르지 않았거나 너무 많이 골랐을 때 돌려보내는 자리.
 *
 * ⚠️ **JSON 을 돌려주지 않는다.** 화면 쪽이 평범한 `<form method="get">` 이라
 *    브라우저가 응답을 그대로 그린다 — 사용자가 `{"error":…}` 를 보게 된다.
 *    같은 화면으로 되돌리고 무슨 일인지는 `RecordPanel` 이 문장으로 말한다.
 * ⚠️ 문장을 주소에 싣지 않는다. 키만 넘기고 문장은 화면이 코드로 갖는다 —
 *    주소에 실으면 남이 만든 링크로 임의의 글을 우리 화면에 띄울 수 있다.
 */
function backToRecords(
  request: Request,
  reason: "none" | "many" | "gone",
): Response {
  // ⚠️ 기준 주소를 `siteUrl()` 로 짓지 않는다. 브라우저가 **실제로 접속한 오리진**
  //    으로 돌려보내야 한다 — 환경변수로 유추한 주소를 쓰면 로컬·프리뷰에서
  //    엉뚱한 호스트로 튄다(`shared/config/site.ts` 머리말과 같은 이유).
  const target = new URL("/me", request.url);
  // 재배기록 구역으로 되돌린다. 안 붙이면 lg 이상에서 계정 구역이 떠서 아래
  // 문장이 **가려진 패널 안**에 그려진다(`me/page.tsx` 의 `parseSection`).
  target.searchParams.set("section", "records");
  // 보고 있던 연도로 되돌린다. 빼먹으면 `전체` 로 떨어져, 2024년 목록에서 눌렀는데
  // 전 연도가 펼쳐진 화면이 돌아온다 — 사용자는 자기가 어디 있었는지 잃는다.
  const year = new URL(request.url).searchParams.get("year");
  if (year) target.searchParams.set("year", year);
  target.searchParams.set("error", `records-${reason}`);
  return Response.redirect(target, 303);
}

/**
 * `Content-Disposition: filename*=UTF-8''…` 에 넣을 이름.
 *
 * ⚠️ `encodeURIComponent` 만으로는 모자란다. RFC 5987 의 attr-char 에는
 *    `!` `'` `(` `)` `*` 가 없는데 `encodeURIComponent` 는 이 다섯을 그대로 둔다.
 *    밭 이름이 `집앞(작은)밭` 이면 괄호가 날것으로 나가 헤더가 규격을 벗어나고,
 *    브라우저에 따라 이름을 버리고 `diary-csv` 로 저장한다 — 오류 없이 조용히.
 */
function rfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export async function GET(request: Request): Promise<Response> {
  let userId: string;
  try {
    userId = (await requireUser()).id;
  } catch {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const ids = params.getAll("id").filter(Boolean);
  if (ids.length === 0) return backToRecords(request, "none");
  // ⚠️ **자르지 않는다.** `slice` 로 앞의 100건만 내보내면 파일에 빠진 것이 있다는
  //    사실을 아무도 모른다 — 거절하고 나눠 받으라고 말하는 편이 정직하다.
  if (ids.length > DIARY_EXPORT_MAX) return backToRecords(request, "many");

  // 🔴 여기서 남의 것이 떨어져 나간다. 아래 조회들은 살아남은 id 만 본다.
  const cultivations = await listCultivationsForExport(userId, ids);
  // 고른 것이 전부 남의 것이거나 그새 지워진 경우. 다른 탭에서 밭을 지우고 여기서
  // 누르면 실제로 이 길로 온다 — 404 JSON 을 사람에게 보여 주지 않는다.
  if (cultivations.length === 0) return backToRecords(request, "gone");

  // 왕복 둘. 재배마다 부르면 N+1 이 된다
  const [eventsById, stageNamesByVariant] = await Promise.all([
    listEventsByCultivations(cultivations.map((c) => c.id)),
    listStageNamesByVariants(cultivations.map((c) => c.variantId)),
  ]);

  const rows: (readonly CsvValue[])[] = [];
  for (const c of cultivations) {
    // `TimelineCultivation` 을 여기서 짓는다. 저장소는 features/plots 라 이 타입을
    // 못 본다 — 그래서 조립이 `app/` 의 일이다.
    // ⚠️ **한 번만 짓는다.** 타임라인과 CSV 가 같은 객체를 봐야 한다 — 두 벌로
    //    적으면 칸을 하나 더할 때 한쪽만 고쳐져 같은 줄이 서로 다른 말을 한다
    //    (`diaryCsv.ts` 의 `DiaryCsvContext` 가 낱개 칸을 안 받는 것과 같은 이유).
    const cultivation = {
      id: c.id,
      cropKo: c.cropKo,
      sowingDate: c.sowingDate,
      sowingType: c.sowingType,
      harvestedAt: c.harvestedAt,
      failedAt: c.failedAt,
      failureReason: c.failureReason,
    };

    const entries = buildTimeline({
      cultivation,
      events: eventsById.get(c.id) ?? [],
    });

    rows.push(
      ...diaryCsvRows(entries, {
        cultivation,
        stageNames: stageNamesByVariant.get(c.variantId) ?? {},
        plotKo: c.plotKo,
        yieldKg: c.yieldKg,
      }),
    );
  }

  // 이름 규칙은 둘 다 `domain/diaryCsv` 에 있다 — 여기서 문자열을 짓지 않는다.
  const filename =
    cultivations.length === 1 && cultivations[0]
      ? diaryCsvFileName(cultivations[0].cropKo, cultivations[0].plotKo)
      : diaryCsvBundleName(params.get("year"), cultivations.length);

  // ⚠️ BOM 을 여기서 붙인다. 없으면 한국어 Windows 엑셀이 파일을 CP949 로 읽어
  //    한글이 전부 깨진다 — 엑셀은 UTF-8 을 자동 감지하지 않는다.
  //    U+FEFF 를 글자 그대로 적지 않는 이유는 폭이 0이라 편집기·포매터가 조용히
  //    지우거나 옮기기 때문이다(`CsvDownloadButton` 과 같은 판단).
  const body = String.fromCharCode(0xfeff) + toCsv(DIARY_CSV_HEADERS, rows);

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // ⚠️ 한글 파일 이름은 `filename*` 으로만 간다. `filename=` 만 쓰면 latin-1
      //    밖이라 브라우저가 이름을 버리고 `diary-csv` 로 저장한다(RFC 5987).
      "Content-Disposition": `attachment; filename*=UTF-8''${rfc5987(filename)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

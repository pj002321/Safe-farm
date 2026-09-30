"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adviceSummaryOn } from "@/features/cultivations/adviceStore";
import { markFailed } from "@/features/cultivations/cultivationStore";
import {
  pickSkyKind,
  pickWorkKind,
} from "@/features/cultivations/domain/diaryFields";
import { parseFailureReason } from "@/features/cultivations/domain/failureReason";
import { parseNote } from "@/features/cultivations/domain/observationNote";
import {
  pickedToQuery,
  TASK_NOTE_MAX_LENGTH,
  taskNoteField,
} from "@/features/cultivations/domain/pickedTasks";
import { parseUserStage } from "@/features/cultivations/domain/userStage";
import {
  type EventInput,
  hasAdviceOn,
  insertCultivationEvent,
  insertCultivationEvents,
  softDeleteCultivationEvent,
} from "@/features/cultivations/eventStore";
import { getPlotDetail } from "@/features/plots/plotStore";
import { aiService } from "@/shared/aiService/client";
import { requireConsent } from "@/shared/auth/consentGate";
import { hourMinuteOf } from "@/shared/utils/format";
import { kstDateString } from "@/shared/utils/kstDate";

/**
 * ---------------------------------------------
 * [Feature]: 재배 상세의 기록 Server Actions
 *
 * [Description]
 * - ⚠️ **export 하나가 곧 공개 POST 엔드포인트**다(AGENTS.md). 헬퍼는 export
 *   하지 않고, 액션마다 **첫 줄에서** `requireConsent()` 를 부른다. 페이지의
 *   검사는 액션에 미치지 않는다.
 * - 밭 소유를 `getPlotDetail()` 로 한 번 더 확인한다. `cultivation_events` 의
 *   RLS 는 `cultivations → plots` 를 경유하므로 남의 기록은 어차피 0건으로
 *   끝나지만, 그러면 "없는 행"과 "남의 행"이 같은 실패로 뭉개진다.
 * - 실패 메시지에 DB 오류 원문을 싣지 않는다. 테이블·컬럼 이름이 섞여 나온다.
 * - 날짜는 **폼에서 받되 서버가 오늘로 막는다**. 어제 일을 오늘 적는 경우가
 *   흔해서 입력을 받지만, 앞날짜는 `parseNote()` 가 거른다.
 * ---------------------------------------------
 */

/**
 * 그날 날씨를 가져와 행에 박을 모양으로 돌려준다. 못 가져오면 `null`.
 *
 * **읽을 때 조인하지 않고 저장할 때 박는다.** 영농일지는 "그때 그랬다" 는
 * 기록이고, 관측이 나중에 정정되면 과거 일지가 소리 없이 바뀐다 — 어제 보고
 * 적어 둔 것과 오늘 보는 것이 다르면 참고 자료로 못 쓴다.
 *
 * ⚠️ **실패해도 던지지 않는다.** ai-service 가 죽었다고 농민이 쓴 메모가 사라지면
 *    안 된다. 날씨만 비우고 기록은 저장한다. 92일보다 오래된 날짜도 같은 길로
 *    빈다 — 그건 오류가 아니라 정상이다.
 *
 * ⚠️ **빈 칸을 0 으로 채우지 않는다.** `rainfall_mm = 0` 은 "비가 안 왔다" 는
 *    뜻이다. 못 찾은 날과 안 온 날이 같아진다.
 */
async function diaryWeather(
  plot: { latitude: number; longitude: number },
  occurredOn: string,
): Promise<EventInput["weather"]> {
  const result = await aiService.weatherOfDay(
    plot.latitude,
    plot.longitude,
    occurredOn,
  );
  if (!result.ok || result.data.day === null) return null;

  const day = result.data.day;
  return {
    tempMaxC: day.tempMax,
    tempMinC: day.tempMin,
    rainfallMm: day.rainfallMm,
    humidityPct: day.humidityPct,
    windMs: day.windMax,
    windDirDeg: day.windDirDeg,
    // "2026-09-19T06:19" 에서 시각만. 날짜는 occurred_on 에 이미 있고, 시간대
    // 변환이 끼면 하루 어긋날 여지만 생긴다.
    sunriseAt: hourMinuteOf(day.sunrise),
    sunsetAt: hourMinuteOf(day.sunset),
  };
}

/**
 * 그날 AI 리포트 글. 이미 그날 어느 줄에 붙어 있거나 리포트가 없으면 `null`.
 *
 * 리포트를 읽을 때 조인하지 않고 **그때 텍스트로 박는다.** 개발 중
 * `delete from advices where advice_date = current_date` 를 돌리는데, 조인이면
 * 그 순간 과거 일지에서도 글이 사라진다.
 *
 * ⚠️ **하루에 한 줄에만 박는다.** 같은 날 여러 줄에 복사되면 일지를 읽을 때 같은
 *    말을 되풀이해 읽는다.
 *
 * ⚠️ **"그날 기록이 있나" 로 묻지 말 것**(2026-09-20 에 그렇게 했다가 틀렸다).
 *    조언이 안 붙은 기록이 하나라도 먼저 있으면 그날은 **영영 못 붙는다** —
 *    실제로 메모를 두 번 남겼는데 둘 다 빈 채로 남았다. `hasAdviceOn` 이
 *    **"조언이 붙은 줄이 있나"** 를 묻는다.
 *
 * ⚠️ **저장 루프 안에서 부르지 말 것.** 장바구니는 한 번에 여러 줄을 넣는다.
 *    줄마다 부르면 첫 줄이 들어간 뒤로 판정이 달라진다 — 한 번 묻고 그 답을
 *    첫 줄에만 쓴다.
 *
 * ⚠️ **없으면 만들지 않는다.** 리포트를 아직 안 본 날은 그냥 빈칸이다 — 교안이
 *    말한 것은 "리포트를 출력할 경우" 같이 저장하라는 것이지, 누를 때마다
 *    생성하라는 것이 아니다.
 *
 * 조회가 실패해도 던지지 않는다. 이 값 때문에 기록 자체가 막히면 안 된다.
 */
async function dayFirstAdvice(
  cultivationId: string,
  today: string,
): Promise<string | null> {
  try {
    // ⚠ **나란히 묻는다.** 앞의 답을 보고 뒤를 부르면 왕복이 둘로 늘어나는데,
    //   흔한 쪽이 "아직 안 붙었다"(= 둘 다 필요)라 늘 두 번을 다 쓰게 된다.
    const [이미붙음, summary] = await Promise.all([
      hasAdviceOn(cultivationId, today),
      adviceSummaryOn(cultivationId, today),
    ]);
    return 이미붙음 ? null : summary;
  } catch (error) {
    console.error("[cultivation] 그날 리포트 붙이기 실패", error);
    return null;
  }
}

/**
 * 사용자에게 보여줄 문장만 쿼리에 싣고 그 상세로 돌려보낸다.
 *
 * ⚠️ **담아 둔 카드는 같이 들고 간다**(`keepPicked`). 안 실으면 앞날짜 한 번
 *    틀렸을 때 담은 카드가 전부 풀려, 다섯 장을 다시 담아야 한다.
 *
 * ⚠️ **카드에 적던 메모까지는 못 살린다.** 그건 폼 값이고 주소에 실을 것이
 *    아니다. 붙들려면 이 화면이 Client Component 가 되어야 하는데, JS 가 0줄인
 *    것이 이 화면의 성질이다.
 */
function fail(
  path: string,
  message: string,
  keepPicked?: string | null,
): never {
  const picked =
    keepPicked == null ? "" : `&picked=${encodeURIComponent(keepPicked)}`;
  redirect(`${path}?error=${encodeURIComponent(message)}${picked}`);
}

function readText(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * 담아 온 카드 제목들. 비었거나 겹치는 것은 버린다.
 *
 * 폼이 주는 값이라 믿지 않는다 — 화면이 목록에 있는 제목만 담게 하지만
 * (`pickedFromQuery`), 액션은 그 화면을 거치지 않고도 불릴 수 있다. 제목은
 * 본문 길이(100자)로 잘리고 개수는 `MAX_PICKED` 로 막는다. 남의 재배에 넣는 것은
 * `openContext` 가 이미 막았으므로 여기서 더 볼 것은 양뿐이다.
 */
const MAX_PICKED = 20;

function pickedTitles(formData: FormData): readonly string[] {
  const seen = new Set<string>();
  for (const raw of formData.getAll("pickedTitle")) {
    if (typeof raw !== "string") continue;
    const title = raw.trim().slice(0, 100);
    if (title.length > 0) seen.add(title);
    if (seen.size >= MAX_PICKED) break;
  }
  return [...seen];
}

/** 그 카드에 적은 한 줄. 안 적었으면 null — 빈 문자열을 넣지 않는다. */
function taskNoteOf(formData: FormData, titleKo: string): string | null {
  const note = readText(formData, taskNoteField(titleKo));
  return note.length === 0 ? null : note.slice(0, TASK_NOTE_MAX_LENGTH);
}

/** 1 이상 정수면 그 값, 아니면 null. 빠진 칸과 0 을 같이 거른다. */
function positiveInt(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** 폼의 두 id 를 좁히고 밭 소유까지 확인한다. 하나라도 어긋나면 되돌린다. */
async function openContext(formData: FormData): Promise<{
  plotId: string;
  cultivationId: string;
  path: string;
  /**
   * 이미 읽은 밭. 날씨를 박을 때 좌표가 필요해 버리지 않고 같이 돌려준다.
   *
   * `nameKo` 도 같이 든다 — 재배를 끝낼 때 **그 시점 밭 이름**을 박아야 해서다
   * (`markFailed`). 이미 읽어 온 행이라 조회가 늘지 않는다.
   */
  plot: { latitude: number; longitude: number; nameKo: string | null };
}> {
  const { viewer } = await requireConsent();

  const plotId = readText(formData, "plotId");
  const cultivationId = readText(formData, "cultivationId");
  if (!plotId || !cultivationId) redirect("/plots");

  const plot = await getPlotDetail(viewer.id, plotId);
  if (!plot) redirect("/plots");

  return {
    plotId,
    cultivationId,
    plot,
    path: `/plots/${plotId}/cultivations/${cultivationId}`,
  };
}

/**
 * 관찰 기록을 남긴다. **한 번에 메모 한 줄 + 담은 카드마다 한 줄.**
 *
 * `이번 주 할 일` 의 `했음` 은 저장하지 않는다(2026-09-21 뒤집음). 카드를 이
 * 폼으로 옮겨 담기만 하고, 실제로 행이 생기는 곳은 여기 하나다.
 *
 * ⚠️ **메모가 비어도 담은 카드가 있으면 통과시킨다.** 그때 `NOTE` 줄은 만들지
 *    않는다 — 전에 `했음` 한 번으로 끝나던 일에 메모를 강요하지 않기 위해서다.
 *    둘 다 비면 `parseNote` 가 막는다.
 *
 * ⚠️ **`TASK_DONE` 의 `body` 에는 카드 제목만 넣는다.** `hideDoneToday` 가 그
 *    글자로 오늘 담은 카드를 목록에서 거른다. 카드별 메모는 `task_note` 로 간다.
 *
 * ⚠️ **`한 일` 은 나오는 줄 전부에 박는다.** 전에는 `NOTE` 에만 실었는데, 메모를
 *    비우고 카드만 담으면 `NOTE` 줄이 안 생겨 **사용자가 고른 값이 소리 없이
 *    사라졌다**(2026-09-20 실측 — DB 에 그런 줄이 있다). 날씨·단계와 같은
 *    "이 저장의 값" 이라 같은 방침으로 옮긴다.
 *
 * 사진은 받지 않는다. 업로드는 AI 사진 분석과 한 묶음이라 그 브랜치로 미뤘다.
 */
export async function addObservation(formData: FormData): Promise<void> {
  const { plotId, cultivationId, path, plot } = await openContext(formData);

  const picked = pickedTitles(formData);
  const parsed = parseNote({
    body: readText(formData, "body"),
    occurredOn: readText(formData, "occurredOn") || kstDateString(),
    today: kstDateString(),
    bodyOptional: picked.length > 0,
  });
  // 되돌아갈 때 담은 카드를 들고 간다. 안 실으면 날짜 한 번 틀렸을 때 전부 풀린다
  const keep = pickedToQuery(picked);
  if (!parsed.ok) fail(path, parsed.messageKo, keep);

  const { body, occurredOn } = parsed.value;
  // 화면이 계산해 둔 단계를 폼으로 받아 그대로 박는다. 여기서 다시 구하면
  // 관측·평년값을 또 읽어야 한다. 숫자가 아니면 빈 채로 둔다.
  const stageOrder = positiveInt(formData.get("stageOrder"));
  const skyKo = pickSkyKind(formData.get("skyKo"));
  const workKind = pickWorkKind(formData.get("workKind"));

  // 한 번에 들어가는 줄들이라 날씨도 리포트도 **한 번만** 구한다. 줄마다 부르면
  // 같은 값을 여러 번 받아 오고, 리포트 쪽은 답까지 달라진다.
  // ⚠ **담은 카드가 없어도 부른다.** 메모만 남긴 날에도 그날 리포트를 붙인다 —
  //   "그날 이런 조언을 받았고 나는 이걸 했다" 가 영농일지의 값이라, 카드를
  //   담았느냐로 가를 일이 아니다.
  const [weather, adviceText] = await Promise.all([
    diaryWeather(plot, occurredOn),
    dayFirstAdvice(cultivationId, occurredOn),
  ]);

  // ⚠ **한 번에 넣는다.** 줄마다 넣으면 왕복이 그 수만큼 늘고, 중간에 실패했을 때
  //   앞 줄들이 이미 들어가 있다. 사용자는 "저장하지 못했습니다" 를 보고 다시
  //   누르는데 그러면 앞 줄이 두 번 저장된다.
  const rows: EventInput[] = [];
  if (body !== null) {
    rows.push({
      kind: "NOTE",
      occurredOn,
      body,
      stageOrder,
      workKind,
      skyKo,
      // 메모가 있으면 **여기가 그날 첫 줄**이다. 아래 카드 줄들은 비운다 —
      // 같은 글이 여러 행에 복사되면 일지를 읽을 때 같은 말을 되풀이해 읽는다
      adviceText,
      weather,
    });
  }
  for (const [index, titleKo] of picked.entries()) {
    rows.push({
      kind: "TASK_DONE",
      occurredOn,
      body: titleKo,
      stageOrder,
      workKind,
      skyKo,
      taskNote: taskNoteOf(formData, titleKo),
      // 그날 리포트는 **이 저장의 첫 줄에만** 붙인다. 메모를 같이 남겼으면 그쪽이
      // 첫 줄이므로 카드에는 안 붙는다 — 같은 글이 여러 행에 복사되면 일지를
      // 읽을 때 같은 말을 되풀이해 읽게 된다.
      adviceText: body === null && index === 0 ? adviceText : null,
      weather,
    });
  }

  try {
    await insertCultivationEvents(cultivationId, rows);
  } catch {
    fail(
      path,
      "기록을 저장하지 못했습니다. 새로 고친 뒤 다시 시도해 주세요.",
      keep,
    );
  }

  // 담은 카드가 있으면 밭 목록의 카드도 달라진다(그날 할 일에서 빠진다).
  if (picked.length > 0) revalidatePath(`/plots/${plotId}`);
  revalidatePath(path);
  redirect(`${path}?saved=note`);
}

/**
 * 생육단계를 사용자가 보정한다.
 *
 * 기록만 남기고 게이지 재계산은 읽을 때 한다(`detailStore.ts` 의 `REBASE_RULE`).
 * 누적 GDD 를 저장해 두면 기상 관측이 정정됐을 때 원천과 어긋난다.
 */
export async function overrideStage(formData: FormData): Promise<void> {
  const { plotId, cultivationId, path } = await openContext(formData);

  const stageOrder = Number(readText(formData, "stageOrder"));
  if (!Number.isInteger(stageOrder) || stageOrder < 1) {
    fail(path, "단계를 고르지 않았습니다.");
  }

  const occurredOn = readText(formData, "occurredOn") || kstDateString();
  if (occurredOn > kstDateString())
    fail(path, "앞으로의 날짜는 넣을 수 없습니다.");

  try {
    await insertCultivationEvent(cultivationId, {
      kind: "STAGE_SET",
      occurredOn,
      stageOrder,
    });
  } catch {
    fail(path, "단계를 고치지 못했습니다. 새로 고친 뒤 다시 시도해 주세요.");
  }

  revalidatePath(`/plots/${plotId}`);
  revalidatePath(path);
  redirect(`${path}?saved=stage`);
}

/**
 * 단계표에 없는 단계를 이 재배에만 더한다.
 *
 * `crop_stages`(마스터)는 건드리지 않는다. 농사로에서 온 작물 공통 자료라 한
 * 사람이 고치면 남의 화면이 같이 바뀐다. 기록 한 줄(`STAGE_ADD`)로만 남고,
 * 타임라인이 읽을 때 마스터 뒤에 붙인다(`appendUserStages`).
 *
 * `overrideStage` 와 달리 **앞날짜를 막지 않는다.** 저쪽은 "이미 그렇게 됐다" 는
 * 보정이고 이쪽은 "언제 할 것인가" 도 적을 수 있는 계획이다.
 */
export async function addStage(formData: FormData): Promise<void> {
  // `/plots/{id}` 는 다시 그리지 않는다. 밭 목록의 카드는 GDD 로 판정한 단계를
  // 보여 주는데, 사용자 단계는 그 계산에 안 들어가므로 바뀔 것이 없다.
  const { cultivationId, path } = await openContext(formData);

  const parsed = parseUserStage({
    nameKo: readText(formData, "nameKo"),
    occurredOn: readText(formData, "occurredOn") || kstDateString(),
  });
  if (!parsed.ok) fail(path, parsed.messageKo);

  try {
    await insertCultivationEvent(cultivationId, {
      kind: "STAGE_ADD",
      occurredOn: parsed.value.occurredOn,
      // 단계 이름이 본문에 들어간다. stage_order 는 비운다 — 마스터에 없는
      // 단계라 가리킬 번호가 없다.
      body: parsed.value.nameKo,
    });
  } catch {
    fail(path, "단계를 더하지 못했습니다. 새로 고친 뒤 다시 시도해 주세요.");
  }

  revalidatePath(path);
  redirect(`${path}?saved=stage-add`);
}

/**
 * 재배를 중단(실패) 처리한다.
 *
 * 사유는 목록에 있는 코드만 받는다. 모르는 값이 오면 `OTHER` 로 바꾸지 않고
 * 되돌린다 — 폼이 깨진 것과 사용자가 기타를 고른 것은 다른 일이다.
 */
export async function failCultivation(formData: FormData): Promise<void> {
  const { plotId, cultivationId, path, plot } = await openContext(formData);

  const reason = parseFailureReason(formData.get("reason"));
  if (reason === null) fail(path, "중단 사유를 골라 주세요.");

  try {
    // 밭 이름은 **끝내는 이 순간**에만 얻을 수 있는 값이다(`markHarvested` 와 같다).
    await markFailed(
      plotId,
      cultivationId,
      kstDateString(),
      reason,
      plot.nameKo,
    );
  } catch {
    fail(path, "중단 처리에 실패했습니다. 새로 고친 뒤 다시 시도해 주세요.");
  }

  revalidatePath(`/plots/${plotId}`);
  revalidatePath(path);
  redirect(`${path}?saved=failed`);
}

/**
 * 기록 한 줄을 지운다. 화면에서는 삭제지만 DB 에는 `deleted_at` 이 찍힌다.
 *
 * 사진 오브젝트는 남는다(`softDeleteCultivationEvent` 참고). 되돌릴 길을 남기려는
 * 것이고, 경로를 아는 사람은 소유자뿐이라 남겨 둬도 새어 나가지 않는다.
 */
export async function removeEvent(formData: FormData): Promise<void> {
  const { cultivationId, path } = await openContext(formData);

  const eventId = readText(formData, "eventId");
  if (!eventId) fail(path, "지울 기록을 찾지 못했습니다.");

  try {
    await softDeleteCultivationEvent(cultivationId, eventId);
  } catch {
    fail(path, "지우지 못했습니다. 새로 고친 뒤 다시 시도해 주세요.");
  }

  revalidatePath(path);
  redirect(`${path}?saved=removed`);
}

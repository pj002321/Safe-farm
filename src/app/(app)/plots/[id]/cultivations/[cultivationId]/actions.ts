"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { markFailed } from "@/features/cultivations/cultivationStore";
import {
  pickSkyKind,
  pickWorkKind,
} from "@/features/cultivations/domain/diaryFields";
import { parseFailureReason } from "@/features/cultivations/domain/failureReason";
import { parseNote } from "@/features/cultivations/domain/observationNote";
import { parseUserStage } from "@/features/cultivations/domain/userStage";
import {
  type EventInput,
  insertCultivationEvent,
  softDeleteCultivationEvent,
} from "@/features/cultivations/eventStore";
import { getPlotDetail } from "@/features/plots/plotStore";
import { aiService } from "@/shared/aiService/client";
import { requireConsent } from "@/shared/auth/consentGate";
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
 * `"2026-09-19T06:19"` → `"06:19"`. 형태가 다르면 null 이다.
 *
 * ⚠️ 자리로 자르지 않는다(`slice(11, 16)`). 형식이 바뀌면 **엉뚱한 글자가 조용히**
 *    저장된다 — 그게 보조금 서류로 나간다. `SunTimes.tsx` 의 `hhmm` 과 같은 방식.
 */
function hhmm(iso: string | null): string | null {
  const time = iso?.split("T")[1];
  return time?.slice(0, 5) ?? null;
}

/**
 * 그날 날씨를 가져와 행에 박을 모양으로 돌려준다. 못 가져오면 `null`.
 *
 * **읽을 때 조인하지 않고 저장할 때 박는다.** 영농일지는 "그때 그랬다" 는
 * 기록이고, 관측이 나중에 정정되면 과거 일지가 소리 없이 바뀐다 — 서류로 낸
 * 뒤에 값이 달라지면 그건 위조가 된다.
 *
 * ⚠️ **실패해도 던지지 않는다.** ai-service 가 죽었다고 농민이 쓴 메모가 사라지면
 *    안 된다. 날씨만 비우고 기록은 저장한다. 92일보다 오래된 날짜도 같은 길로
 *    빈다 — 그건 오류가 아니라 정상이다.
 *
 * ⚠️ **빈 칸을 0 으로 채우지 않는다.** `rainfall_mm = 0` 은 "비가 안 왔다" 는
 *    뜻이고, 그 일지가 보조금 서류로 나간다.
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
    sunriseAt: hhmm(day.sunrise),
    sunsetAt: hhmm(day.sunset),
  };
}

/** 사용자에게 보여줄 문장만 쿼리에 싣고 그 상세로 돌려보낸다. */
function fail(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function readText(formData: FormData, key: string): string {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

/** 폼의 두 id 를 좁히고 밭 소유까지 확인한다. 하나라도 어긋나면 되돌린다. */
async function openContext(
  formData: FormData,
): Promise<{ plotId: string; cultivationId: string; path: string }> {
  const { viewer } = await requireConsent();

  const plotId = readText(formData, "plotId");
  const cultivationId = readText(formData, "cultivationId");
  if (!plotId || !cultivationId) redirect("/plots");

  const plot = await getPlotDetail(viewer.id, plotId);
  if (!plot) redirect("/plots");

  return {
    plotId,
    cultivationId,
    path: `/plots/${plotId}/cultivations/${cultivationId}`,
  };
}

/**
 * 관찰 기록(메모)을 남긴다.
 *
 * 사진은 받지 않는다. 업로드는 AI 사진 분석과 한 묶음이라 그 브랜치로 미뤘다.
 */
export async function addObservation(formData: FormData): Promise<void> {
  const { viewer } = await requireConsent();

  const plotId = readText(formData, "plotId");
  const cultivationId = readText(formData, "cultivationId");
  if (!plotId || !cultivationId) redirect("/plots");

  const plot = await getPlotDetail(viewer.id, plotId);
  if (!plot) redirect("/plots");

  const path = `/plots/${plotId}/cultivations/${cultivationId}`;

  const occurredOn = readText(formData, "occurredOn") || kstDateString();
  const parsed = parseNote({
    body: readText(formData, "body"),
    occurredOn,
    today: kstDateString(),
  });
  if (!parsed.ok) fail(path, parsed.messageKo);

  const weather = await diaryWeather(plot, parsed.value.occurredOn);

  try {
    await insertCultivationEvent(cultivationId, {
      kind: "NOTE",
      occurredOn: parsed.value.occurredOn,
      body: parsed.value.body,
      workKind: pickWorkKind(formData.get("workKind")),
      skyKo: pickSkyKind(formData.get("skyKo")),
      weather,
    });
  } catch {
    fail(path, "기록을 저장하지 못했습니다. 새로 고친 뒤 다시 시도해 주세요.");
  }

  revalidatePath(path);
  redirect(`${path}?saved=note`);
}

/**
 * 추천 작업을 했다고 표시한다.
 *
 * 작업 이름을 폼에서 받아 그대로 본문에 넣는다. 추천 목록은 규칙이 매번 다시
 * 만드는 값이라 id 를 저장해도 나중에 가리킬 대상이 없다.
 */
export async function completeTask(formData: FormData): Promise<void> {
  const { plotId, cultivationId, path } = await openContext(formData);

  const titleKo = readText(formData, "titleKo");
  if (!titleKo) fail(path, "작업 이름이 비어 있습니다.");

  try {
    await insertCultivationEvent(cultivationId, {
      kind: "TASK_DONE",
      occurredOn: kstDateString(),
      body: titleKo.slice(0, 100),
    });
  } catch {
    fail(path, "기록하지 못했습니다. 새로 고친 뒤 다시 시도해 주세요.");
  }

  revalidatePath(`/plots/${plotId}`);
  revalidatePath(path);
  redirect(`${path}?saved=task`);
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
  const { plotId, cultivationId, path } = await openContext(formData);

  const reason = parseFailureReason(formData.get("reason"));
  if (reason === null) fail(path, "중단 사유를 골라 주세요.");

  try {
    await markFailed(plotId, cultivationId, kstDateString(), reason);
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

import { requireUser } from "@/shared/auth/session";

/**
 * ---------------------------------------------
 * [Feature]: 추천 파이프라인 실행  →  POST /api/recommend
 *
 * [Description]
 * - Route Handler를 쓰는 이유는 **스트리밍** 때문이다. Server Action은
 *   토큰 단위 스트리밍이 까다롭다. 그 외 변경 작업은 Server Action이 낫다.
 * - `runtime = "nodejs"` 필수. Edge Runtime에서는 LangGraph 의존성이 깨진다.
 * - 진행 상황을 흘려보내지 않으면 사용자는 수십 초간 흰 화면을 본다.
 *   체감 타임아웃을 줄이는 게 스트리밍의 실질적 이유다.
 *
 * [⚠️ 아직 미완성]
 * 그래프 실행부는 InsForge 연결 후 채운다. 필요한 것:
 *   - fetchWeather : 기상청 API 어댑터
 *   - loadCandidates : 작물 후보 조회
 *   - llm : 모델 클라이언트 (OPENROUTER_API_KEY, 서버 전용)
 *   - checkpointer : PostgresSaver(DATABASE_URL, { schema: "langgraph" })
 * 지금은 배선과 스트리밍 형식만 갖춰 두었다.
 *
 * [Usage]
 * ```ts
 * const res = await fetch("/api/recommend", {
 *   method: "POST",
 *   body: JSON.stringify({ fieldId }),
 * });
 * for await (const chunk of res.body) { ... }
 * ```
 * ---------------------------------------------
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  // 페이지 권한 검사는 여기까지 오지 않는다. 매번 직접 확인한다.
  await requireUser();

  const { fieldId } = (await req.json()) as { fieldId?: string };
  if (!fieldId) {
    return Response.json({ error: "fieldId가 필요합니다." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );

      try {
        send("status", { step: "collectWeather" });
        // TODO: createGraph({...}).stream({ fieldId }) 결과를 여기로 흘린다
        send("done", { fieldId });
      } catch (cause) {
        // 외부 경계이므로 오류 처리가 정당하다. 내부 스택은 노출하지 않는다.
        send("error", { message: "추천 계산에 실패했습니다." });
        console.error("[recommend]", cause);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
    },
  });
}

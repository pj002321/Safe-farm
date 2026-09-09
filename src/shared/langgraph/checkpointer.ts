import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import pg from "pg";

/**
 * ---------------------------------------------
 * [Feature]: LangGraph checkpointer (Supabase Postgres)
 *
 * [Description]
 * - 그래프 실행 상태를 DB에 저장한다. 서버리스에서는 요청이 끝나면 함수가 죽으므로
 *   `MemorySaver` 가 무의미하다 — 다음 요청에 상태가 없다.
 *
 * [연결 설정 — 하나라도 틀리면 프로덕션에서만 죽는다]
 * - `POSTGRES_URL` 은 **Supavisor transaction mode (포트 6543)** 을 쓴다.
 *   direct 접속(`db.<ref>.supabase.co`)은 **IPv6 전용**이고 Vercel 함수는
 *   아웃바운드 IPv6를 지원하지 않아 `ENETUNREACH` 로 죽는다.
 *   pooler 는 전 요금제에서 IPv4라 IPv4 애드온을 살 필요가 없다.
 * - transaction mode 는 named prepared statement 를 못 쓴다(supabase/supavisor#69).
 *   node-postgres 는 기본이 unnamed 라 PostgresSaver 는 그대로 동작한다.
 * - 풀은 **모듈 스코프 싱글턴**이고 `max` 를 작게 잡는다. 요청마다 풀을 만들면
 *   커넥션이 금방 고갈된다.
 * - 스키마는 `langgraph`. **`public` 금지** — blob 에 대화 전체가 들어가는데
 *   public 은 PostgREST 노출 대상이다.
 * - `.setup()` 을 부르지 않는다. 테이블은 supabase/migrations 가 만든다.
 *
 * [Usage]
 * ```ts
 * const graph = createGraph({ ...deps, checkpointer: getCheckpointer() });
 * await graph.invoke(input, { configurable: { thread_id: userId } });
 * ```
 * ---------------------------------------------
 */

let pool: pg.Pool | undefined;
let checkpointer: PostgresSaver | undefined;

function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error(
        "POSTGRES_URL 이 없습니다. Supabase Dashboard → Connect → Transaction pooler(6543) 문자열을 넣으세요.",
      );
    }
    pool = new pg.Pool({ connectionString, max: 3 });
  }
  return pool;
}

export function getCheckpointer(): PostgresSaver {
  if (!checkpointer) {
    checkpointer = new PostgresSaver(getPool(), undefined, {
      schema: "langgraph",
    });
  }
  return checkpointer;
}

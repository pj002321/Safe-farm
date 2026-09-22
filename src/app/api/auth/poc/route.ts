import { NextResponse } from "next/server";
import { getViewer } from "@/shared/auth/session";
import { getSupabaseServer } from "@/shared/supabase/server";

/**
 * ---------------------------------------------
 * [Feature]: POC 모드 자동 로그인  →  POST /api/auth/poc
 *
 * [Description]
 * - 시연용 계정 하나를 무작위로 골라 로그인시키고 홈으로 보낸다. 로그인 화면의
 *   "POC 모드로 시작하기" 버튼이 폼으로 제출한다.
 * - **비밀번호가 브라우저로 나가지 않는다.** 서버에서 `signInWithPassword` 를
 *   부르고, `getSupabaseServer()` 의 쿠키 어댑터가 세션 쿠키를 심는다.
 *   브라우저가 받는 것은 쿠키뿐이다 — 공개 화면이라 내려보내면 누구나 읽는다.
 * - **계정은 서버가 고른다.** 이메일을 파라미터로 받지 않는다. 받으면 남의
 *   계정 주소를 넣어 보는 문이 열린다.
 * - **`POC_PASSWORD` 가 없으면 기능이 없는 것처럼 404 다.** 켜고 끄는 스위치를
 *   환경변수 하나로 둔 것이라, 이 기능을 원하지 않는 환경에서는 변수를 빼면
 *   된다. 503("설정이 없다")이 아니라 404 인 이유는, 있는지 없는지조차 알려줄
 *   이유가 없어서다.
 *
 * - ⚠️ **리다이렉트를 상대 경로로 보낸다.** `new URL("/dashboard", request.url)`
 *   로 절대 주소를 만들면 Railway 컨테이너 안에서 origin 이 공개 주소가 아니라
 *   **내부 바인드 주소(`0.0.0.0:8080`)** 로 잡힌다. 브라우저가 갈 곳이 없어
 *   오류 화면이 뜨는데, 로그인은 이미 끝나 쿠키가 심겨 있어서 **새로고침하면
 *   대시보드가 보이는** 기묘한 증상이 된다. 실제로 그렇게 났다.
 *   `/auth/callback` 이 같은 함정을 먼저 밟고 주석으로 남겨 뒀는데 그대로
 *   반복했다. 상대 경로는 프록시가 몇 겹이든 항상 옳다.
 *
 * ⚠️ 이 경로는 **공개 화면에서 세션을 발급한다.** 그래서 지키는 선이 둘이다 —
 *    (1) 아래 목록의 시연 계정만 로그인된다. (2) 그 계정에는 실제 사용자 자료를
 *    두지 않는다. 두 번째는 코드가 강제할 수 없으므로 운영 약속이다.
 *
 * [Usage]
 * ```tsx
 * <form action="/api/auth/poc" method="post">
 *   <button type="submit">POC 모드로 시작하기</button>
 * </form>
 * ```
 * ---------------------------------------------
 */

/**
 * 시연 계정. `scripts/seed-poc-plots.mjs` 가 만드는 것과 같은 목록이다.
 *
 * 여기 박아 두는 이유: 이 목록이 곧 **허용 목록**이다. DB 에서 읽어 오면
 * "데모 계정인지" 를 판단할 기준이 또 필요하고, 그 기준을 누가 쓰느냐에 따라
 * 아무 계정이나 들어올 틈이 생긴다. 다섯 줄을 코드에 두는 편이 안전하다.
 */
const POC_EMAILS = [
  "poc1@safefarm.app",
  "poc2@safefarm.app",
  "poc3@safefarm.app",
  "poc4@safefarm.app",
  "poc5@safefarm.app",
] as const;

export async function POST(request: Request) {
  const password = process.env.POC_PASSWORD?.trim();
  if (!password) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // ⚠️ **로그인 CSRF 를 막는다.** 이 경로는 세션을 발급하므로, 외부 페이지가
  //    숨은 폼으로 POST 를 걸면 진짜 사용자의 세션이 시연 계정으로 덮인다.
  //    자기 밭을 보던 사람이 갑자기 남의 데모 밭을 보게 된다.
  //    브라우저가 붙이는 값이라 위조할 수 없다. 없으면(구형 브라우저·curl)
  //    통과시키지 않는다 — 시연 버튼은 우리 화면에서만 눌리면 된다.
  if (request.headers.get("sec-fetch-site") !== "same-origin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 이미 로그인한 사람은 그대로 둔다. 새로 발급하면 (1) 위와 같은 덮어쓰기가
  // 일어나고 (2) 버튼 연타·봇 호출마다 refresh_token 이 쌓인다.
  if (await getViewer()) {
    return seeOther("/dashboard");
  }

  const email = POC_EMAILS[Math.floor(Math.random() * POC_EMAILS.length)];

  const supabase = await getSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // 어느 계정이 왜 실패했는지는 로그에만 남긴다. 화면에는 계정 주소를 내지
    // 않는다 — 시연 계정이라도 목록을 굳이 알려줄 이유가 없다.
    console.error("[poc] 시연 계정 로그인 실패", email, error.message);
    return seeOther("/login?error=poc");
  }

  return seeOther("/dashboard");
}

/**
 * 상대 경로로 보내는 303.
 *
 * 303 인 이유: POST 의 응답으로 GET 페이지를 보여 준다. 302 로 두면 일부
 * 브라우저가 POST 를 다시 보내 로그인이 두 번 일어난다.
 *
 * 절대 주소를 만들지 않는 이유는 위 ⚠️ 에 적었다.
 */
function seeOther(path: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

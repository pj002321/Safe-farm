import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * ---------------------------------------------
 * [Feature]: 관리자 세션 토큰 서명·검증 (순수 함수)
 *
 * [Description]
 * - 토큰 모양은 `<만료 epoch ms>.<HMAC-SHA256>` 이다. 서명 키는 `ADMIN_PASSWORD`
 *   그 자체라, 비밀번호를 바꾸면 발급된 세션이 전부 무효가 된다(별도 폐기 목록 없음).
 * - 비교는 `timingSafeEqual` 로 한다. `===` 는 앞에서부터 다른 글자를 만나면 바로
 *   멈춰, 응답 시간 차이로 서명을 한 글자씩 맞춰 볼 수 있다.
 * - 비밀번호도 SHA-256 으로 길이를 맞춘 뒤 같은 방식으로 비교한다.
 *   `timingSafeEqual` 은 길이가 다르면 던지므로, 그대로 쓰면 길이가 새어 나간다.
 * ---------------------------------------------
 */

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function sameBytes(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signAdminToken(secret: string, expiresAt: number): string {
  const payload = String(expiresAt);
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyAdminToken(
  secret: string,
  token: string | undefined,
  now: number,
): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  if (!sameBytes(Buffer.from(signature), Buffer.from(sign(secret, payload)))) {
    return false;
  }
  return Number(payload) > now;
}

export function passwordMatches(expected: string, input: string): boolean {
  const digest = (value: string) =>
    createHmac("sha256", "admin").update(value).digest();
  return sameBytes(digest(expected), digest(input));
}

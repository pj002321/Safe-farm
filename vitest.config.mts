import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * ---------------------------------------------
 * [Feature]: Vitest 설정
 *
 * [Description]
 * - 기본 환경은 `node`. 테스트 대부분이 도메인 순수 함수·LangGraph 노드라
 *   jsdom 부팅 비용을 매 파일마다 낼 이유가 없다.
 * - 컴포넌트 테스트가 필요한 파일만 맨 위에 `// @vitest-environment jsdom`.
 *   (`environmentMatchGlobs`는 Vitest 3에서 deprecated됐다.)
 * - `resolve.tsconfigPaths`: Vite 8 네이티브 기능. `@/*` alias가 테스트에서도
 *   그대로 동작한다. vite-tsconfig-paths 플러그인은 불필요.
 *
 * [Usage]
 * ```bash
 * npm test              # 1회 실행
 * npm run test:watch    # 변경 감지
 * ```
 * ---------------------------------------------
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});

import { SwaggerViewer } from "./SwaggerViewer";

/**
 * ---------------------------------------------
 * [Feature]: API 문서 (Swagger UI)
 *
 * [Description]
 * - 접근 제어는 `(admin)/layout.tsx` 의 `requireAdminOrRedirect()` 가 한다.
 * ---------------------------------------------
 */
export default function ApiDocsPage() {
  return <SwaggerViewer />;
}

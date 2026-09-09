import { FieldForm } from "@/features/fields/components/FieldForm";

/**
 * ---------------------------------------------
 * [Feature]: 농지 관리 화면  →  /fields
 *
 * [Description]
 * - `app/` 은 라우팅 전용이다. 이 파일에 로직을 두지 않는다 —
 *   feature의 컴포넌트를 조립하기만 한다.
 * - 목록은 여기서 SSR로 안 가져온다. 클라이언트 컴포넌트가
 *   `features/fields/api.ts` 로 InsForge를 직접 친다(리전 A안).
 * ---------------------------------------------
 */
export default function FieldsPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <div>
        <h1 className="font-bold text-2xl">농지 관리</h1>
        <p className="mt-1 text-fg-muted">
          등록한 농지의 기상 조건으로 재배 적합도를 계산합니다.
        </p>
      </div>
      <FieldForm />
    </main>
  );
}

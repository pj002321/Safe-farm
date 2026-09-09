"use client";

import { insforge } from "@/shared/insforge/client";
import { type Field, type FieldRow, toField } from "./types";

/**
 * ---------------------------------------------
 * [Feature]: 농지 조회 (브라우저 → InsForge 직결)
 *
 * [Description]
 * - **이 프로젝트의 기본 데이터 경로.** Next 서버를 거치지 않는다.
 *   리전 A안: Vercel 함수(iad1)와 InsForge(ap-southeast)가 떨어져 있어
 *   SSR로 DB를 치면 대륙 왕복이 붙는다. 브라우저에서 직접 치면 1홉이다.
 * - 권한은 anon 롤 + RLS. `fields` 테이블에 owner 기준 정책이 있어야
 *   내 밭만 돌아온다. 정책이 없으면 전부 열린다 — 마이그레이션에서 반드시 같이 작성.
 *
 * [Usage]
 * ```tsx
 * "use client";
 * const fields = await listMyFields();
 * ```
 * ---------------------------------------------
 */
export async function listMyFields(): Promise<Field[]> {
  const { data, error } = await insforge.database.from("fields").select();
  if (error) throw new Error(error.message);
  return ((data ?? []) as FieldRow[]).map(toField);
}

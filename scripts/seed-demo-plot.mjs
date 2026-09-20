#!/usr/bin/env node

/**
 * 랜딩 페이지 `#today` 섹션이 보여줄 데모 밭을 만들거나 값을 맞춘다.
 *
 *   SUPABASE_SERVICE_ROLE='...' node scripts/seed-demo-plot.mjs
 *
 * 몇 번을 돌려도 같은 결과다 — `plots.is_demo = true` 인 행을 먼저 찾고,
 * 있으면 값만 맞추고 없으면 새로 만든다(계정도 마찬가지, 이메일로 먼저 찾는다).
 *
 * 품종은 `crops.name` · `crop_variants.maturity_type` 으로 찾는다(자연키).
 * ai-service 가 채워 둔 실제 배추 데이터를 그대로 참조한다 — 숫자를 여기서
 * 새로 짓지 않는다.
 */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const line of readFileSync(
  new URL("../.env", import.meta.url),
  "utf8",
).split("\n")) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;

if (!url || !key) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE 이 필요합니다.\n" +
      "service role 키는 .env 에 두지 말고 셸에서 한 번만 주세요:\n" +
      "  SUPABASE_SERVICE_ROLE='...' node scripts/seed-demo-plot.mjs",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEMO_EMAIL = "demo@safefarm.app";
const DEMO_PASSWORD = "safe-farm-demo-2026";

// 상주 · 관측 거점(features/monitoring/domain/fieldPatches.ts)과 같은 좌표.
const DEMO_PLOT = {
  latitude: 36.41,
  longitude: 128.16,
  grid_x: 81,
  grid_y: 102,
  region_code: "47250",
  region_ko: "경상북도 상주시",
  address_ko: "경상북도 상주시",
  name: "데모 배추밭",
  area_m2: 330,
  crops: ["배추"],
};

async function findOrCreateDemoUser() {
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (error) throw error;
  const existing = data.users.find((u) => u.email === DEMO_EMAIL);
  if (existing) return existing.id;

  const { data: created, error: createError } =
    await supabase.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
    });
  if (createError) throw createError;
  console.log(`✓ 데모 계정 생성: ${DEMO_EMAIL}`);
  return created.user.id;
}

async function findOrCreateDemoPlot(userId) {
  const { data: existing, error: findError } = await supabase
    .from("plots")
    .select("id")
    .eq("is_demo", true)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { error } = await supabase
      .from("plots")
      .update({ ...DEMO_PLOT, user_id: userId })
      .eq("id", existing.id);
    if (error) throw error;
    console.log(`✓ 데모 밭 갱신: ${existing.id}`);
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("plots")
    .insert({ ...DEMO_PLOT, user_id: userId, is_demo: true })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`✓ 데모 밭 생성: ${created.id}`);
  return created.id;
}

async function findCabbageMidVariantId() {
  const { data, error } = await supabase
    .from("crop_variants")
    .select("variant_id, crops!inner(name)")
    .eq("maturity_type", "MID")
    .eq("crops.name", "배추")
    .single();
  if (error) throw error;
  return data.variant_id;
}

/** 오늘로부터 6주 전. 정식~신장기 구간에 들어와 있어 게이지가 빈 화면이 아니게 한다. */
function sixWeeksAgo() {
  const date = new Date();
  date.setDate(date.getDate() - 42);
  return date.toISOString().slice(0, 10);
}

async function findOrCreateDemoCultivation(plotId, variantId) {
  const { data: existing, error: findError } = await supabase
    .from("cultivations")
    .select("id")
    .eq("plot_id", plotId)
    .eq("variant_id", variantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (findError) throw findError;

  const sowingDate = sixWeeksAgo();

  if (existing) {
    const { error } = await supabase
      .from("cultivations")
      .update({ sowing_date: sowingDate, status: "GROWING" })
      .eq("id", existing.id);
    if (error) throw error;
    console.log(`✓ 데모 재배 갱신: ${existing.id} (파종일 ${sowingDate})`);
    return;
  }

  const { data: created, error } = await supabase
    .from("cultivations")
    .insert({
      plot_id: plotId,
      variant_id: variantId,
      sowing_date: sowingDate,
      sowing_type: "SEED",
      status: "GROWING",
    })
    .select("id")
    .single();
  if (error) throw error;
  console.log(`✓ 데모 재배 생성: ${created.id} (파종일 ${sowingDate})`);
}

try {
  const userId = await findOrCreateDemoUser();
  const plotId = await findOrCreateDemoPlot(userId);
  const variantId = await findCabbageMidVariantId();
  await findOrCreateDemoCultivation(plotId, variantId);
  console.log("완료.");
} catch (error) {
  console.error("실패:", error.message);
  process.exit(1);
}

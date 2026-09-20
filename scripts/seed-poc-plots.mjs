#!/usr/bin/env node

/**
 * POC 데모 계정의 밭을 여러 개 만들고 할 일 카드가 나오게 한다.
 *
 *   SUPABASE_SERVICE_ROLE='...' node scripts/seed-poc-plots.mjs
 *
 * 몇 번을 돌려도 같은 결과다 — 계정은 이메일로, 밭은 (user_id, name) 으로
 * 먼저 찾고 있으면 값만 맞춘다.
 *
 * `seed-demo-plot.mjs` 와 나눈 이유:
 *   - 그쪽은 **랜딩이 로그인 없이 보여주는 밭 한 곳**이다(`plots.is_demo = true`,
 *     유니크 인덱스가 하나만 허용한다). 성격이 다르고 지우면 랜딩이 빈다.
 *   - 이쪽은 **로그인해서 둘러보는 POC 계정들**이다. is_demo 를 켜지 않는다.
 *
 * ⚠️ 카드를 직접 넣지 않는다. 밭·재배만 만들고 판정은 ai-service 의 규칙
 *    (`task_rules.py`)이 하게 둔다. 손으로 넣으면 근거 없는 카드가 되고,
 *    조건이 바뀌어도 그대로 남아 화면이 거짓말을 한다.
 *
 * 작물은 **관수·시비·작업 신호가 실제로 있는 것**만 고른다(2026-09-21 실측,
 * crop_stages 기준). 신호가 없는 작물을 심으면 카드가 0건이라 POC 가 빈 화면이
 * 된다.
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
      "  SUPABASE_SERVICE_ROLE='...' node scripts/seed-poc-plots.mjs",
  );
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * POC 계정 5개.
 *
 * 비밀번호가 같은 이유: 이 계정들은 **공개 시연용**이고 개인 자료가 없다.
 * 계정마다 다르게 두면 관리만 늘고 보호되는 것은 없다 — 어차피 POC 버튼이
 * 아무나 들여보낸다. 실사용자 계정과 같은 취급을 하지 말 것.
 */
const PASSWORD = "safe-farm-poc-2026";

/**
 * 밭 구성. 좌표는 실제 시군구이고 관측소가 붙는 곳으로 골랐다 —
 * 관측이 없으면 GDD 를 못 쌓아 단계가 안 나오고, 그러면 카드도 없다.
 *
 * `daysAgo` 는 파종일을 정한다. 목표 GDD 대비 어느 단계에 걸릴지가 여기서
 * 갈리므로, 작물마다 다르게 둬서 화면에 여러 단계가 보이게 했다.
 */
const ACCOUNTS = [
  {
    email: "poc1@safefarm.app",
    nameKo: "상주 배추 농가",
    plots: [
      { name: "윗배추밭", crop: "배추", maturity: "MID", daysAgo: 55, ...at("상주") },
      { name: "아랫배추밭", crop: "배추", maturity: "LATE", daysAgo: 30, ...at("상주") },
    ],
  },
  {
    email: "poc2@safefarm.app",
    nameKo: "김제 벼 농가",
    plots: [
      { name: "너른논", crop: "벼", maturity: "MID", daysAgo: 120, ...at("김제") },
      { name: "다락논", crop: "벼", maturity: "LATE", daysAgo: 100, ...at("김제") },
    ],
  },
  {
    email: "poc3@safefarm.app",
    nameKo: "제천 밭작물 농가",
    plots: [
      { name: "유채밭", crop: "유채", maturity: "MID", daysAgo: 70, ...at("제천") },
      { name: "팥밭", crop: "팥", maturity: "MID", daysAgo: 60, ...at("제천") },
    ],
  },
  {
    email: "poc4@safefarm.app",
    nameKo: "안동 보리 농가",
    plots: [
      { name: "앞보리밭", crop: "보리", maturity: "MID", daysAgo: 90, ...at("안동") },
      { name: "뒷배추밭", crop: "배추", maturity: "EARLY", daysAgo: 40, ...at("안동") },
    ],
  },
  {
    email: "poc5@safefarm.app",
    nameKo: "나주 복합 농가",
    plots: [
      { name: "벼논", crop: "벼", maturity: "EARLY", daysAgo: 110, ...at("나주") },
      { name: "유채밭", crop: "유채", maturity: "LATE", daysAgo: 80, ...at("나주") },
      { name: "팥밭", crop: "팥", maturity: "MID", daysAgo: 45, ...at("나주") },
    ],
  },
];

/** 시군구 좌표·격자·행정코드. 관측소가 가까운 곳으로 골랐다. */
function at(regionKo) {
  const REGIONS = {
    상주: { latitude: 36.41, longitude: 128.16, grid_x: 81, grid_y: 102, region_code: "47250", region_ko: "경상북도 상주시" },
    김제: { latitude: 35.80, longitude: 126.88, grid_x: 59, grid_y: 89, region_code: "45210", region_ko: "전라북도 김제시" },
    제천: { latitude: 37.13, longitude: 128.19, grid_x: 81, grid_y: 123, region_code: "43150", region_ko: "충청북도 제천시" },
    안동: { latitude: 36.57, longitude: 128.73, grid_x: 91, grid_y: 106, region_code: "47170", region_ko: "경상북도 안동시" },
    나주: { latitude: 35.02, longitude: 126.71, grid_x: 56, grid_y: 71, region_code: "46170", region_ko: "전라남도 나주시" },
  };
  const r = REGIONS[regionKo];
  if (!r) throw new Error(`좌표를 모르는 지역: ${regionKo}`);
  return { ...r, address_ko: r.region_ko };
}

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

async function findOrCreateUser(email) {
  // listUsers 는 페이지 단위다. POC 계정은 앞쪽에 몰려 있지 않을 수 있어
  // 넉넉히 받는다 — 못 찾고 createUser 로 가면 중복 이메일로 실패한다.
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  const existing = data.users.find((u) => u.email === email);
  if (existing) return { id: existing.id, created: false };

  const { data: made, error: createError } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createError) throw createError;
  return { id: made.user.id, created: true };
}

async function variantIdOf(cropName, maturity) {
  const { data, error } = await supabase
    .from("crop_variants")
    .select("variant_id, gdd_target, crops!inner(name)")
    .eq("crops.name", cropName)
    .eq("maturity_type", maturity)
    .not("gdd_target", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`${cropName}/${maturity} 품종을 못 찾았습니다`);
  return data.variant_id;
}

async function upsertPlot(userId, spec) {
  const { name, crop, maturity, daysAgo, ...geo } = spec;

  const { data: existing, error: findError } = await supabase
    .from("plots")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
    .is("deleted_at", null)
    .maybeSingle();
  if (findError) throw findError;

  let plotId = existing?.id;
  if (plotId) {
    const { error } = await supabase.from("plots").update(geo).eq("id", plotId);
    if (error) throw error;
  } else {
    const { data: made, error } = await supabase
      .from("plots")
      .insert({ ...geo, name, user_id: userId, area_m2: 330 })
      .select("id")
      .single();
    if (error) throw error;
    plotId = made.id;
  }

  const variantId = await variantIdOf(crop, maturity);
  const sowingDate = daysAgoIso(daysAgo);

  const { data: cul, error: culFind } = await supabase
    .from("cultivations")
    .select("id")
    .eq("plot_id", plotId)
    .eq("variant_id", variantId)
    .is("deleted_at", null)
    .maybeSingle();
  if (culFind) throw culFind;

  if (cul) {
    const { error } = await supabase
      .from("cultivations")
      .update({ sowing_date: sowingDate, status: "GROWING" })
      .eq("id", cul.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("cultivations").insert({
      plot_id: plotId,
      variant_id: variantId,
      sowing_date: sowingDate,
      sowing_type: "SEED",
      status: "GROWING",
    });
    if (error) throw error;
  }

  return { plotId, name, crop, maturity, sowingDate };
}

try {
  const summary = [];
  for (const account of ACCOUNTS) {
    const { id, created } = await findOrCreateUser(account.email);
    console.log(`${created ? "✓ 계정 생성" : "· 계정 확인"}: ${account.email}`);

    const plots = [];
    for (const spec of account.plots) {
      const made = await upsertPlot(id, spec);
      plots.push(made);
      console.log(`    밭 ${made.name} (${made.crop}/${made.maturity}, 파종 ${made.sowingDate})`);
    }
    summary.push({ email: account.email, nameKo: account.nameKo, userId: id, plots });
  }

  console.log("\n완료. 계정 " + summary.length + "개 / 밭 " +
    summary.reduce((n, a) => n + a.plots.length, 0) + "곳");
  console.log("비밀번호: " + PASSWORD);
} catch (error) {
  console.error("실패:", error.message);
  process.exit(1);
}

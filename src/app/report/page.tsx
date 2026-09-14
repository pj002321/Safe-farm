import type { Metadata } from "next";
import { ReportStage } from "@/components/report/ReportStage";

/**
 * ---------------------------------------------
 * [Feature]: 오늘의 리포트 (PoC 데모)
 *
 * [Description]
 * - 랜딩의 "오늘의 리포트 보기" 가 닿는 곳. 서비스가 실제로 무엇을 내놓는지,
 *   그리고 그 문장이 **어디서 왔는지**를 과정 재생으로 보여준다.
 * - 로그인 없이 열린다(`proxy.ts` 의 공개 경로). 이걸 막으면 랜딩에서 서비스를
 *   보여줄 방법이 사라진다 — 가입 전에 납득시키는 것이 이 화면의 일이다.
 * - 이 파일은 **조립만** 한다. 계산은 `features/report/domain/`, 화면은
 *   `components/report/` 에 있다.
 * - 데이터가 전부 고정 상수라 이 페이지는 정적으로 프리렌더된다. 기상청·위성
 *   연동이 붙으면 그때 동적으로 바뀐다.
 *
 * [Usage]
 * ```
 * /report
 * ```
 * ---------------------------------------------
 */

export const metadata: Metadata = {
  title: "오늘의 리포트",
  description:
    "경북 상주 배추밭의 실측 데이터로 생육 상태와 재해 위험을 계산하고, 그 문장이 어디서 왔는지 과정을 그대로 보여줍니다.",
};

export default function ReportPage() {
  return <ReportStage />;
}

import { ArrowRightIcon } from "@/components/icons";
import { ButtonLink } from "@/components/shared/Button";
import { Reveal } from "@/components/shared/Reveal";
import { SANGJU_TODAY } from "@/features/monitoring/domain/plots";

/**
 * ---------------------------------------------
 * [Feature]: 마지막 전환 배너 (#start)
 *
 * [Description]
 * - 페이지의 끝. 앞에서 계속 "상주는 이렇다"를 보여 줬으니, 여기서는 **그 화면을
 *   당신 밭으로 바꾸는 것**만 말한다. 새 정보를 얹지 않는다.
 * - 문구의 숫자를 손으로 적지 않고 `SANGJU_TODAY` 에서 가져온다. 위쪽 `#today`
 *   섹션과 같은 값을 봐야 하고, 데이터가 갱신될 때 여기만 옛 숫자로 남으면
 *   "꾸며낸 숫자가 하나도 없습니다"라는 그 위의 약속이 곧바로 거짓이 된다.
 * - 배경은 히어로와 같은 `bg-space` 다. 밤하늘로 시작해서 밤하늘로 닫는다 —
 *   라이트 모드에서도 어두운 이유는 이 두 곳이 같은 장면이기 때문이다.
 * - 강조색 대비를 위해 `space-*` 토큰만 쓴다. 일반 `fg` 계열은 라이트 모드에서
 *   어두운 배경 위에 검은 글자가 되어 읽히지 않는다.
 *
 * [Usage]
 * ```tsx
 * <CallToAction />
 * ```
 * ---------------------------------------------
 */
export function CallToAction() {
  return (
    <section
      className="relative isolate w-full overflow-hidden bg-space"
      id="start"
    >
      {/* 방사형 글로우 2개. 완전한 검정이면 화면이 죽어 보인다. 순수 장식. */}
      <div
        aria-hidden="true"
        className="-top-32 -left-24 pointer-events-none absolute size-[28rem] rounded-full bg-accent opacity-20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-8rem] bottom-[-10rem] size-[26rem] rounded-full bg-telemetry opacity-10 blur-3xl"
      />

      <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-6 px-6 py-24 text-center md:py-32">
        <Reveal className="flex flex-col items-center gap-6">
          {/*
            Badge 를 쓰지 않았다. 이 섹션은 라이트 모드에서도 어두운데, 라이트의
            --telemetry 는 짙은 올리브라 밤하늘 위에서 3.6:1 밖에 안 나온다.
            space 토큰으로 직접 칩을 그려 대비를 확보한다.
          */}
          <p className="inline-flex items-center gap-2 rounded-full border border-space-border bg-space-fg/5 px-3 py-1.5 text-space-fg text-xs">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-telemetry"
            />
            시범 지역 · {SANGJU_TODAY.stationKo}
          </p>

          <h2 className="text-balance font-semibold text-3xl text-space-fg tracking-tight md:text-display">
            이레 동안 비가 {SANGJU_TODAY.rain7dMm.toFixed(1)}mm.
            <br />
            알고 계셨나요?
          </h2>

          <p className="max-w-xl text-pretty text-space-muted leading-relaxed">
            상주의 배추밭은 오늘 물을 줘야 합니다. 밭 하나를 등록하시면 같은
            계산을 당신의 좌표로 돌려, 내일 아침 첫 리포트를 보내 드립니다.
          </p>

          <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
            <ButtonLink
              href="/signup"
              iconEnd={<ArrowRightIcon />}
              size="lg"
              variant="primary"
            >
              내 밭 등록하기
            </ButtonLink>

            {/*
              어두운 배경 위에서는 outline 이 border-strong(밝은 회색)을 써서
              대비가 모자란다. Button.tsx 를 고치는 대신 자식 앵커의 색만 덮는다.
            */}
            <div className="[&>a:hover]:border-telemetry [&>a:hover]:text-telemetry [&>a]:border-space-border [&>a]:text-space-fg">
              <ButtonLink href="#today" size="lg" variant="outline">
                오늘 상주 다시 보기
              </ButtonLink>
            </div>
          </div>

          <p className="text-space-muted text-xs">
            신용카드가 필요하지 않습니다 · 시범 운영 기간 무료
          </p>
        </Reveal>
      </div>
    </section>
  );
}

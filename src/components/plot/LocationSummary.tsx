import { MapPinIcon } from "@/components/icons";
import { Badge } from "@/components/shared/Badge";

/**
 * ---------------------------------------------
 * [Feature]: 선택된 위치와 변환 결과 (마크업 전용)
 *
 * [Description]
 * - 지도 조작의 **결과**를 받아 적는 칸이다. 시안은 회색 readonly input 하나였는데,
 *   화면에서 가장 중요한 값이 가장 흐리게 보였다. 등록의 근거이므로 강조 카드다.
 * - 격자(nx, ny)와 행정구역 코드를 **함께 보여 준다**. 이후 모든 기상·위성 조회의
 *   키라서(스펙), 잘못 잡히면 등록이 끝난 뒤에 알아채게 된다. 지금 보여 주면
 *   사용자가 "우리 동네가 맞나"를 그 자리에서 판단할 수 있다.
 * - 좌표·격자는 `font-mono` + `tabular-nums` 다. 값이 바뀔 때 자릿수가 흔들리면
 *   숫자가 튀어 보인다.
 * - **아직 값이 없는 상태**를 기본으로 그린다. 자리를 미리 잡아 두면 선택 전후로
 *   패널 높이가 튀지 않는다. 값이 들어온 모습은 `selected` 로 확인한다.
 *
 * [Usage]
 * ```tsx
 * <LocationSummary />                 // 미선택
 * <LocationSummary selected={{...}} /> // 선택됨 (퍼블 확인용)
 * ```
 * ---------------------------------------------
 */

export interface SelectedLocation {
  addressKo: string;
  latitude: number;
  longitude: number;
  /** 기상청 5km 격자. 이후 모든 기상 조회의 키다. */
  gridX: number;
  gridY: number;
  /** 행정구역 코드(법정동). 위성·통계 조회에 쓴다. */
  regionCode: string;
  regionKo: string;
}

export function LocationSummary({
  selected,
}: {
  selected?: SelectedLocation | null;
}) {
  if (!selected) {
    return (
      <div className="rounded-md border border-accent/40 border-dashed bg-accent-subtle px-4 py-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[0.65rem] text-accent uppercase tracking-[0.12em]">
            선택된 위치
          </span>
          <Badge size="sm" tone="neutral">
            미선택
          </Badge>
        </div>

        <p className="mt-2 flex items-center gap-1.5 font-medium text-fg-muted text-sm">
          <MapPinIcon className="shrink-0 text-accent" />
          지도를 움직여 밭을 맞춰 주세요
        </p>
        <p className="mt-1 font-mono text-[0.7rem] text-fg-subtle tabular-nums">
          위도 — · 경도 — · 격자 —
        </p>

        {/* 폼 제출에 실릴 값. 지도가 이 input 들을 채운다. */}
        <input name="latitude" type="hidden" />
        <input name="longitude" type="hidden" />
      </div>
    );
  }

  return (
    <div className="rounded-md border border-accent/40 bg-accent-subtle px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[0.65rem] text-accent uppercase tracking-[0.12em]">
          선택된 위치
        </span>
        <Badge dot size="sm" tone="telemetry">
          확인됨
        </Badge>
      </div>

      <p className="mt-2 flex items-start gap-1.5 font-medium text-fg text-sm leading-snug">
        <MapPinIcon className="mt-0.5 shrink-0 text-accent" />
        {selected.addressKo}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-accent/20 border-t pt-3">
        <Item
          labelKo="위경도"
          valueKo={`${selected.latitude.toFixed(4)}, ${selected.longitude.toFixed(4)}`}
        />
        <Item
          labelKo="기상 격자"
          valueKo={`nx ${selected.gridX} · ny ${selected.gridY}`}
        />
        <Item labelKo="행정구역" valueKo={selected.regionKo} />
        <Item labelKo="법정동 코드" valueKo={selected.regionCode} />
      </dl>

      <input name="latitude" type="hidden" defaultValue={selected.latitude} />
      <input name="longitude" type="hidden" defaultValue={selected.longitude} />
      <input name="addressKo" type="hidden" defaultValue={selected.addressKo} />
      <input
        name="regionCode"
        type="hidden"
        defaultValue={selected.regionCode}
      />
      <input name="regionKo" type="hidden" defaultValue={selected.regionKo} />
    </div>
  );
}

function Item({ labelKo, valueKo }: { labelKo: string; valueKo: string }) {
  return (
    <div>
      <dt className="font-mono text-[0.62rem] text-fg-subtle uppercase tracking-[0.1em]">
        {labelKo}
      </dt>
      <dd className="mt-0.5 font-mono text-[0.78rem] text-fg tabular-nums">
        {valueKo}
      </dd>
    </div>
  );
}

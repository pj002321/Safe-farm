import { WeatherIcon } from "@/components/cultivation/WeatherIcon";
import type { TimelineEntry } from "@/features/cultivations/domain/timeline";
import { windDirectionKo } from "@/shared/growth/windText";
import { kstStampString } from "@/shared/utils/kstDate";

/**
 * ---------------------------------------------
 * [Feature]: 일지 한 줄을 펼쳤을 때 — 저장된 것 전부
 *
 * [Description]
 * - 목록에서는 제목만 보이고, 누르면 **그 줄에 박힌 값이 칸마다 이름을 달고**
 *   나온다. 한 줄 띠로 흘리면 "무엇이 27.3인지" 를 세어 봐야 한다.
 * - **빈 칸도 이름은 띄운다.** 값이 있는 것만 그리면 이 일지가 무엇 무엇을
 *   담는지 알 수 없다. 빈 자리는 `—` 로 두어 "여기 들어올 값이 있는데 없다"
 *   를 보인다.
 *   ⚠ **`0` 으로 채우지 않는다.** `강수량 0` 은 "비가 안 왔다" 는 뜻이라 못 찾은
 *     날과 안 온 날이 같아진다. `—` 는 그 둘을 가른다.
 * - **누가 넣은 값인지 왼쪽 띠 색으로 가른다.** 사용자가 적거나 고른 것과 우리가
 *   채운 것이 섞여 있어서, 농민이 "이건 내가 쓴 게 아닌데" 를 알 수 있어야 한다.
 * - 영어 칸 이름(`temp_max_c`)은 쓰지 않는다. 화면은 농민이 읽는 자리다.
 * - 서버 컴포넌트다. 상태도 브라우저 API 도 쓰지 않는다.
 * ---------------------------------------------
 */

/** 값이 없는 칸에 찍는 글자. 빈 문자열이면 칸이 무너지고 `0` 이면 거짓말이 된다. */
const EMPTY = "—";

interface Field {
  labelKo: string;
  /** 없으면 `—` 로 그린다. */
  value: string | null;
  /** 사용자가 적거나 고른 값인가. 왼쪽 띠 색이 갈린다. */
  byUser?: boolean;
  /** 하늘 칸에만 붙는 그림. */
  skyKo?: string | null;
  /** 긴 글. 칸 하나를 다 쓰고 줄바꿈을 살린다. */
  wide?: boolean;
  /** 묶음 제목이 이미 같은 말을 할 때. 칸 이름을 두 번 적지 않는다. */
  hideLabel?: boolean;
}

function text(value: string | number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

/** 우리가 저장할 때 채우는 기상 숫자들. 사용자가 손댈 수 없는 칸이다. */
function measuredFields(entry: TimelineEntry): Field[] {
  const w = entry.weather;
  const windKo = windDirectionKo(w?.windDirDeg ?? null);
  const wind =
    w?.windMs == null
      ? null
      : `${w.windMs}${windKo === null ? "" : ` ${windKo}`}`;

  return [
    { labelKo: "최고 온도 ℃", value: text(w?.tempMaxC) },
    { labelKo: "최저 온도 ℃", value: text(w?.tempMinC) },
    { labelKo: "강수량 mm", value: text(w?.rainfallMm) },
    { labelKo: "습도 %", value: text(w?.humidityPct) },
    { labelKo: "바람 m/s", value: wind },
    // 일몰은 안 그린다. 밭에 나가는 때를 정하는 값은 일출 쪽이라, 둘을 같이 두면
    // 칸만 늘고 읽을 것이 준다. 값은 그대로 저장돼 있다.
    { labelKo: "일출시각", value: text(w?.sunriseAt) },
  ];
}

function Cell({ field }: { field: Field }) {
  const empty = field.value === null;

  return (
    <div
      className={`flex flex-col gap-0.5 rounded-md border-l-2 bg-surface-2 py-1.5 pr-2 pl-2.5 ${
        field.byUser ? "border-accent" : "border-good"
      } ${empty ? "opacity-60" : ""} ${field.wide ? "col-span-2 sm:col-span-3" : ""}`}
    >
      {!field.hideLabel && (
        <dt className="text-fg-subtle text-xs">{field.labelKo}</dt>
      )}
      <dd
        className={`m-0 flex items-center gap-1.5 text-sm ${
          field.wide ? "whitespace-pre-wrap wrap-break-word" : "tabular-nums"
        } ${empty ? "text-fg-subtle" : "text-fg"}`}
      >
        {field.skyKo && <WeatherIcon skyKo={field.skyKo} />}
        {field.value ?? EMPTY}
      </dd>
    </div>
  );
}

function Group({
  titleKo,
  noteKo,
  fields,
}: {
  /** 없으면 칸만 그린다. 날짜·날씨 줄이 그렇다. */
  titleKo?: string;
  noteKo?: string;
  fields: readonly Field[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {titleKo && (
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-fg text-xs">{titleKo}</span>
          {noteKo && <span className="text-fg-subtle text-xs">{noteKo}</span>}
        </div>
      )}
      <dl className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {fields.map((field) => (
          <Cell field={field} key={field.labelKo} />
        ))}
      </dl>
    </div>
  );
}

/** 묶음 제목과 같은 꼴의 한 줄. 박스를 씌울 값어치가 없는 것에 쓴다. */
function Caption({
  titleKo,
  value,
}: {
  titleKo: string;
  value: string | null;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-medium text-fg text-xs">{titleKo}</span>
      <span className="text-fg-subtle text-xs tabular-nums">
        {value ?? EMPTY}
      </span>
    </div>
  );
}

export function DiaryDetail({ entry }: { entry: TimelineEntry }) {
  const skyKo = entry.weather?.skyKo ?? null;

  return (
    <div className="mt-3 flex flex-col gap-3">
      <Caption titleKo="작성일시" value={kstStampString(entry.createdAtIso)} />

      {/* 언제 무슨 날씨였나. 둘 다 사용자가 고른 값이라 제목을 따로 두지 않는다 */}
      <Group
        fields={[
          { labelKo: "날짜", value: entry.occurredOn, byUser: true },
          { labelKo: "날씨", value: skyKo, byUser: true, skyKo },
        ]}
      />

      <Group
        fields={measuredFields(entry)}
        noteKo="저장할 때 우리가 채운 값"
        titleKo="기상"
      />

      <Group
        fields={[
          { labelKo: "메모", value: entry.bodyKo, byUser: true, wide: true },
          {
            labelKo: "한 일",
            value: entry.workKindKo,
            byUser: true,
            wide: true,
          },
        ]}
        noteKo="사용자가 적거나 고른 값"
        titleKo="적은 것"
      />

      <Group
        fields={[
          {
            labelKo: "AI 조언",
            value: entry.adviceTextKo,
            wide: true,
            hideLabel: true,
          },
        ]}
        noteKo="우리가 남기는 값"
        titleKo="AI 조언"
      />
    </div>
  );
}

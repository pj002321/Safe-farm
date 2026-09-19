"use client";

import { type RefObject, useCallback, useEffect, useState } from "react";
import {
  applyDraft,
  type Draft,
  parseDraft,
  REGISTER_DRAFT_KEY,
  toDraftValues,
} from "./domain/registerDraft";

/**
 * ---------------------------------------------
 * [Feature]: 밭 등록 폼 임시 저장 — 저장소 다루기 (클라이언트 훅)
 *
 * [Description]
 * - 스텝을 나가거나 새로 고쳐도 입력이 남게 한다(V1-23). 변환·판정은 전부
 *   `domain/registerDraft.ts` 의 순수 함수가 하고, 여기는 **localStorage 와 이벤트**만 맡는다.
 * - 훅으로 뺀 이유: `PlotRegisterForm` 은 다른 사람이 만든 파일이라 한 줄만 얹는다.
 *   로직이 컴포넌트 밖에 있으면 테스트하기도 낫다.
 *
 * ⚠️ **`localStorage` 접근 자체가 던질 수 있다.** 사이트 데이터를 막은 브라우저에서는
 *   읽기만 해도 예외다 — `theme.ts` 와 같은 이유로 전부 try/catch 로 감싼다.
 *   임시 저장이 안 되는 것뿐이고 등록은 그대로 돼야 한다.
 *
 * ⚠️ **복원은 조용히 하되 배너로 알린다.** 지난주에 쓰다 만 밭의 좌표가 말없이
 *   채워지면, 오늘 다른 밭을 등록하면서 그 좌표로 저장하는 사고가 난다.
 *   좌표가 틀리면 날씨·GDD·재해 경보가 전부 엉뚱한 지역 것이 된다.
 *
 * ⚠️ **제출 직전에는 저장본만 지우고 폼은 건드리지 않는다.** `<form action>` 은
 *   onSubmit 이 끝난 **뒤에** FormData 를 읽는다 — 거기서 `form.reset()` 을 부르면
 *   서버 액션이 빈 폼을 받는다. 폼을 비우는 것은 '새로 시작' 버튼만 한다.
 *
 * [Usage]
 * ```tsx
 * const { restored, discard, startOver } = useRegisterDraft(formRef);
 * {restored && <RegisterDraftBanner draft={restored} onStartOver={startOver} />}
 * ```
 * ---------------------------------------------
 */

function readDraft(): Draft | null {
  try {
    return parseDraft(localStorage.getItem(REGISTER_DRAFT_KEY));
  } catch {
    return null;
  }
}

function removeDraft(): void {
  try {
    localStorage.removeItem(REGISTER_DRAFT_KEY);
  } catch {
    // 사이트 데이터를 막은 브라우저. 지울 것도 없다
  }
}

export function useRegisterDraft(formRef: RefObject<HTMLFormElement | null>): {
  /** 복원한 저장본. 배너가 "언제 것인지" 를 보여주는 데 쓴다. 없으면 null. */
  restored: Draft | null;
  /** 저장본만 지운다. 폼은 그대로 — 제출 직전에 부른다. */
  discard: () => void;
  /** 저장본을 지우고 빈 폼으로 돌아간다. 배너의 '새로 시작'. */
  startOver: () => void;
} {
  const [restored, setRestored] = useState<Draft | null>(null);

  const discard = useCallback(() => {
    removeDraft();
    setRestored(null);
  }, []);

  // 새로 고침으로 비운다. form.reset() 은 DOM 만 되돌리고 CropCards 의 useState(고른 작물)는
  // 그대로 남아 라디오 required 가 옛 작물에 걸린다. 첫 화면을 다시 부르는 것이 가장 짧고 확실하다
  const startOver = useCallback(() => {
    removeDraft();
    window.location.reload();
  }, []);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;

    // ① 복원 — 첫 렌더 뒤 한 번. 저장 리스너를 붙이기 **전에** 한다.
    //    applyDraft 가 click() 으로 켜면 change 가 도는데, 리스너가 먼저 붙어 있으면
    //    그 순간 다시 저장돼 savedAt 이 "방금" 으로 덮인다
    //    ⚠ 위치 다섯 칸은 여기서 값만 넣어도 화면이 안 따라온다. 지도 쪽
    //      (PlotLocationStep)이 같은 저장본을 읽어 그 좌표에서 시작한다
    const draft = readDraft();
    if (draft) {
      applyDraft(form, draft.values);
      setRestored(draft);
    }

    // ② 저장 — 입력이 바뀔 때마다. 폼 하나 직렬화라 1ms 도 안 걸린다
    const save = () => {
      try {
        const next: Draft = {
          savedAt: new Date().toISOString(),
          values: toDraftValues(new FormData(form)),
        };
        localStorage.setItem(REGISTER_DRAFT_KEY, JSON.stringify(next));
      } catch {
        // 저장이 안 돼도 등록은 그대로 된다
      }
    };

    // ⚠ input 과 change 를 둘 다 듣는다. 글자 입력은 input 으로 오고
    //   체크박스·라디오·date 는 브라우저에 따라 change 로만 오는 것이 있다
    form.addEventListener("input", save);
    form.addEventListener("change", save);
    return () => {
      form.removeEventListener("input", save);
      form.removeEventListener("change", save);
    };
  }, [formRef]);

  return { restored, discard, startOver };
}

import { describe, expect, it } from "vitest";
import { type FirebaseEnv, readFirebaseConfig } from "./config";

const FULL_ENV: FirebaseEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "safe-farm-ai.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "safe-farm-ai",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "safe-farm-ai.firebasestorage.app",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1083499463635",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:1083499463635:web:abc",
};

describe("readFirebaseConfig", () => {
  it("여섯 값이 다 있으면 설정 객체를 만든다", () => {
    expect(readFirebaseConfig(FULL_ENV)).toEqual({
      apiKey: "api-key",
      authDomain: "safe-farm-ai.firebaseapp.com",
      projectId: "safe-farm-ai",
      storageBucket: "safe-farm-ai.firebasestorage.app",
      messagingSenderId: "1083499463635",
      appId: "1:1083499463635:web:abc",
    });
  });

  it("빠진 변수 이름을 모두 나열해서 던진다 — 한 번에 고치라고", () => {
    expect(
      () =>
        readFirebaseConfig({
          ...FULL_ENV,
          NEXT_PUBLIC_FIREBASE_API_KEY: undefined,
          NEXT_PUBLIC_FIREBASE_APP_ID: "   ",
        }),
      // `s`(dotAll) 플래그는 tsconfig target 이 ES2017 이라 쓸 수 없다.
      // `[\s\S]` 로 같은 뜻을 만들어 target 을 건드리지 않는다.
    ).toThrow(/NEXT_PUBLIC_FIREBASE_API_KEY[\s\S]*NEXT_PUBLIC_FIREBASE_APP_ID/);
  });
});

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/shared/Button";
import { embedMissingChunks } from "./actions";

/** 임베딩이 빠진 조각만 채운다. 전량 재임베딩은 화면에 두지 않는다(ops_status.embed_missing 주석). */
export function EmbedMissingButton({ missing }: { missing: number }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const result = await embedMissingChunks();
      setMessage(
        result.ok
          ? `${result.data.embedded}개 채움 · 남은 ${result.data.remaining}개`
          : (result.detail ?? result.reason),
      );
      router.refresh();
    });

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <Button disabled={missing === 0} loading={pending} onClick={run} size="sm" variant="secondary">
        {missing === 0 ? "임베딩 누락 없음" : `누락 ${missing}개 재색인`}
      </Button>
      {message && <span className="text-fg-muted">{message}</span>}
    </div>
  );
}

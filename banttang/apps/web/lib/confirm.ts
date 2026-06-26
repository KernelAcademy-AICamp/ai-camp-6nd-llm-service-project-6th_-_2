"use client";

import { create } from "zustand";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  // true면 취소 버튼 숨김(=안내/확인 전용 단일 버튼).
  infoOnly?: boolean;
  // true면 확인 버튼을 왼쪽, 취소를 오른쪽에 배치(기본은 취소 왼쪽·확인 오른쪽).
  confirmFirst?: boolean;
};

type ConfirmState = {
  open: boolean;
  options: ConfirmOptions | null;
  resolver: ((value: boolean) => void) | null;
  ask: (opts: ConfirmOptions) => Promise<boolean>;
  respond: (value: boolean) => void;
};

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolver: null,
  ask: (opts) =>
    new Promise<boolean>((resolve) => {
      const prev = get().resolver;
      // 이전 모달이 떠 있었으면 cancel로 처리
      if (prev) prev(false);
      set({ open: true, options: opts, resolver: resolve });
    }),
  respond: (value) => {
    get().resolver?.(value);
    set({ open: false, resolver: null });
  },
}));

export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().ask(opts);
}

// 단일 버튼 안내/확인 모달 — destructive 옵션은 의미 없어 제외.
export function showInfo(
  opts: Omit<ConfirmOptions, "destructive" | "infoOnly" | "cancelText">,
): Promise<void> {
  return useConfirmStore
    .getState()
    .ask({ ...opts, infoOnly: true })
    .then(() => undefined);
}

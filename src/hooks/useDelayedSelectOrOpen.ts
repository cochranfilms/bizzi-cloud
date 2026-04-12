"use client";

import { useCallback, useEffect, useRef } from "react";

const SELECT_DELAY_MS = 280;

/**
 * Single-click vs double-click: when `selectable` and `onSelect` are set, a delayed
 * single click toggles selection; double-click cancels the pending select and runs `onOpen`.
 * When not selectable, the first click runs `onOpen` immediately.
 */
export function useDelayedSelectOrOpen(options: {
  selectable: boolean;
  onSelect?: () => void;
  onOpen?: () => void;
}) {
  const { selectable, onSelect, onOpen } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
      }
    },
    []
  );

  const cancelPendingSelect = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerAreaClick = useCallback(() => {
    if (!selectable || !onSelect) {
      onOpen?.();
      return;
    }
    cancelPendingSelect();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onSelect();
    }, SELECT_DELAY_MS);
  }, [selectable, onSelect, onOpen, cancelPendingSelect]);

  const onPointerAreaDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!selectable || !onSelect) {
        return;
      }
      e.preventDefault();
      cancelPendingSelect();
      onOpen?.();
    },
    [selectable, onSelect, onOpen, cancelPendingSelect]
  );

  const onCardKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === " " && selectable && onSelect) {
        e.preventDefault();
        onSelect();
        return;
      }
      if (e.key === "Enter" && onOpen) {
        e.preventDefault();
        onOpen();
      }
    },
    [selectable, onSelect, onOpen]
  );

  return { onPointerAreaClick, onPointerAreaDoubleClick, onCardKeyDown };
}

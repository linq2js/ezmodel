import { useLayoutEffect, useRef, useState } from "react";

const DEFAULT_VERSION = 0;

export const useRerender = (onRerender?: VoidFunction) => {
  const setVersion = useState(DEFAULT_VERSION)[1];
  const nextRef = useRef({ version: DEFAULT_VERSION, onRerender });
  const rerenderRef = useRef<VoidFunction>();
  const renderingRef = useRef(true);
  nextRef.current = { version: nextRef.current.version + 1, onRerender };
  renderingRef.current = true;

  if (!rerenderRef.current) {
    rerenderRef.current = () => {
      if (renderingRef.current) return;
      setVersion(nextRef.current.version);
      nextRef.current.onRerender?.();
    };
  }

  useLayoutEffect(() => {
    renderingRef.current = false;
  });

  return rerenderRef.current;
};

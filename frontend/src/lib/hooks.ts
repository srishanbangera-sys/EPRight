"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/Providers";

/** Load data and reload when deps or the global version change. */
export function useData<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const { version } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reload = useCallback(async () => {
    setError(null);
    try {
      const d = await fnRef.current();
      setData(d);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, version, ...deps]);
  return { data, error, loading, reload, setData };
}

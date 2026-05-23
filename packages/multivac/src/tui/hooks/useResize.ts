import { useEffect } from "react";
import type { Action } from "../state/actions.js";

export function useResize(dispatch: (action: Action) => void): void {
  useEffect(() => {
    const onResize = () => {
      dispatch({
        type: "set-dims",
        cols: process.stdout.columns ?? 80,
        rows: process.stdout.rows ?? 24,
      });
    };
    onResize();
    process.stdout.on("resize", onResize);
    return () => {
      process.stdout.off("resize", onResize);
    };
  }, [dispatch]);
}

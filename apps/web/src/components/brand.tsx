import type { ReactNode } from "react";

/** The logo and product name at the left of the top bar. */
export function Brand({ children }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="logo">C</div>
      <span className="font-semibold tracking-tight">Cot</span>
      {children}
    </div>
  );
}

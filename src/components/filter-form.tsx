"use client";

import type { ReactNode } from "react";

export function FilterForm({ action, children }: { action: string; children: ReactNode }) {
  return (
    <form
      className="filters"
      method="get"
      action={action}
      onChange={(event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement && (target.type === "search" || target.type === "text")) return;
        event.currentTarget.requestSubmit();
      }}
    >
      {children}
      <button type="submit">Apply filters</button>
    </form>
  );
}

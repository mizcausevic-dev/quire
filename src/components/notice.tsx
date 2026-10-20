export function Notice({ notice }: { notice: { tone: "ok" | "err"; message: string } | null }) {
  if (!notice) return null;
  return <p className={`notice ${notice.tone}`} role={notice.tone === "err" ? "alert" : "status"}>{notice.message}</p>;
}

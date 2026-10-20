import { listAuditEvents } from "@/lib/audit";

export default function AuditPage() {
  const events = listAuditEvents(200, 0);
  return (
    <>
      <h2>Audit</h2>
      <table>
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{event.created_at.slice(0, 19)}</td>
              <td>{event.actor_email ?? "system"}</td>
              <td>{event.action}</td>
              <td>{event.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

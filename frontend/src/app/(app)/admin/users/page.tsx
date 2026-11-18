"use client";

import { api } from "@/lib/api";
import { useData } from "@/lib/hooks";
import { Card, ErrorBox, OrgStatus, PageHeader, Pill, SampleTag, Spinner, Table, Td } from "@/components/ui";

export default function UsersPage() {
  const { data, error, loading, reload } = useData(() => api<any[]>("/admin/users"));
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <div>
      <PageHeader eyebrow="Platform" title="Users" />
      <Card>
        <Table head={["#", "Name", "Email", "Role", "Organisation", "Status"]}>
          {data!.map((u) => (
            <tr key={u.id}>
              <Td>{u.id}</Td>
              <Td className="font-bold">{u.name}</Td>
              <Td>{u.email} {u.is_demo ? <Pill tone="orange">demo</Pill> : null}</Td>
              <Td><Pill>{u.role}</Pill></Td>
              <Td>{u.org_name || "-"} {u.is_sample ? <SampleTag /> : null}</Td>
              <Td>{u.org_status && <OrgStatus status={u.org_status} />}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

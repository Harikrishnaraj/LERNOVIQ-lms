"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { changeUserRoles, setUserStatus } from "@/features/admin/user-actions";
import { PRIVILEGED_ROLES, ROLE_IDS, ROLE_LABEL, type RoleId } from "@/features/admin/user-rules";
import type { AdminUser } from "@/features/admin/users";

export function UserRowActions({ user, isSelf, actorIsSuper }: { user: AdminUser; isSelf: boolean; actorIsSuper: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [roles, setRoles] = useState<string[]>(user.roles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const targetIsPrivileged = user.roles.some((r) => (PRIVILEGED_ROLES as readonly string[]).includes(r));
  const locked = isSelf || (!actorIsSuper && targetIsPrivileged);
  const name = user.email ?? user.fullName ?? "user";

  async function saveRoles() {
    setBusy(true);
    setError(null);
    const r = await changeUserRoles(user.userId, roles);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function toggleStatus() {
    setBusy(true);
    setError(null);
    const r = await setUserStatus(user.userId, user.status === "active" ? "suspended" : "active");
    setBusy(false);
    setConfirming(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    router.refresh();
  }

  if (locked) {
    return <span className="text-xs text-text-secondary">{isSelf ? "This is you" : "Super admin only"}</span>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setEditing((v) => !v)} disabled={busy}>
          Roles<span className="sr-only"> for {name}</span>
        </Button>
        {confirming ? (
          <>
            <Button size="sm" onClick={toggleStatus} loading={busy}>
              Confirm {user.status === "active" ? "suspend" : "reinstate"}
              <span className="sr-only"> {name}</span>
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setConfirming(true)} disabled={busy}>
            {user.status === "active" ? "Suspend" : "Reinstate"}
            <span className="sr-only"> {name}</span>
          </Button>
        )}
      </div>
      {editing && (
        <fieldset className="space-y-1 rounded-control border border-border p-2" disabled={busy}>
          <legend className="px-1 text-xs font-semibold">Roles for {name}</legend>
          {ROLE_IDS.map((r: RoleId) => {
            const privileged = (PRIVILEGED_ROLES as readonly string[]).includes(r);
            return (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={roles.includes(r)}
                  disabled={privileged && !actorIsSuper}
                  onChange={(e) => setRoles((prev) => (e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)))}
                />
                {ROLE_LABEL[r]}
              </label>
            );
          })}
          <Button size="sm" onClick={saveRoles} loading={busy}>
            Save roles
          </Button>
        </fieldset>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}

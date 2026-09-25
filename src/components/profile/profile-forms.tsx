"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changePassword, updateProfile } from "@/features/profile/actions";
import { NAME_MAX, PASSWORD_MIN } from "@/features/profile/rules";

export function ProfileForm({ initialName, email, avatarUrl }: { initialName: string; email: string; avatarUrl: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setNotice(null);
    const result = await updateProfile(new FormData(form));
    setBusy(false);
    if (!result.ok) {
      setNotice({ tone: "error", text: result.error });
      return;
    }
    setNotice({ tone: "ok", text: "Saved." });
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-5" aria-label="Profile">
      {notice && (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={
            notice.tone === "error"
              ? "flex items-start gap-2 rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text"
              : "flex items-start gap-2 rounded-card border border-success bg-success-light p-3 text-sm text-success-text"
          }
        >
          {notice.tone === "error" ? <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {notice.text}
        </div>
      )}
      <Input label="Email" value={email} readOnly disabled hint="Your sign-in email. It cannot be changed here." />
      <Input label="Full name" name="fullName" defaultValue={initialName} maxLength={NAME_MAX} required disabled={busy} autoComplete="name" />
      <div className="space-y-2">
        <p className="text-sm font-medium">Profile picture</p>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- small user-supplied avatar on a public bucket
          <img src={avatarUrl} alt="Your current profile picture" className="size-20 rounded-full border border-border object-cover" />
        ) : (
          <p className="text-sm text-text-secondary">No picture yet.</p>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Upload a new picture
          <input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" disabled={busy} className="text-sm font-normal" />
        </label>
        <p className="text-xs text-text-secondary">PNG, JPEG or WebP, up to 1 MB.</p>
        {avatarUrl && (
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" name="removeAvatar" className="size-4" disabled={busy} />
            Remove my picture
          </label>
        )}
      </div>
      <Button type="submit" loading={busy}>
        Save profile
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setNotice(null);
    setErrors({});
    const result = await changePassword({
      current: String(data.get("current") ?? ""),
      next: String(data.get("next") ?? ""),
      confirm: String(data.get("confirm") ?? ""),
    });
    setBusy(false);
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      setNotice({ tone: "error", text: result.error });
      return;
    }
    form.reset();
    setNotice({ tone: "ok", text: "Your password was changed." });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4" noValidate aria-label="Change password">
      {notice && (
        <div role={notice.tone === "error" ? "alert" : "status"} className={notice.tone === "error" ? "rounded-card border border-danger bg-danger-light p-3 text-sm text-danger-text" : "rounded-card border border-success bg-success-light p-3 text-sm text-success-text"}>
          {notice.text}
        </div>
      )}
      <Input label="Current password" name="current" type="password" autoComplete="current-password" error={errors.current} disabled={busy} />
      <Input label="New password" name="next" type="password" autoComplete="new-password" hint={`At least ${PASSWORD_MIN} characters.`} error={errors.next} disabled={busy} />
      <Input label="Confirm new password" name="confirm" type="password" autoComplete="new-password" error={errors.confirm} disabled={busy} />
      <Button type="submit" loading={busy}>
        Change password
      </Button>
    </form>
  );
}

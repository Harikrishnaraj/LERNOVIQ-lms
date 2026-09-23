import Link from "next/link";
import { PermissionDeniedState } from "@/components/feedback/states";
import { buttonClasses } from "@/components/ui/button";

export const metadata = { title: "Permission denied" };

export default function PermissionDeniedPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-16">
      <PermissionDeniedState
        title="You don't have access to this"
        description="Your account doesn't have permission to view this page. If you think this is a mistake, contact your administrator."
        action={
          <Link href="/" className={buttonClasses()}>
            Go home
          </Link>
        }
      />
    </main>
  );
}

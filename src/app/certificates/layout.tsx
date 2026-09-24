import { PublicHeader } from "@/components/layout/public-header";

export default function CertificatesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        {children}
      </main>
    </>
  );
}

// T-262 (F-961, ADR-042): the catalogue uses the marketing design (Courses.dc.html), Plus Jakarta Sans.
export default function CatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="font-display">
      {children}
    </main>
  );
}

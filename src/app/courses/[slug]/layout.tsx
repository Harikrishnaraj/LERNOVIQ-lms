// Course detail keeps its own app styling inside the site shell.
export default function CourseDetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-8">
      {children}
    </main>
  );
}

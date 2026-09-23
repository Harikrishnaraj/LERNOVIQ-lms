import type { Metadata } from "next";
import { PlaceholderPage, placeholderParams } from "@/components/layout/placeholder-page";
import { findNavItem } from "@/config/navigation";

export const dynamicParams = false;

export function generateStaticParams() {
  return placeholderParams("admin");
}

type Props = { params: Promise<{ section: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { section } = await params;
  return { title: findNavItem("admin", `/admin/${section.join("/")}`)?.label };
}

export default async function AdminSectionPage({ params }: Props) {
  const { section } = await params;
  return <PlaceholderPage portal="admin" href={`/admin/${section.join("/")}`} />;
}

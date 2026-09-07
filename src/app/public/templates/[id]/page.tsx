import type { Metadata } from "next";
import { TemplateDetail, templateMetadata } from "@/components/template-detail";
import { PUBLIC_TEMPLATES_PATH } from "@/lib/template-routes";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return templateMetadata(id);
}

export default async function PublicTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ warnings?: string }>;
}) {
  const { id } = await params;
  const { warnings } = await searchParams;
  return <TemplateDetail id={id} basePath={PUBLIC_TEMPLATES_PATH} warningsParam={warnings} />;
}

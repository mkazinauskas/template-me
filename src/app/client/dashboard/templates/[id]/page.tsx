import type { Metadata } from "next";
import { TemplateDetail, getTemplate } from "@/components/template-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const template = await getTemplate(id);

  return {
    title: template ? template.name : "Template not found",
    description: template
      ? `Fill in "${template.name}" and download it as a PDF.`
      : undefined,
    robots: { index: false, follow: false },
  };
}

export default async function ClientTemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ warnings?: string }>;
}) {
  const { id } = await params;
  const { warnings } = await searchParams;
  return <TemplateDetail id={id} warningsParam={warnings} />;
}

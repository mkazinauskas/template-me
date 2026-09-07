import type { Metadata } from "next";
import { TemplateDetail, templateMetadata } from "@/components/template-detail";
import { CLIENT_TEMPLATES_PATH } from "@/lib/template-routes";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  return templateMetadata(id, "send");
}

export default async function ClientTemplateSendPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TemplateDetail id={id} mode="send" basePath={CLIENT_TEMPLATES_PATH} />;
}

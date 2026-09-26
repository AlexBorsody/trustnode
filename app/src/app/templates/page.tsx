import TemplateDiscovery from "@/packs/TemplateDiscovery";
export default async function TemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  return <TemplateDiscovery initialCategory={typeof params.category === "string" ? params.category.slice(0, 80) : ""} />;
}

import PackWorkspace from "@/packs/PackWorkspace";
export default async function PackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PackWorkspace id={id} />;
}

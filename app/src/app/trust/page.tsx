import TrustWorkspace from "@/trust/TrustWorkspace";
import { UUID } from "@/packs/model";
export default async function TrustPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const id = (key: string) => typeof params[key] === "string" && UUID.test(params[key] as string) ? (params[key] as string).toLowerCase() : undefined;
  return <TrustWorkspace initial={{ pack: id("pack"), version: id("version"), run: id("run") }} />;
}

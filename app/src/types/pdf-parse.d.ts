declare module "pdf-parse/lib/pdf-parse.js" {
  function pdfParse(data: Uint8Array): Promise<{
    text: string;
    numpages: number;
    info: Record<string, unknown>;
  }>;
  export default pdfParse;
}

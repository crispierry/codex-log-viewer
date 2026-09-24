import type { DemoData } from "../types";

// Initialized before App is imported, including its derived summary constants.
export let demoData: DemoData;

export async function initializeDemoData() {
  const response = await fetch(new URL("demo-data.json.gz", document.baseURI));
  if (!response.ok || !response.body) throw new Error("Demo data could not be loaded.");
  const decoded = response.body.pipeThrough(new DecompressionStream("gzip"));
  demoData = await new Response(decoded).json() as DemoData;
}

import { NextResponse } from "next/server";
import { pricedItems } from "@/lib/server/catalog";

export const revalidate = 1800;

/** Items in OpenAI's model-list shape, for SDK model pickers. */
export async function GET() {
  const items = (await pricedItems()).filter((i) => i.status !== "planned" && i.supplier);
  return NextResponse.json({
    object: "list",
    data: items.map((i) => ({ id: i.slug, object: "model", owned_by: i.makerName, created: 0 })),
  });
}

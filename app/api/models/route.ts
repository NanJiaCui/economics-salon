import { modelRadar } from "@/lib/model-radar";
import { apiError } from "@/lib/server";

export async function GET() {
  try {
    return Response.json(await modelRadar(), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

import { modelRadar } from "@/lib/model-radar";
import { apiError } from "@/lib/server";

export async function GET() {
  try {
    return Response.json(await modelRadar(), {
      headers: {
        "Cache-Control": "public, max-age=900, s-maxage=21600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

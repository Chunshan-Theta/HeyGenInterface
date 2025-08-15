export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("[VOISS][INIT][IN]", body);
    const res = await fetch("https://voiss-fq.zeabur.app/api/interactions/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const message = data?.data?.message;
    console.log("[VOISS][INIT][OUT]", { data: { message } });
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[VOISS][INIT][ERR]", e);
    return new Response(
      JSON.stringify({ success: false, error: e?.message || "proxy error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
} 
import OpenAI from "openai";

export async function POST(req: Request) {
  try {
    const apiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Missing NEXT_PUBLIC_OPENAI_API_KEY" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const form = await req.formData();
    const audio = form.get("audio") as File | null;
    const language = (form.get("language") as string | null) || undefined; // e.g., "zh"
    const model = (form.get("model") as string | null) || "gpt-4o-mini-transcribe"; // or "whisper-1"

    if (!audio) {
      return new Response(
        JSON.stringify({ error: "Missing 'audio' file in form-data" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const openai = new OpenAI({ apiKey });

    const result = await openai.audio.transcriptions.create({
      file: audio,
      model,
      language,
      // response_format: "verbose_json", // optionally
      // temperature: 0,
    } as any);

    const text = (result as any)?.text ?? "";

    return new Response(
      JSON.stringify({ text }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    console.error("[STT][ERR]", e);
    return new Response(
      JSON.stringify({ error: e?.message || "transcription error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
} 
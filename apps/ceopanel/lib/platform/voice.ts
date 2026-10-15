import "server-only"
import OpenAI from "openai"
import { agentAccess, type UserContext } from "./policy"
import { capabilities, platformConfig } from "./config"
import { transaction, database } from "./db"
import { ERPNextError } from "../erpnext-client"
import { permittedEvidence } from "./evidence"
export async function voiceSession(
  context: UserContext,
  agent: string,
  sdp: string,
  language: "en" | "ar",
) {
  agentAccess(context, agent)
  if (
    !platformConfig().channels.voice ||
    !capabilities().ai ||
    !process.env.OPENAI_TRANSCRIPTION_MODEL
  )
    throw new ERPNextError("Voice awaits validated model configuration.", 409)
  await reserveVoice(context, "voice.started", agent, 3)
  const form = new FormData()
  form.set("sdp", sdp)
  form.set(
    "session",
    JSON.stringify({
      type: "transcription",
      audio: {
        input: {
          transcription: {
            model: process.env.OPENAI_TRANSCRIPTION_MODEL,
            language,
          },
          noise_reduction: { type: "near_field" },
          turn_detection: { type: "server_vad" },
        },
      },
    }),
  )
  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(20000),
    redirect: "error",
  })
  if (!response.ok)
    throw new ERPNextError("Voice connection could not be established.", 502)
  return { sdp: await response.text() }
}
export async function speakRun(context: UserContext, id: string) {
  if (
    !platformConfig().channels.voice ||
    !capabilities().ai ||
    !process.env.OPENAI_SPEECH_MODEL ||
    !process.env.OPENAI_SPEECH_VOICE
  )
    throw new ERPNextError("Speech output awaits model configuration.", 409)
  const run = (
    await database().query(
      "SELECT id,agent,response,evidence FROM agent_runs WHERE id=$1 AND owner=$2 AND company=$3 AND status='completed'",
      [id, context.user, context.company],
    )
  ).rows[0]
  if (!run) throw new ERPNextError("Conversation not found.", 404)
  agentAccess(context, run.agent)
  if (!(await permittedEvidence(context, [run])).length)
    throw new ERPNextError(
      "Conversation sources are no longer available to your account.",
      403,
    )
  await reserveVoice(context, "voice.spoken", id, 5)
  const result = await new OpenAI().audio.speech.create({
    model: process.env.OPENAI_SPEECH_MODEL,
    voice: process.env.OPENAI_SPEECH_VOICE,
    input: run.response.slice(0, 4000),
    response_format: "mp3",
  })
  return new Response(await result.arrayBuffer(), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
    },
  })
}
async function reserveVoice(
  context: UserContext,
  event: string,
  target: string,
  limit: number,
) {
  await transaction(async (db) => {
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `voice:${context.company}:${context.user}`,
    ])
    const recent = (
      await db.query(
        "SELECT count(*)::int AS count FROM audit_events WHERE actor=$1 AND company=$2 AND event=$3 AND created_at>now()-interval '1 minute'",
        [context.user, context.company, event],
      )
    ).rows[0].count
    if (recent >= limit)
      throw new ERPNextError(
        "Please wait before starting another voice session.",
        429,
      )
    await db.query(
      "INSERT INTO audit_events(actor,company,event,target) VALUES($1,$2,$3,$4)",
      [context.user, context.company, event, target],
    )
  })
}

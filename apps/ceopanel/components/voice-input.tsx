"use client"
import { useEffect, useRef, useState } from "react"
import { Mic, Square } from "lucide-react"
import { Button } from "./ui/button"
import { useLocale } from "./locale-provider"
export function VoiceInput({
  agent,
  company,
  disabled,
  onTranscript,
  onError,
}: {
  agent: string
  company?: string
  disabled: boolean
  onTranscript: (value: string) => void
  onError: (value: string) => void
}) {
  const { locale, t } = useLocale(),
    [recording, setRecording] = useState(false)
  const peer = useRef<RTCPeerConnection | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generation = useRef(0)
  function stop() {
    generation.current++
    peer.current?.close()
    stream.current?.getTracks().forEach((track) => track.stop())
    if (timer.current) clearTimeout(timer.current)
    peer.current = null
    stream.current = null
    setRecording(false)
  }
  useEffect(() => stop, [agent, company])
  async function start() {
    const id = ++generation.current
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (id !== generation.current) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = media
      setRecording(true)
      const connection = new RTCPeerConnection()
      peer.current = connection
      for (const track of media.getTracks()) connection.addTrack(track, media)
      const channel = connection.createDataChannel("oai-events")
      channel.addEventListener("message", (event) => {
        try {
          const message = JSON.parse(event.data)
          if (
            message.type ===
              "conversation.item.input_audio_transcription.completed" &&
            typeof message.transcript === "string"
          ) {
            onTranscript(message.transcript)
            stop()
          } else if (message.type === "error") {
            onError(t("Voice connection could not be established."))
            stop()
          }
        } catch {}
      })
      connection.addEventListener("connectionstatechange", () => {
        if (connection.connectionState === "failed") stop()
      })
      await connection.setLocalDescription(await connection.createOffer())
      const response = await fetch(
        `/api/platform/voice/session${company ? `?company=${encodeURIComponent(company)}` : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agent,
            sdp: connection.localDescription?.sdp,
            language: locale,
          }),
        },
      )
      const body = await response.json()
      if (!response.ok) throw new Error(body.error)
      if (id !== generation.current) return
      await connection.setRemoteDescription({ type: "answer", sdp: body.sdp })
      timer.current = setTimeout(stop, 120000)
    } catch (error) {
      onError((error as Error).message)
      stop()
    }
  }
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled && !recording}
      onClick={() => (recording ? stop() : void start())}
    >
      {recording ? <Square /> : <Mic />}
      {t(recording ? "Stop voice" : "Start voice")}
    </Button>
  )
}
export function ReadAnswer({
  id,
  company,
  disabled,
  onError,
}: {
  id: string
  company?: string
  disabled: boolean
  onError: (value: string) => void
}) {
  const { t } = useLocale(),
    [busy, setBusy] = useState(false),
    audio = useRef<HTMLAudioElement | null>(null),
    url = useRef<string | null>(null)
  useEffect(
    () => () => {
      audio.current?.pause()
      if (url.current) URL.revokeObjectURL(url.current)
    },
    [id, company],
  )
  async function speak() {
    setBusy(true)
    try {
      const response = await fetch(
        `/api/platform/voice/speech${company ? `?company=${encodeURIComponent(company)}` : ""}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        },
      )
      if (!response.ok) throw new Error((await response.json()).error)
      audio.current?.pause()
      if (url.current) URL.revokeObjectURL(url.current)
      url.current = URL.createObjectURL(await response.blob())
      audio.current = new Audio(url.current)
      await audio.current.play()
    } catch (error) {
      onError((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || busy}
        onClick={() => void speak()}
      >
        {t("Read answer aloud")}
      </Button>
      <p className="text-[10px] text-muted-foreground">
        {t("AI-generated voice")}
      </p>
    </div>
  )
}

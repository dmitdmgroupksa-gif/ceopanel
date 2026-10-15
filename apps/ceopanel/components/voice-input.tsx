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
  const request = useRef<AbortController | null>(null)
  const starting = useRef(false)
  const [connecting, setConnecting] = useState(false)
  function stop() {
    generation.current++
    request.current?.abort()
    request.current = null
    starting.current = false
    setConnecting(false)
    peer.current?.close()
    stream.current?.getTracks().forEach((track) => track.stop())
    if (timer.current) clearTimeout(timer.current)
    peer.current = null
    stream.current = null
    setRecording(false)
  }
  useEffect(() => stop, [agent, company, locale, disabled])
  async function start() {
    if (starting.current || recording || disabled) return
    starting.current = true
    setConnecting(true)
    const id = ++generation.current
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (id !== generation.current) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = media
      setConnecting(false)
      setRecording(true)
      timer.current = setTimeout(stop, 120000)
      const connection = new RTCPeerConnection()
      peer.current = connection
      for (const track of media.getTracks()) connection.addTrack(track, media)
      const channel = connection.createDataChannel("oai-events")
      channel.addEventListener("message", (event) => {
        if (id !== generation.current) return
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
        if (
          id === generation.current &&
          connection.connectionState === "failed"
        ) {
          onError(t("Voice connection could not be established."))
          stop()
        }
      })
      await connection.setLocalDescription(await connection.createOffer())
      if (id !== generation.current) return
      const abort = new AbortController()
      request.current = abort
      const response = await fetch(
        `/api/platform/voice/session${company ? `?company=${encodeURIComponent(company)}` : ""}`,
        {
          method: "POST",
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(25000)]),
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
    } catch (error) {
      if (id !== generation.current) return
      onError((error as Error).message)
      stop()
    }
  }
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled && !recording && !connecting}
      onClick={() => (recording || connecting ? stop() : void start())}
    >
      {recording || connecting ? <Square /> : <Mic />}
      {t(recording || connecting ? "Stop voice" : "Start voice")}
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
    [playing, setPlaying] = useState(false),
    audio = useRef<HTMLAudioElement | null>(null),
    url = useRef<string | null>(null)
  const generation = useRef(0)
  const request = useRef<AbortController | null>(null)
  useEffect(
    () => () => {
      generation.current++
      request.current?.abort()
      audio.current?.pause()
      if (url.current) URL.revokeObjectURL(url.current)
      audio.current = null
      url.current = null
      setBusy(false)
      setPlaying(false)
    },
    [id, company, disabled],
  )
  async function speak() {
    const token = ++generation.current
    request.current?.abort()
    const abort = new AbortController()
    request.current = abort
    setBusy(true)
    try {
      const response = await fetch(
        `/api/platform/voice/speech${company ? `?company=${encodeURIComponent(company)}` : ""}`,
        {
          method: "POST",
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(60000)]),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        },
      )
      if (!response.ok) throw new Error((await response.json()).error)
      const blob = await response.blob()
      if (token !== generation.current) return
      audio.current?.pause()
      if (url.current) URL.revokeObjectURL(url.current)
      url.current = URL.createObjectURL(blob)
      audio.current = new Audio(url.current)
      audio.current.addEventListener("ended", () => {
        if (token === generation.current) setPlaying(false)
      })
      await audio.current.play()
      if (token === generation.current) setPlaying(true)
    } catch (error) {
      if (token === generation.current) onError((error as Error).message)
    } finally {
      if (token === generation.current) setBusy(false)
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
      {playing && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            audio.current?.pause()
            setPlaying(false)
          }}
        >
          <Square />
          {t("Stop voice")}
        </Button>
      )}
      <p className="text-[10px] text-muted-foreground">
        {t("AI-generated voice")}
      </p>
    </div>
  )
}

import {
	AvatarQuality,
	StreamingEvents,
	VoiceChatTransport,
	VoiceEmotion,
	StartAvatarRequest,
	STTProvider,
	ElevenLabsModel,
} from "@heygen/streaming-avatar";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMemoizedFn, useUnmount } from "ahooks";
import { useSearchParams } from "next/navigation";

import { Button } from "./Button";
import { AvatarConfig } from "./AvatarConfig";
import { AvatarVideo } from "./AvatarSession/AvatarVideo";
import { useStreamingAvatarSession } from "./logic/useStreamingAvatarSession";
import { AvatarControls } from "./AvatarSession/AvatarControls";
import { useVoiceChat } from "./logic/useVoiceChat";
import { StreamingAvatarProvider, StreamingAvatarSessionState } from "./logic";
import { LoadingIcon } from "./Icons";
import { MessageHistory } from "./AvatarSession/MessageHistory";
import { useTextChat } from "./logic/useTextChat";

import { AVATARS } from "@/app/lib/constants";

// Explicit defaults to satisfy types
const DEFAULT_LANGUAGE = "zh";
const DEFAULT_AVATAR_NAME = 'June_HR_public';
const DEFAULT_VOICE_RATE = 1.0;
const DEFAULT_VOICE_EMOTION = VoiceEmotion.SOOTHING as VoiceEmotion;
const DEFAULT_VOICE_MODEL = ElevenLabsModel.eleven_flash_v2_5 as ElevenLabsModel;
const DEFAULT_VOICE_ID = 'aa73aedf00974150944a4bb19225f66e';

const DEFAULT_CONFIG: StartAvatarRequest = {
	quality: AvatarQuality.Low,
	avatarName: DEFAULT_AVATAR_NAME,
	knowledgeId: undefined,
	voice: {
		rate: DEFAULT_VOICE_RATE,
		emotion: DEFAULT_VOICE_EMOTION,
		model: DEFAULT_VOICE_MODEL,
		voiceId: DEFAULT_VOICE_ID
	},
	language: DEFAULT_LANGUAGE,
	voiceChatTransport: VoiceChatTransport.WEBSOCKET,
	sttSettings: {
		provider: STTProvider.DEEPGRAM,
	},
};


// External VOISS API configuration defaults
const VOISS_BASE = "/api/voiss";
const VOISS_ACTIVITY_ID = "689466a637ae3065c9329e08";
const VOISS_SESSION_ID = `session-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
const VOISS_USER_ID = "demo-user";
const VOISS_USER_NAME = "Demo";

function InteractiveAvatar() {
	const { initAvatar, startAvatar, stopAvatar, sessionState, stream } =
		useStreamingAvatarSession();
	const { startVoiceChat } = useVoiceChat();
	const { repeatMessage } = useTextChat();

	const searchParams = useSearchParams();

	// Parse URL params
	const urlParams = useMemo(() => {
		const get = (k: string) => searchParams.get(k) || undefined;
		const toBool = (v?: string) => (v ? ["1", "true", "yes", "on"].includes(v.toLowerCase()) : false);
		const toNum = (v?: string) => {
			if (!v) return undefined;
			const n = Number(v);
			return Number.isFinite(n) ? n : undefined;
		};
		const mapEmotion = (v?: string) => {
			if (!v) return undefined;
			const key = v.toUpperCase();
			if ((VoiceEmotion as any)[key] !== undefined) return (VoiceEmotion as any)[key] as VoiceEmotion;
			return undefined;
		};
		const mapModel = (v?: string) => {
			if (!v) return undefined;
			const key = v as keyof typeof ElevenLabsModel;
			if (key in ElevenLabsModel) return ElevenLabsModel[key];
			const entry = Object.entries(ElevenLabsModel).find(([, val]) => val === v);
			return entry ? (entry[1] as ElevenLabsModel) : undefined;
		};
		const mapSttProvider = (v?: string) => {
			if (!v) return undefined;
			const key = v.toUpperCase();
			if ((STTProvider as any)[key] !== undefined) return (STTProvider as any)[key] as STTProvider;
			return undefined;
		};

		const activityId = get("activity_id") ?? VOISS_ACTIVITY_ID;
		const sessionId = get("session_id") ?? VOISS_SESSION_ID;
		const userId = get("user_id") ?? VOISS_USER_ID;
		const userName = get("user_name") ?? VOISS_USER_NAME;

		const language = get("language") ?? DEFAULT_LANGUAGE;
		const avatarName = get("avatar_id") ?? DEFAULT_AVATAR_NAME;
		const voiceRate = toNum(get("voice_rate")) ?? DEFAULT_VOICE_RATE;
		const voiceEmotion = mapEmotion(get("voice_emotion")) ?? DEFAULT_VOICE_EMOTION;
		const voiceId =  DEFAULT_VOICE_ID;
		const voiceModel = mapModel(get("voice_model")) ?? DEFAULT_VOICE_MODEL;
		const sttProvider = mapSttProvider(get("stt_provider")) ?? STTProvider.DEEPGRAM;

		const autoStart = toBool(get("autostart"));

		return {
			activityId,
			sessionId,
			userId,
			userName,
			language,
			avatarName,
			voiceRate,
			voiceEmotion,
			voiceId,
			voiceModel,
			sttProvider,
			autoStart,
		};
	}, [searchParams]);

	const [config, setConfig] = useState<StartAvatarRequest>(() => ({
		...DEFAULT_CONFIG,
		language: urlParams.language,
		avatarName: urlParams.avatarName,
		voice: {
			rate: urlParams.voiceRate,
			emotion: urlParams.voiceEmotion,
			model: urlParams.voiceModel,	
			voiceId: urlParams.voiceId,
		},
		sttSettings: {
			provider: urlParams.sttProvider,
		},
	}));

	const mediaStream = useRef<HTMLVideoElement>(null);

	// Track if VOISS session is initialized and accumulate current user utterance
	const isVoissInitializedRef = useRef(false);
	const userUtteranceRef = useRef("");
	// Recording state
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const audioChunksRef = useRef<BlobPart[]>([]);
	const [isRecording, setIsRecording] = useState(false);

	async function fetchAccessToken() {
		try {
			const response = await fetch("/api/get-access-token", {
				method: "POST",
			});
			const token = await response.text();

			console.log("Access Token:", token);

			return token;
		} catch (error) {
			console.error("Error fetching access token:", error);
			throw error;
		}
	}

	const initializeVoiss = useMemoizedFn(async () => {
		if (isVoissInitializedRef.current) return undefined;
		const res = await fetch(`${VOISS_BASE}/initialize`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				activity_id: urlParams.activityId,
				session_id: urlParams.sessionId,
				user_id: urlParams.userId,
				user_name: urlParams.userName,
			}),
		});
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`VOISS init failed: ${res.status} ${text}`);
		}
		const json = (await res.json().catch(() => null as any)) as any;
		const dataRoot = json?.data;
		let message: string | undefined;
		try {
			const unitResults = dataRoot?.unit_results;
			if (Array.isArray(unitResults) && unitResults.length > 0) {
				const lastUnit = unitResults[unitResults.length - 1];
				const logs = lastUnit?.conversation_logs;
				if (Array.isArray(logs) && logs.length > 0) {
					const lastLog = logs[logs.length - 1];
					if (lastLog && typeof lastLog.content === "string") {
						message = lastLog.content;
					}
				}
			}
			if (!message && typeof dataRoot?.message === "string") {
				message = dataRoot.message;
			}
		} catch {}
		isVoissInitializedRef.current = true;
		return message;
	});

	const chatVoiss = useMemoizedFn(async (message: string) => {
		const res = await fetch(`${VOISS_BASE}/chat`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				activity_id: urlParams.activityId,
				session_id: urlParams.sessionId,
				user_id: urlParams.userId,
				message,
			}),
		});
		if (!res.ok) {
			const text = await res.text().catch(() => "");
			throw new Error(`VOISS chat failed: ${res.status} ${text}`);
		}
		const json = (await res.json().catch(() => null as any)) as any;
		return json?.data?.message as string | undefined;
	});

	// Accept external text (e.g., from your OpenAI STT) and run VOISS -> avatar repeat
	const submitUserText = useMemoizedFn(async (text: string) => {
		const finalText = (text || "").trim();
		if (!finalText) return;
		try {
			const reply = await chatVoiss(finalText);
			if (reply) {
				repeatMessage(reply);
			}
		} catch (err) {
			console.error("VOISS pipeline error:", err);
		}
	});

	// Expose a global hook for your STT pipeline to call
	useEffect(() => {
		// window.voissSubmit("你好"); // example
		(Object(window) as any).voissSubmit = submitUserText;
		return () => {
			try {
				delete (Object(window) as any).voissSubmit;
			} catch {}
		};
	}, [submitUserText]);

	// Minimal STT client: record -> transcribe -> submit
	const sendAudioBlobToSTT = useMemoizedFn(async (audioBlob: Blob) => {
		const form = new FormData();
		form.append("audio", audioBlob, "audio.webm");
		if (config.language) form.append("language", config.language);
		// form.append("model", "gpt-4o-mini-transcribe"); // optional override

		const res = await fetch("/api/stt/transcribe", { method: "POST", body: form });
		if (!res.ok) throw new Error(await res.text());
		const { text } = (await res.json()) as { text: string };
		return text;
	});

	const startRecording = useMemoizedFn(async () => {
		if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") return;
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		const mimeType = (window as any).MediaRecorder?.isTypeSupported?.("audio/webm;codecs=opus")
			? "audio/webm;codecs=opus"
			: undefined;
		const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
		audioChunksRef.current = [];
		mr.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
		};
		mr.onstop = async () => {
			const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
			try {
				const text = await sendAudioBlobToSTT(blob);
				if (text) (Object(window) as any).voissSubmit?.(text);
			} catch (e) {
				console.error("[STT] submit error", e);
			} finally {
				stream.getTracks().forEach((t) => t.stop());
			}
		};
		mr.start();
		mediaRecorderRef.current = mr;
		setIsRecording(true);
	});

	const stopRecordingAndSubmit = useMemoizedFn(() => {
		const mr = mediaRecorderRef.current;
		if (!mr) return;
		try {
			mr.stop();
		} finally {
			mediaRecorderRef.current = null;
			setIsRecording(false);
		}
	});

	const startSessionV2 = useMemoizedFn(async (isVoiceChat: boolean) => {
		try {
			const newToken = await fetchAccessToken();
			const avatar = initAvatar(newToken);

			avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
				console.log("Stream disconnected");
			});
			avatar.on(StreamingEvents.STREAM_READY, async (event) => {
				console.log(">>>>> Stream ready:", event.detail);
				try {
					const initMsg = await initializeVoiss();

					if (initMsg && initMsg.trim()) {
						repeatMessage(initMsg);
					}
				} catch (e) {
					console.error("VOISS init speak error:", e);
				}
			});
			avatar.on(StreamingEvents.USER_START, (event) => {
				console.log(">>>>> User started talking:", event);
			});
			avatar.on(StreamingEvents.USER_STOP, (event) => {
				console.log(">>>>> User stopped talking:", event);
			});
			avatar.on(StreamingEvents.USER_END_MESSAGE, async (event) => {
				console.log(">>>>> User end message:", event);
				const finalText = userUtteranceRef.current.trim();
				userUtteranceRef.current = "";
				if (!finalText) return;
				try {
					await initializeVoiss();
					const reply = await chatVoiss(finalText);
					if (reply) {
						repeatMessage(reply);
					}
				} catch (err) {
					console.error("VOISS pipeline error:", err);
				}
			});
			avatar.on(StreamingEvents.USER_TALKING_MESSAGE, (event) => {
				console.log(">>>>> User talking message:", event);
				try {
					const chunk = (event as any)?.detail?.message ?? "";
					if (chunk) userUtteranceRef.current += chunk;
				} catch {}
			});

			await startAvatar(config);

			if (isVoiceChat) {
				await startVoiceChat();
			}
		} catch (error) {
			console.error("Error starting avatar session:", error);
		}
	});

	useEffect(() => {
		if (urlParams.autoStart && sessionState === StreamingAvatarSessionState.INACTIVE) {
			startSessionV2(false);
		}
	}, [urlParams.autoStart, sessionState, startSessionV2]);

	useUnmount(() => {
		stopAvatar();
	});

	useEffect(() => {
		if (stream && mediaStream.current) {
			mediaStream.current.srcObject = stream;
			mediaStream.current.onloadedmetadata = () => {
				mediaStream.current!.play();
			};
		}
	}, [mediaStream, stream]);

	return (
		<div className="w-full flex flex-col gap-4">
			<div className="flex flex-col rounded-xl bg-zinc-900 overflow-hidden">
				<span style={{ color: 'gray' }}>session id: {urlParams.sessionId}</span>
				<div className="relative w-full aspect-video overflow-hidden flex flex-col items-center justify-center">
					{sessionState !== StreamingAvatarSessionState.INACTIVE ? (
						<AvatarVideo ref={mediaStream} />
					) : (
						<AvatarConfig config={config} onConfigChange={setConfig} />
					)}
				</div>
				<div className="flex flex-col gap-3 items-center justify-center p-4 border-t border-zinc-700 w-full">
					{sessionState === StreamingAvatarSessionState.CONNECTED ? (
						// <AvatarControls />
            <></>
					) : sessionState === StreamingAvatarSessionState.INACTIVE ? (
						<div className="flex flex-row gap-4">
							<Button onClick={() => startSessionV2(false)}>
								Start Repeat Session
							</Button>
						</div>
					) : (
						<LoadingIcon />
					)}
					{sessionState === StreamingAvatarSessionState.CONNECTED && (
						<div className="flex flex-row gap-3">
							<Button onClick={startRecording} disabled={isRecording}>
								Record
							</Button>
							<Button onClick={stopRecordingAndSubmit} disabled={!isRecording}>
								Stop + Send
							</Button>
						</div>
					)}
				</div>
			</div>
			{/* {sessionState === StreamingAvatarSessionState.CONNECTED && (
				<MessageHistory />
			)} */}
		</div>
	);
}

export default function InteractiveAvatarWrapper() {
	return (
		<StreamingAvatarProvider basePath={process.env.NEXT_PUBLIC_BASE_API_URL}>
			<InteractiveAvatar />
		</StreamingAvatarProvider>
	);
}

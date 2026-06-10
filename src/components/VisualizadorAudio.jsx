import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Mic, Pause } from "lucide-react";

const SILENCE_TIMEOUT_MS = 2000;

const VisualizadorAudio = forwardRef(function VisualizadorAudio(
    {
        transcriptSeed = "",
        resetSignal = 0,
        onLiveTranscriptChange,
        onListeningChange,
        language = "es-ES",
    },
    ref
) {
    const canvasRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const sourceRef = useRef(null);
    const streamRef = useRef(null);
    const animationRef = useRef(null);

    const recognitionRef = useRef(null);
    const recognitionRunningRef = useRef(false);
    const silenceTimerRef = useRef(null);

    const isActiveRef = useRef(false);
    const transcriptSeedRef = useRef(transcriptSeed);
    const finalTranscriptRef = useRef(transcriptSeed);

    const onLiveTranscriptChangeRef = useRef(onLiveTranscriptChange);

    const [isActive, setIsActive] = useState(false);
    const [error, setError] = useState("");

    useImperativeHandle(ref, () => ({
        start: () => {
            if (!isActiveRef.current) {
                startAudio();
            }
        },
        pause: () => {
            if (isActiveRef.current) {
                stopAudio();
            }
        },
        toggle: () => {
            toggleAudio();
        },
    }));

    useEffect(() => {
        transcriptSeedRef.current = transcriptSeed;

        if (!isActiveRef.current) {
            finalTranscriptRef.current = transcriptSeed;
        }
    }, [transcriptSeed]);

    useEffect(() => {
        finalTranscriptRef.current = "";
        transcriptSeedRef.current = "";
        onLiveTranscriptChangeRef.current?.("");
    }, [resetSignal]);

    useEffect(() => {
        onLiveTranscriptChangeRef.current = onLiveTranscriptChange;
    }, [onLiveTranscriptChange]);

    useEffect(() => {
        isActiveRef.current = isActive;
        onListeningChange?.(isActive);
    }, [isActive, onListeningChange]);

    const getSpeechRecognitionConstructor = () => {
        return window.SpeechRecognition || window.webkitSpeechRecognition;
    };

    const clearSilenceTimer = () => {
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }
    };

    const normalizeText = (text) => {
        return text.replace(/\s+/g, " ").trim();
    };

    const updateLiveTranscript = (interimTranscript = "") => {
        const liveText = normalizeText(
            `${finalTranscriptRef.current} ${interimTranscript}`
        );

        onLiveTranscriptChangeRef.current?.(liveText);
    };

    const resizeCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const stopSpeechRecognition = () => {
        clearSilenceTimer();

        const recognition = recognitionRef.current;

        if (recognition) {
            recognition.onstart = null;
            recognition.onresult = null;
            recognition.onerror = null;
            recognition.onend = null;

            try {
                if (recognitionRunningRef.current) {
                    recognition.stop();
                }
            } catch {
                // Ya estaba detenido.
            }
        }

        recognitionRef.current = null;
        recognitionRunningRef.current = false;
    };

    const stopAudio = () => {
        updateLiveTranscript("");
        clearSilenceTimer();
        stopSpeechRecognition();

        if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
        }

        if (sourceRef.current) {
            sourceRef.current.disconnect();
        }

        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
        }

        if (
            audioContextRef.current &&
            audioContextRef.current.state !== "closed"
        ) {
            audioContextRef.current.close().catch(() => { });
        }

        streamRef.current = null;
        sourceRef.current = null;
        analyserRef.current = null;
        audioContextRef.current = null;

        isActiveRef.current = false;
        setIsActive(false);
    };

    const scheduleSilencePause = () => {
        clearSilenceTimer();

        silenceTimerRef.current = setTimeout(() => {
            if (isActiveRef.current) {
                stopAudio();
            }
        }, SILENCE_TIMEOUT_MS);
    };

    const startSpeechRecognition = () => {
        const SpeechRecognition = getSpeechRecognitionConstructor();

        if (!SpeechRecognition) {
            throw new Error(
                "Este navegador no soporta SpeechRecognition/webkitSpeechRecognition. Prueba con Chrome o Edge."
            );
        }

        const recognition = new SpeechRecognition();

        recognition.lang = language;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        finalTranscriptRef.current = normalizeText(transcriptSeedRef.current);
        updateLiveTranscript("");

        recognition.onstart = () => {
            recognitionRunningRef.current = true;
            scheduleSilencePause();
        };

        recognition.onresult = (event) => {
            let interimTranscript = "";

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;

                if (event.results[i].isFinal) {
                    finalTranscriptRef.current = normalizeText(
                        `${finalTranscriptRef.current} ${transcript}`
                    );
                } else {
                    interimTranscript += transcript;
                }
            }

            updateLiveTranscript(interimTranscript);
            scheduleSilencePause();
        };

        recognition.onerror = (event) => {
            console.error("SpeechRecognition error:", event.error, event.message);

            if (event.error === "no-speech" || event.error === "aborted") return;

            if (event.error === "network") {
                setError("Error de red. Puedes reanudar la grabación después.");
                stopAudio();
                return;
            }

            if (event.error === "not-allowed") {
                setError("Permiso de micrófono denegado.");
                stopAudio();
                return;
            }

            if (event.error === "audio-capture") {
                setError("El navegador no puede capturar audio.");
                stopAudio();
                return;
            }

            setError(`Error de transcripción: ${event.error}`);
            stopAudio();
        };

        recognition.onend = () => {
            recognitionRunningRef.current = false;
        };

        recognitionRef.current = recognition;
        recognition.start();
    };

    const drawWave = () => {
        const canvas = canvasRef.current;
        const analyser = analyserRef.current;

        if (!canvas || !analyser) return;

        const ctx = canvas.getContext("2d");
        const bufferLength = analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);

        const render = () => {
            const currentCanvas = canvasRef.current;
            const currentAnalyser = analyserRef.current;

            if (!currentCanvas || !currentAnalyser) return;

            animationRef.current = requestAnimationFrame(render);

            const width = currentCanvas.clientWidth;
            const height = currentCanvas.clientHeight;

            currentAnalyser.getByteTimeDomainData(dataArray);

            ctx.clearRect(0, 0, width, height);

            const gradient = ctx.createLinearGradient(0, 0, width, 0);
            gradient.addColorStop(0, "#22d3ee");
            gradient.addColorStop(0.5, "#a855f7");
            gradient.addColorStop(1, "#14f195");

            ctx.fillStyle = "rgba(15, 23, 42, 0.72)";
            ctx.fillRect(0, 0, width, height);

            ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
            ctx.lineWidth = 1;

            for (let y = 0; y < height; y += 18) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }

            let maxAmp = 0;
            for (let i = 0; i < bufferLength; i++) {
                const amp = Math.abs((dataArray[i] - 128) / 128);
                if (amp > maxAmp) maxAmp = amp;
            }

            const glow = Math.min(18, 5 + maxAmp * 42);

            ctx.beginPath();
            ctx.lineWidth = 3.5;
            ctx.strokeStyle = gradient;
            ctx.shadowColor = "#22d3ee";
            ctx.shadowBlur = glow;

            const sliceWidth = width / bufferLength;
            const centerY = height / 2;

            let prevX = 0;
            let prevY = centerY + ((dataArray[0] - 128) / 128) * height * 0.28;
            ctx.moveTo(prevX, prevY);

            for (let i = 1; i < bufferLength; i++) {
                const normalized = (dataArray[i] - 128) / 128;
                const y = centerY + normalized * height * 0.28;
                const x = i * sliceWidth;

                const xc = (prevX + x) / 2;
                const yc = (prevY + y) / 2;

                ctx.quadraticCurveTo(prevX, prevY, xc, yc);

                prevX = x;
                prevY = y;
            }

            ctx.lineTo(prevX, prevY);
            ctx.stroke();

            ctx.shadowBlur = 0;

            ctx.fillStyle = "rgba(34, 211, 238, 0.88)";
            ctx.font = "12px system-ui";
            ctx.fillText(isActiveRef.current ? "Grabando" : "En espera", 14, 20);
        };

        render();
    };

    const startAudio = async () => {
        try {
            setError("");

            const SpeechRecognition = getSpeechRecognitionConstructor();

            if (!SpeechRecognition) {
                setError("Tu navegador no soporta transcripción nativa.");
                return;
            }

            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
            });

            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const audioContext = new AudioContext();

            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            analyser.smoothingTimeConstant = 0.85;

            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            streamRef.current = stream;
            audioContextRef.current = audioContext;
            analyserRef.current = analyser;
            sourceRef.current = source;

            isActiveRef.current = true;
            setIsActive(true);

            startSpeechRecognition();
            drawWave();
        } catch (err) {
            console.error(err);
            setError(err.message || "No se pudo acceder al micrófono.");
            stopAudio();
        }
    };

    const toggleAudio = () => {
        if (isActiveRef.current) {
            stopAudio();
        } else {
            startAudio();
        }
    };

    useEffect(() => {
        resizeCanvas();

        const observer = new ResizeObserver(resizeCanvas);

        if (canvasRef.current) {
            observer.observe(canvasRef.current);
        }

        return () => {
            observer.disconnect();
            stopAudio();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const hasDraft = transcriptSeed.trim().length > 0;

    return (
        <section className="rounded-2xl border border-cyan-400/20 bg-slate-950/80 p-3 shadow-xl shadow-cyan-500/10">
            <div className="relative h-[92px] overflow-hidden rounded-2xl border border-slate-700 bg-slate-900">
                <canvas ref={canvasRef} className="h-full w-full" />

                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                    <button
                        type="button"
                        onClick={toggleAudio}
                        className={`flex h-16 w-16 items-center justify-center rounded-full transition ${isActive
                                ? "border border-rose-400/40 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                                : "bg-cyan-400 text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.42)] hover:bg-cyan-300"
                            }`}
                        title={isActive ? "Pausar grabación" : "Iniciar grabación"}
                    >
                        {isActive ? <Pause size={24} /> : <Mic size={24} />}
                    </button>
                </div>
            </div>

            {hasDraft && !isActive && (
                <p className="mt-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200">
                    Grabación pausada. Puedes reanudarla.
                </p>
            )}

            {error && <p className="mt-2 text-xs text-rose-400">{error}</p>}
        </section>
    );
});

export default VisualizadorAudio;
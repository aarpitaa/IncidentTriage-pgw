import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Mic, MicOff, Square, Play, Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface VoiceRecorderProps {
  onTranscriptionComplete: (transcript: string) => void;
  onClose: () => void;
}

interface TranscriptionResponse {
  transcript: string;
  confidence?: number;
  segments?: any[];
  mode: 'openai' | 'dummy';
}

// Client-side PII sanitization
function sanitizePII(text: string): string {
  let sanitized = text;
  
  // Email addresses
  sanitized = sanitized.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (match) => {
    const parts = match.split('@');
    if (parts.length === 2) {
      const [user, domain] = parts;
      const domainParts = domain.split('.');
      return `${user[0]}***@***.${domainParts[domainParts.length - 1]}`;
    }
    return match;
  });
  
  // Phone numbers (10-11 digits)
  sanitized = sanitized.replace(/\b(?:\+?1[\s-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g, '(***) ***-****');
  
  // House numbers (3-5 digits at start of address)
  sanitized = sanitized.replace(/\b(\d{3,5})\s+([A-Za-z])/g, (match, digits, rest) => {
    return `${'*'.repeat(digits.length)} ${rest}`;
  });
  
  return sanitized;
}

export default function VoiceRecorder({ onTranscriptionComplete, onClose }: VoiceRecorderProps) {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState("");
  const [originalTranscript, setOriginalTranscript] = useState("");
  const [confidence, setConfidence] = useState<number | null>(null);
  const [mode, setMode] = useState<'openai' | 'dummy'>('dummy');
  const [sanitizePii, setSanitizePii] = useState(true);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [fileSize, setFileSize] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const timerRef = useRef<NodeJS.Timeout>();

  const transcribeMutation = useMutation({
    mutationFn: async (audioFile: Blob) => {
      const formData = new FormData();
      formData.append('file', audioFile, 'recording.webm');
      
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to transcribe audio');
      }
      
      return response.json() as Promise<TranscriptionResponse>;
    },
    onSuccess: (data) => {
      setOriginalTranscript(data.transcript);
      setTranscript(sanitizePii ? sanitizePII(data.transcript) : data.transcript);
      setConfidence(data.confidence || null);
      setMode(data.mode);
      toast({
        title: "Transcription Complete",
        description: `Audio transcribed successfully using ${data.mode === 'openai' ? 'OpenAI Whisper' : 'Dummy AI'}`,
      });
    },
    onError: (error) => {
      console.error("Transcription error:", error);
      toast({
        title: "Transcription Failed",
        description: error instanceof Error ? error.message : "Failed to transcribe audio",
        variant: "destructive",
      });
    },
  });

  // Audio visualization
  const drawWaveform = useCallback(() => {
    if (!analyserRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    analyser.getByteFrequencyData(dataArray);

    // Calculate audio level (RMS)
    const rms = Math.sqrt(dataArray.reduce((sum, value) => sum + value * value, 0) / bufferLength);
    setAudioLevel(Math.min(100, Math.round((rms / 128) * 100)));

    // Clear canvas
    ctx.fillStyle = 'rgb(15, 23, 42)'; // Dark background
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw waveform
    const barWidth = (canvas.width / bufferLength) * 2.5;
    let barHeight;
    let x = 0;

    ctx.fillStyle = 'rgb(34, 197, 94)'; // Green bars
    for (let i = 0; i < bufferLength; i++) {
      barHeight = (dataArray[i] / 255) * canvas.height;
      
      const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
      gradient.addColorStop(0, 'rgb(34, 197, 94)');
      gradient.addColorStop(1, 'rgb(22, 163, 74)');
      ctx.fillStyle = gradient;

      ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
      x += barWidth + 1;
    }

    if (isRecording) {
      animationFrameRef.current = requestAnimationFrame(drawWaveform);
    }
  }, [isRecording]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      streamRef.current = stream;

      // Set up audio analysis
      audioContextRef.current = new AudioContext();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Set up media recorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      mediaRecorderRef.current = mediaRecorder;

      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
        setFileSize(blob.size);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      // Start visualization
      drawWaveform();

      toast({
        title: "Recording Started",
        description: "Speak clearly into your microphone",
      });

    } catch (error) {
      console.error("Error starting recording:", error);
      toast({
        title: "Recording Error",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);

      // Clean up
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }

      toast({
        title: "Recording Stopped",
        description: "Click Transcribe to convert speech to text",
      });
    }
  };

  const handleTranscribe = () => {
    if (audioBlob) {
      transcribeMutation.mutate(audioBlob);
    }
  };

  const handleSanitizeToggle = (checked: boolean) => {
    setSanitizePii(checked);
    if (originalTranscript) {
      setTranscript(checked ? sanitizePII(originalTranscript) : originalTranscript);
    }
  };

  const handleUseTranscript = () => {
    if (transcript.trim()) {
      onTranscriptionComplete(transcript);
      onClose();
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number) => {
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Voice Recording</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          ✕
        </Button>
      </div>

      {/* Recording Controls */}
      <div className="flex items-center gap-4">
        <Button
          onClick={isRecording ? stopRecording : startRecording}
          variant={isRecording ? "destructive" : "default"}
          size="lg"
          className="flex items-center gap-2"
        >
          {isRecording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          {isRecording ? "Stop Recording" : "Start Recording"}
        </Button>

        {audioBlob && (
          <Button
            onClick={handleTranscribe}
            disabled={transcribeMutation.isPending}
            className="flex items-center gap-2"
          >
            {transcribeMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            Transcribe
          </Button>
        )}
      </div>

      {/* Recording Status */}
      {(isRecording || audioBlob) && (
        <div className="space-y-2">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Time: {formatTime(recordingTime)}</span>
            {fileSize > 0 && <span>Size: {formatFileSize(fileSize)}</span>}
            {isRecording && (
              <div className="flex items-center gap-2">
                <span>Level:</span>
                <Progress value={audioLevel} className="w-20 h-2" />
                <span>{audioLevel}%</span>
              </div>
            )}
          </div>

          {/* Waveform Canvas */}
          <canvas
            ref={canvasRef}
            width={400}
            height={60}
            className="w-full h-15 border rounded bg-slate-900"
          />
        </div>
      )}

      {/* Transcription Results */}
      {transcript && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h4 className="font-medium">Transcription:</h4>
            {confidence !== null && (
              <Badge variant="secondary">
                Quality: {confidence}%
              </Badge>
            )}
            <Badge variant={mode === 'openai' ? 'default' : 'secondary'}>
              {mode === 'openai' ? 'OpenAI Whisper' : 'Demo Mode'}
            </Badge>
          </div>

          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Transcribed text will appear here..."
            className="min-h-[120px]"
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sanitize"
                checked={sanitizePii}
                onCheckedChange={handleSanitizeToggle}
              />
              <label htmlFor="sanitize" className="text-sm font-medium">
                Sanitize PII (emails, phone numbers, addresses)
              </label>
            </div>

            <Button onClick={handleUseTranscript} className="ml-4">
              Use This Transcript
            </Button>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
        <strong>Tips:</strong> Speak clearly and close to your microphone. Keep background noise to a minimum for best transcription quality.
      </div>
    </div>
  );
}
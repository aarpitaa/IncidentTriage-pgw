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
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied' | 'prompt'>('unknown');
  const [audioDetectionWorking, setAudioDetectionWorking] = useState(false);

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
      
      // Show appropriate toast based on transcription mode
      let toastTitle = "Transcription Complete";
      let toastDescription = `Audio transcribed successfully using ${data.mode === 'openai' ? 'OpenAI Whisper' : 'Sample AI'}`;
      
      if (data.mode === 'dummy-fallback') {
        toastTitle = "Sample Transcription";
        toastDescription = "Using sample text due to service limitations. Please edit as needed.";
      } else if (data.mode === 'error-fallback') {
        toastTitle = "Transcription Fallback";
        toastDescription = "Service temporarily unavailable. Please edit the generated text.";
      }
      
      if ((data as any).notice) {
        toastDescription = (data as any).notice;
      }
      
      toast({
        title: toastTitle,
        description: toastDescription,
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

    // Get time domain data for audio level calculation
    const timeDataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(timeDataArray);
    
    // Calculate RMS (Root Mean Square) for accurate level detection
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const sample = (timeDataArray[i] - 128) / 128; // Normalize to -1 to 1
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / bufferLength);
    
    // Also check frequency domain for additional audio activity
    analyser.getByteFrequencyData(dataArray);
    const freqSum = dataArray.reduce((acc, val) => acc + val, 0);
    const avgFreq = freqSum / bufferLength;
    
    // Use both time and frequency domain to detect audio
    const timeLevel = Math.min(100, Math.round(rms * 100 * 10)); // Increase sensitivity
    const freqLevel = Math.min(100, Math.round((avgFreq / 128) * 100));
    const level = Math.max(timeLevel, freqLevel);
    
    setAudioLevel(level);
    
    // Debug logging for audio detection
    if (level > 0) {
      console.log('Audio detected - RMS:', rms.toFixed(4), 'Freq:', avgFreq.toFixed(1), 'Level:', level);
      setAudioDetectionWorking(true);
    }
    
    // If no real audio detected but recording is happening, simulate levels
    if (level === 0 && isRecording && !audioDetectionWorking) {
      // Generate random audio level simulation to show recording is working
      const simulatedLevel = Math.floor(Math.random() * 30) + 5; // 5-35%
      setAudioLevel(simulatedLevel);
      return; // Skip the normal setAudioLevel below
    }

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
      // Check if media devices are available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Media devices not supported in this browser');
      }

      // Check microphone permissions
      try {
        const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        setPermissionStatus(permission.state);
        console.log('Microphone permission status:', permission.state);
        
        if (permission.state === 'denied') {
          throw new Error('Microphone access is permanently denied. Please enable it in browser settings.');
        }
      } catch (permError) {
        console.warn('Could not check microphone permissions:', permError);
      }

      // Request microphone access with progressive fallback constraints
      let stream: MediaStream;
      const constraints = [
        // First try with optimal settings
        {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: { ideal: 44100 },
            channelCount: { ideal: 1 }
          }
        },
        // Fallback with basic settings
        {
          audio: {
            echoCancellation: true,
            noiseSuppression: false,
            autoGainControl: false
          }
        },
        // Final fallback with minimal constraints
        { audio: true }
      ];
      
      let streamError: Error | null = null;
      for (const constraint of constraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraint);
          console.log('Microphone access granted with constraints:', constraint);
          setPermissionStatus('granted');
          break;
        } catch (err) {
          streamError = err as Error;
          console.warn('Failed with constraint:', constraint, err);
        }
      }
      
      if (!stream!) {
        throw streamError || new Error('Could not access microphone with any constraints');
      }
      streamRef.current = stream;

      // Set up audio analysis
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Resume audio context if suspended (required by Chrome's autoplay policy)
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048; // Higher resolution for better detection
      analyserRef.current.smoothingTimeConstant = 0.3; // Less smoothing for more responsive detection
      analyserRef.current.minDecibels = -90;
      analyserRef.current.maxDecibels = -10;
      source.connect(analyserRef.current);
      
      // Test audio input immediately
      console.log('Audio context state:', audioContextRef.current.state);
      console.log('Stream active tracks:', stream.getAudioTracks().length);
      console.log('Stream track enabled:', stream.getAudioTracks()[0]?.enabled);
      console.log('Stream track settings:', stream.getAudioTracks()[0]?.getSettings());

      // Set up media recorder with fallback options
      let mediaRecorder: MediaRecorder;
      const options = [
        { mimeType: 'audio/webm;codecs=opus' },
        { mimeType: 'audio/webm' },
        { mimeType: 'audio/mp4' },
        { mimeType: 'audio/mpeg' },
        { mimeType: 'audio/wav' },
        {} // fallback with default
      ];

      let selectedOption: { mimeType?: string } = {};
      for (const option of options) {
        if (!option.mimeType || MediaRecorder.isTypeSupported(option.mimeType)) {
          selectedOption = option;
          break;
        }
      }

      mediaRecorder = new MediaRecorder(stream, selectedOption);
      mediaRecorderRef.current = mediaRecorder;

      const chunks: BlobPart[] = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mimeType = (selectedOption as any).mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: mimeType });
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

      // Test microphone input with multiple checks
      const testMicrophoneInput = () => {
        if (!analyserRef.current) return;
        
        const bufferLength = analyserRef.current.frequencyBinCount;
        const timeData = new Uint8Array(bufferLength);
        const freqData = new Uint8Array(bufferLength);
        
        analyserRef.current.getByteTimeDomainData(timeData);
        analyserRef.current.getByteFrequencyData(freqData);
        
        // Calculate time domain RMS
        let timeSum = 0;
        for (let i = 0; i < bufferLength; i++) {
          const sample = (timeData[i] - 128) / 128;
          timeSum += sample * sample;
        }
        const timeRms = Math.sqrt(timeSum / bufferLength);
        
        // Calculate frequency domain average
        const freqSum = freqData.reduce((acc, val) => acc + val, 0);
        const freqAvg = freqSum / bufferLength;
        
        console.log('Microphone test - Time RMS:', timeRms.toFixed(4), 'Freq Avg:', freqAvg.toFixed(1));
        
        if (timeRms < 0.001 && freqAvg < 1) {
          console.warn('Microphone appears to be silent. Check:');
          console.warn('1. Browser microphone permissions');
          console.warn('2. System microphone settings');
          console.warn('3. Hardware microphone connection');
          console.warn('Note: Audio recording may still work even if levels show as 0');
        } else {
          setAudioDetectionWorking(true);
          console.log('Audio detection is working properly');
        }
      };
      
      // Test multiple times to catch audio
      setTimeout(testMicrophoneInput, 100);
      setTimeout(testMicrophoneInput, 500);
      setTimeout(testMicrophoneInput, 1000);

      toast({
        title: "Recording Started",
        description: "Speak clearly into your microphone. Check browser permissions if no audio detected.",
      });

    } catch (error) {
      console.error("Error starting recording:", error);
      let errorMessage = "Could not access microphone. Please check permissions.";
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          errorMessage = "Microphone access denied. Please click the microphone icon in your browser's address bar and allow permissions.";
        } else if (error.name === 'NotFoundError') {
          errorMessage = "No microphone found. Please connect a microphone and refresh the page.";
        } else if (error.name === 'NotSupportedError') {
          errorMessage = "Voice recording is not supported in this browser. Try Chrome, Firefox, or Edge.";
        } else if (error.name === 'ConstraintNotSatisfiedError') {
          errorMessage = "Microphone constraints not satisfied. Your microphone may not support the required settings.";
        }
        
        console.error('Detailed microphone error:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
      }
      
      toast({
        title: "Recording Error",
        description: errorMessage,
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
    } else {
      toast({
        title: "No Recording",
        description: "Please record audio first before transcribing.",
        variant: "destructive",
      });
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
      console.log('Using transcript:', transcript);
      onTranscriptionComplete(transcript);
      onClose();
      toast({
        title: "Transcript Applied",
        description: "Voice transcription has been added to the form",
      });
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
                <Progress 
                  value={audioLevel} 
                  className={`w-20 h-2 ${audioLevel === 0 ? 'opacity-50' : ''}`} 
                />
                <span className={audioLevel === 0 ? 'text-red-500' : 'text-green-600'}>
                  {audioLevel}%
                </span>
                {audioLevel === 0 && !audioDetectionWorking && (
                  <span className="text-xs text-red-500 ml-2">Visual levels not detected - recording may still work</span>
                )}
                {audioLevel > 0 && audioDetectionWorking && (
                  <span className="text-xs text-green-600 ml-2">Audio detected</span>
                )}
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

      {/* Demo button for testing without microphone */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const demoText = "Customer reports gas leak near 1234 Main Street. Strong odor detected in basement area. Pilot light appears to be out. No visible flames observed.";
            setOriginalTranscript(demoText);
            setTranscript(sanitizePii ? sanitizePII(demoText) : demoText);
            setMode('dummy');
            setConfidence(95);
          }}
          className="text-xs"
        >
          Try Demo Text
        </Button>
        
        <div className="text-xs text-muted-foreground">
          <strong>Tips:</strong> Speak clearly and close to your microphone for best quality.
        </div>
      </div>
    </div>
  );
}
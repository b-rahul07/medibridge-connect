import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Send, Languages, Mic, Square, Loader2, FileCheck, Stethoscope, User, WifiOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useMessages } from '@/hooks/useMessages';
import { SUPPORTED_LANGUAGES } from '@/services/translator';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { summarizeSession, uploadAudio, API_BASE, getSession, endConsultation, updateSessionLanguage, SessionOut } from '@/services/api';
import { useToast } from '@/hooks/use-toast';

const SessionChat = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { messages, loading, connected, sendMessage } = useMessages(sessionId!);
  const [sessionDetail, setSessionDetail] = useState<SessionOut | null>(null);
  const [newMessage, setNewMessage] = useState('');

  // Single preferred language — stored per-session in sessionStorage
  const langKey = `medibridge_lang_${sessionId}`;
  const [myLanguage, setMyLanguage] = useState(() => {
    // Per-session language, falling back to global default preference
    return sessionStorage.getItem(langKey)
      || sessionStorage.getItem('medibridge_myLanguage')
      || 'en';
  });

  const handleMyLanguageChange = async (lang: string) => {
    setMyLanguage(lang);
    // Save per-session so it doesn't bleed to other chats
    sessionStorage.setItem(langKey, lang);
    // Also update global default for new sessions
    sessionStorage.setItem('medibridge_myLanguage', lang);
    // Immediately update the backend session record so translation
    // targets the correct language even before the user sends a message
    if (sessionId) {
      try {
        await updateSessionLanguage(sessionId, lang);
      } catch (err) {
        console.error('Failed to update language on server:', err);
      }
    }
  };
  const [isSending, setIsSending] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  
  // Derive role from auth user (no Supabase profile fetch)
  const profile = user ? { role: user.role } : null;

  // Fetch session details to show the other party's name
  useEffect(() => {
    if (!sessionId) return;
    getSession(sessionId)
      .then((detail) => {
        setSessionDetail(detail);
        // Sync language from server session record if available, and no
        // per-session override has been set yet by the user.
        if (!sessionStorage.getItem(langKey) && user) {
          const serverLang =
            user.role === 'patient' ? detail.patient_language : detail.doctor_language;
          if (serverLang) {
            setMyLanguage(serverLang);
            sessionStorage.setItem(langKey, serverLang);
          }
        }
      })
      .catch((err) => console.error('Failed to load session detail:', err));
  }, [sessionId]);

  // Derive names and roles for message display
  const otherPartyName = (() => {
    if (!sessionDetail || !user) return null;
    if (user.role === 'doctor') {
      return sessionDetail.patient?.full_name || 'Patient';
    }
    return sessionDetail.doctor
      ? `Dr. ${sessionDetail.doctor.full_name}`
      : null;
  })();

  const myName = (() => {
    if (!user) return 'You';
    if (user.role === 'doctor') return `Dr. ${user.full_name}`;
    return user.full_name || 'You';
  })();

  // Helper: get sender info from message
  const getSenderInfo = (senderId: string) => {
    if (!sessionDetail) return { name: 'Unknown', role: 'patient' as const };
    
    const isDoctor = senderId === sessionDetail.doctor_id;
    const isPatient = senderId === sessionDetail.patient_id;
    
    if (isDoctor) {
      return {
        name: sessionDetail.doctor?.full_name ? `Dr. ${sessionDetail.doctor.full_name}` : 'Doctor',
        role: 'doctor' as const,
      };
    }
    if (isPatient) {
      return {
        name: sessionDetail.patient?.full_name || 'Patient',
        role: 'patient' as const,
      };
    }
    return { name: 'Unknown', role: 'patient' as const };
  };

  // Audio recording
  const { startRecording, stopRecording, isRecording, audioBlob, clearRecording } = useAudioRecorder();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Upload and send audio message via backend API
  const uploadAndSendAudio = useCallback(async () => {
    if (!audioBlob || !user || !sessionId || isUploadingAudio) return;

    setIsUploadingAudio(true);
    try {
      await uploadAudio(sessionId, audioBlob, myLanguage);
      clearRecording();
    } catch (error) {
      console.error('Failed to upload audio:', error);
      alert('Failed to send audio message. Please try again.');
    } finally {
      setIsUploadingAudio(false);
    }
  }, [audioBlob, user, sessionId, clearRecording, isUploadingAudio, myLanguage]);

  // Auto-send audio when recording finishes — guard against duplicate uploads
  useEffect(() => {
    if (audioBlob && !isRecording && !isUploadingAudio) {
      uploadAndSendAudio();
    }
  }, [audioBlob, isRecording, isUploadingAudio, uploadAndSendAudio]);

  // Handle voice recording toggle
  const handleVoiceToggle = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Handle sending a message (via REST API — backend also broadcasts via Socket.IO)
  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!newMessage.trim() || !user || isSending) return;

    const textToSend = newMessage;
    setNewMessage(''); // clear input immediately for snappy UX
    setIsSending(true);
    try {
      await sendMessage(textToSend, myLanguage);
    } catch (error) {
      // Restore the message in the input so the user can retry
      setNewMessage(textToSend);
      const msg = error instanceof Error ? error.message : 'Failed to send message';
      toast({
        variant: 'destructive',
        title: 'Send failed',
        description: msg,
      });
    } finally {
      setIsSending(false);
    }
  };

  // Handle ending consultation (doctors only)
  const handleEndConsultation = async () => {
    if (!user || !sessionId || !profile || profile.role !== 'doctor') return;

    const confirmed = window.confirm('Are you sure you want to end this consultation? A summary will be generated.');
    if (!confirmed) return;

    setIsEndingSession(true);
    try {
      // Generate + persist summary via backend
      const summary = await summarizeSession(sessionId);
      
      // End the session with the summary (direct API call — no useSessions polling)
      await endConsultation(sessionId, summary);
      
      // Navigate back to dashboard
      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to end consultation:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to end consultation. Please try again.',
      });
    } finally {
      setIsEndingSession(false);
    }
  };

  // Determine if a message is "mine" using multiple checks for robustness
  const isMyMessage = (senderId: string): boolean => {
    // Primary check: compare sender_id with authenticated user's id
    if (user?.id && String(senderId) === String(user.id)) return true;
    // Secondary check: compare with session detail participant IDs by role
    if (sessionDetail && user?.role === 'doctor' && senderId === sessionDetail.doctor_id) return true;
    if (sessionDetail && user?.role === 'patient' && senderId === sessionDetail.patient_id) return true;
    return false;
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm flex items-center justify-between px-4 sm:px-6 py-3 flex-shrink-0 gap-3">
        <div className="flex items-center gap-3">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="gap-2 px-2 sm:px-3">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Button>
          </Link>

          <div className="h-5 w-px bg-border hidden sm:block" />
          
          {/* Session info */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              {user?.role === 'doctor' 
                ? <User className="w-4 h-4 text-primary" />
                : <Stethoscope className="w-4 h-4 text-primary" />
              }
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-foreground leading-tight">
                {otherPartyName || `Session ${sessionId?.slice(0, 8)}...`}
              </p>
              {connected ? (
                <p className="text-[11px] text-emerald-500 font-medium flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live Session
                </p>
              ) : (
                <p className="text-[11px] text-amber-500 font-medium flex items-center gap-1">
                  <WifiOff className="w-3 h-3" />
                  Reconnecting...
                </p>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Single Language Selector: My Preferred Language */}
          <div className="flex items-center gap-1.5">
            <Languages className="w-4 h-4 text-muted-foreground hidden sm:block" />
            <Select value={myLanguage} onValueChange={handleMyLanguageChange}>
              <SelectTrigger className="w-[100px] sm:w-[140px] h-9 text-xs sm:text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* End Consultation Button (Doctors only) */}
          {profile?.role === 'doctor' && (
            <Button 
              onClick={handleEndConsultation}
              disabled={isEndingSession}
              variant="destructive"
              size="sm"
              className="gap-2 text-xs sm:text-sm"
            >
              {isEndingSession ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="hidden sm:inline">Ending...</span>
                </>
              ) : (
                <>
                  <FileCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">End Consultation</span>
                </>
              )}
            </Button>
          )}
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-4">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-muted-foreground">Loading messages...</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Languages className="w-8 h-8 text-primary" />
              </div>
              <p className="text-lg font-semibold text-foreground">No messages yet</p>
              <p className="text-sm text-muted-foreground">Send a message below to start the conversation</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => {
              const isMe = isMyMessage(message.sender_id);
              const sender = getSenderInfo(message.sender_id);
              const isDoctor = sender.role === 'doctor';
              
              return (
                <div
                  key={message.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  {/* Sender label */}
                  <div className={`flex items-center gap-1.5 mb-1.5 px-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                      isDoctor ? 'bg-indigo-100 dark:bg-indigo-500/20' : 'bg-emerald-100 dark:bg-emerald-500/20'
                    }`}>
                      {isDoctor
                        ? <Stethoscope className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                        : <User className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      }
                    </div>
                    <span className={`text-xs font-medium ${
                      isDoctor ? 'text-indigo-600 dark:text-indigo-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`}>
                      {isMe ? 'You' : sender.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {/* Chat Bubble */}
                  <div
                    className={`max-w-[80%] sm:max-w-[70%] rounded-2xl px-5 py-3.5 shadow-sm ${
                      isMe
                        ? isDoctor
                          ? 'bg-indigo-600 text-white rounded-br-md'
                          : 'bg-emerald-600 text-white rounded-br-md'
                        : isDoctor
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-foreground border border-indigo-200 dark:border-indigo-800 rounded-bl-md'
                          : 'bg-emerald-50 dark:bg-emerald-950/40 text-foreground border border-emerald-200 dark:border-emerald-800 rounded-bl-md'
                    }`}
                  >
                    {/* Audio Message */}
                    {message.audio_url ? (
                      <audio 
                        controls 
                        src={message.audio_url.startsWith('http') ? message.audio_url : `${API_BASE}${message.audio_url}`} 
                        className="max-w-[280px] h-11"
                        style={{
                          filter: isMe ? 'invert(1) hue-rotate(180deg)' : 'none'
                        }}
                      />
                    ) : (
                      <p className="text-[15px] leading-relaxed break-words">
                        {message.content}
                      </p>
                    )}
                  </div>

                  {/* Translation — shown BELOW the bubble, prominent */}
                  {!message.audio_url && (() => {
                    if (message.translated_content) {
                      // Show translation only when it actually differs from original
                      if (
                        message.translated_content !== message.content &&
                        !message.translated_content.startsWith('[')
                      ) {
                        return (
                          <div className={`max-w-[80%] sm:max-w-[70%] mt-1.5 px-2 ${isMe ? 'text-right' : 'text-left'}`}>
                            <p className={`text-[14px] italic leading-relaxed ${
                              isDoctor
                                ? 'text-indigo-500 dark:text-indigo-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                            }`}>
                              {message.translated_content}
                            </p>
                          </div>
                        );
                      }
                      return null; // same text or error — hide quietly
                    }
                    // No translated_content yet — show spinner only for recent messages (< 30s)
                    const ageMs = Date.now() - new Date(message.created_at).getTime();
                    if (ageMs > 30_000) return null; // too old, translation likely failed — hide
                    return (
                      <div className={`max-w-[80%] sm:max-w-[70%] mt-1.5 px-2 ${isMe ? 'text-right' : 'text-left'}`}>
                        <div className={`flex items-center gap-1.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/60" />
                          <span className="text-xs italic text-muted-foreground/60">
                            Translating...
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border bg-card/80 backdrop-blur-sm px-4 sm:px-6 py-4 flex-shrink-0">
        <form onSubmit={handleSend} className="flex items-center gap-3 max-w-4xl mx-auto">
          {/* Voice Recording Button */}
          <Button
            type="button"
            size="icon"
            variant={isRecording ? 'destructive' : 'outline'}
            onClick={handleVoiceToggle}
            disabled={loading || isSending || isUploadingAudio}
            className="flex-shrink-0 w-10 h-10 rounded-xl"
          >
            {isUploadingAudio ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isRecording ? (
              <Square className="w-4 h-4" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
          </Button>
          
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={`Type in ${SUPPORTED_LANGUAGES.find(l => l.code === myLanguage)?.name || 'your language'}...`}
            className="flex-1 h-11 rounded-xl text-[15px] px-4"
            disabled={loading || isSending || isRecording || isUploadingAudio}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!newMessage.trim() || loading || isSending || isRecording || isUploadingAudio}
            className="flex-shrink-0 w-10 h-10 rounded-xl"
          >
            {isSending ? (
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default SessionChat;

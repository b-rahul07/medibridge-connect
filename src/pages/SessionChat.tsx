import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Send, Languages, Mic, Square, Loader2, FileCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMessages } from '@/hooks/useMessages';
import { useSessions } from '@/hooks/useSessions';
import { SUPPORTED_LANGUAGES } from '@/lib/translator';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { summarizeSession, uploadAudio, API_BASE, getSession, SessionOut } from '@/lib/api';

const SessionChat = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { messages, loading, sendMessage } = useMessages(sessionId!);
  const { endSession } = useSessions();
  const [sessionDetail, setSessionDetail] = useState<SessionOut | null>(null);
  const [newMessage, setNewMessage] = useState('');

  // Single preferred language — stored per user in localStorage
  const [myLanguage, setMyLanguage] = useState(() => {
    return localStorage.getItem('medibridge_myLanguage') || 'en';
  });

  const handleMyLanguageChange = (lang: string) => {
    setMyLanguage(lang);
    localStorage.setItem('medibridge_myLanguage', lang);
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
      .then(setSessionDetail)
      .catch((err) => console.error('Failed to load session detail:', err));
  }, [sessionId]);

  // Derive the other party's name
  const otherPartyName = (() => {
    if (!sessionDetail || !user) return null;
    if (user.role === 'doctor') {
      return sessionDetail.patient?.full_name || 'Patient';
    }
    return sessionDetail.doctor
      ? `Dr. ${sessionDetail.doctor.full_name}`
      : null;
  })();

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

  // Handle sending a message (via Socket.IO — backend handles translation)
  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!newMessage.trim() || !user || isSending) return;

    setIsSending(true);
    try {
      // Send message via Socket.IO; backend auto-detects target language
      await sendMessage(newMessage, myLanguage);
      
      setNewMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
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
      
      // End the session with the summary
      await endSession(sessionId, summary, user.id, profile.role);
      
      // Navigate back to dashboard
      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to end consultation:', error);
      alert('Failed to end consultation. Please try again.');
    } finally {
      setIsEndingSession(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card flex items-center justify-between px-3 sm:px-4 py-2 flex-shrink-0 gap-2">
        <Link to="/dashboard" className="flex-shrink-0">
          <Button variant="ghost" size="sm" className="gap-1 sm:gap-2 px-2 sm:px-3">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to Dashboard</span>
          </Button>
        </Link>
        
        <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-end">
          {/* Single Language Selector: My Preferred Language */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Languages className="w-4 h-4 text-muted-foreground hidden sm:block" />
            <span className="text-xs text-muted-foreground hidden sm:inline">My Language:</span>
            <Select value={myLanguage} onValueChange={handleMyLanguageChange}>
              <SelectTrigger className="w-[100px] sm:w-[130px] h-8 text-xs sm:text-sm">
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
          
          <h1 className="text-xs sm:text-sm font-medium text-foreground hidden md:block">
            {otherPartyName
              ? `Chat with ${otherPartyName}`
              : `Session: ${sessionId?.slice(0, 8)}...`}
          </h1>

          {/* End Consultation Button (Doctors only) */}
          {profile?.role === 'doctor' && (
            <Button 
              onClick={handleEndConsultation}
              disabled={isEndingSession}
              variant="destructive"
              size="sm"
              className="gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3"
            >
              {isEndingSession ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-spin" />
                  <span className="hidden sm:inline">Ending...</span>
                </>
              ) : (
                <>
                  <FileCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">End Consultation</span>
                </>
              )}
            </Button>
          )}
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-4">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground">Loading messages...</p>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <p className="text-muted-foreground">No messages yet</p>
              <p className="text-sm text-muted-foreground">Start the conversation below</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => {
              const isMe = message.sender_id === user?.id;
              
              return (
                <div
                  key={message.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  {/* Chat Bubble — contains ONLY the original text */}
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                      isMe
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted text-foreground border border-border rounded-bl-md'
                    }`}
                  >
                    {/* Audio Message */}
                    {message.audio_url ? (
                      <audio 
                        controls 
                        src={message.audio_url.startsWith('http') ? message.audio_url : `${API_BASE}${message.audio_url}`} 
                        className="max-w-[250px] h-10"
                        style={{
                          filter: isMe ? 'invert(1) hue-rotate(180deg)' : 'none'
                        }}
                      />
                    ) : (
                      <p className="text-sm leading-relaxed break-words">
                        {message.content}
                      </p>
                    )}
                    
                    {/* Timestamp */}
                    <p
                      className={`text-[10px] mt-1 ${
                        isMe ? 'text-primary-foreground/60' : 'text-muted-foreground'
                      }`}
                    >
                      {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* Translation — shown BELOW the bubble, prominent */}
                  {!message.audio_url && (
                    <div
                      className={`max-w-[75%] mt-1 px-3 ${
                        isMe ? 'text-right' : 'text-left'
                      }`}
                    >
                      {message.translated_content ? (
                        <p className="text-sm italic text-muted-foreground leading-relaxed">
                          {message.translated_content}
                        </p>
                      ) : (
                        <div className={`flex items-center gap-1.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/50" />
                          <span className="text-xs italic text-muted-foreground/50">
                            Translating...
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border bg-card px-4 py-3 flex-shrink-0">
        <form onSubmit={handleSend} className="flex items-center gap-3">
          {/* Voice Recording Button */}
          <Button
            type="button"
            size="icon"
            variant={isRecording ? 'destructive' : 'outline'}
            onClick={handleVoiceToggle}
            disabled={loading || isSending || isUploadingAudio}
            className="flex-shrink-0"
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
            className="flex-1"
            disabled={loading || isSending || isRecording || isUploadingAudio}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!newMessage.trim() || loading || isSending || isRecording || isUploadingAudio}
            className="flex-shrink-0"
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

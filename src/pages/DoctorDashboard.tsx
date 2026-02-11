import { useState, useCallback } from "react";
import { LogOut, Activity, User, Stethoscope, Plus, Clock, CheckCircle, MessageSquare, FileCheck, Search, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import ThemeToggle from "@/components/ThemeToggle";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSessions } from "@/hooks/useSessions";
import { useConversationSearch } from "@/hooks/useConversationSearch";

interface Profile {
  id: string;
  email: string;
  role: 'doctor' | 'patient';
  full_name?: string;
}

const DoctorDashboard = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  // Derive profile from the auth user (no separate Supabase fetch)
  const profile: Profile | null = user
    ? { id: user.id, email: user.email, role: user.role, full_name: user.full_name }
    : null;
  const loadingProfile = !user;
  
  // Session management
  const { sessions, loading: loadingSessions, createSession, fetchSessions, acceptSession } = useSessions();
  
  // Conversation search
  const { results: searchResults, searching, searchQuery, searchConversations, clearSearch } = useConversationSearch();
  const [searchInput, setSearchInput] = useState('');

  const handleSearch = useCallback(() => {
    if (!profile || !searchInput.trim()) return;
    searchConversations(searchInput, profile.id, profile.role);
  }, [profile, searchInput, searchConversations]);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleClearSearch = () => {
    setSearchInput('');
    clearSearch();
  };

  // Highlight matched text in search results
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 text-foreground rounded px-0.5">{part}</mark>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  };

  // Handler: Create new session (for patients)
  const handleCreateSession = async () => {
    if (!profile) return;
    
    // Check if patient already has a waiting/active session
    const hasOpenSession = sessions.some(s => s.status === 'waiting' || s.status === 'active');
    if (hasOpenSession) {
      alert('You already have an open consultation. Please wait for it to complete.');
      return;
    }
    
    try {
      await createSession(localStorage.getItem('medibridge_myLanguage') || 'en');
      await fetchSessions();
    } catch (error: any) {
      console.error('Failed to create session:', error);
      if (error.message?.includes('already have')) {
        alert(error.message);
      }
    }
  };

  // Handler: Accept session (for doctors)
  const handleAcceptSession = async (sessionId: string) => {
    if (!profile) return;
    
    try {
      await acceptSession(
        sessionId,
        profile.id,
        navigate,
        localStorage.getItem('medibridge_myLanguage') || 'en'
      );
      await fetchSessions();
    } catch (error) {
      console.error('Failed to accept session:', error);
    }
  };

  const handleSignOut = async () => {
    signOut();
    navigate('/');
  };

  // Show loading state while fetching profile
  if (loadingProfile) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading Profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Header — matches landing page style ─────────────────────── */}
      <header className="w-full px-6 lg:px-12 py-4 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground tracking-tight hidden sm:inline">MediBridge</span>
          </Link>

          <div className="h-6 w-px bg-border mx-1 hidden sm:block" />

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              {profile?.role === 'doctor' ? (
                <Stethoscope className="w-4 h-4 text-primary" />
              ) : (
                <User className="w-4 h-4 text-primary" />
              )}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-foreground leading-tight">
                {profile?.role === 'doctor' ? `Dr. ${profile.full_name}` : profile?.full_name || user?.email}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {profile?.role === 'doctor' ? 'Provider Dashboard' : 'Patient Dashboard'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-sm rounded-lg"
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 lg:px-12 py-8 space-y-8">
          {/* Page Header */}
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-semibold tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {profile?.role === 'doctor' ? 'Provider Dashboard' : 'Patient Dashboard'}
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight">
              {profile?.role === 'patient' ? 'My Consultations' : 'Manage Patients'}
            </h1>
            <p className="text-base text-muted-foreground max-w-lg">
              {profile?.role === 'patient' 
                ? 'Request and manage your consultation sessions with doctors.'
                : 'View incoming requests, manage active sessions, and review past consultations.'}
            </p>
          </div>

          {/* ── Conversation Search ──────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search past conversations..."
                  className="pl-10 pr-10 h-11 rounded-xl text-sm"
                />
                {searchInput && (
                  <button
                    onClick={handleClearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Button onClick={handleSearch} disabled={searching || !searchInput.trim()} className="gap-2 h-11 rounded-xl px-6">
                {searching ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Search
              </Button>
            </div>

            {/* Search Results */}
            {searchQuery && (
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {searching ? 'Searching...' : `${searchResults.length} result(s) for "${searchQuery}"`}
                  </p>
                  {searchResults.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={handleClearSearch} className="text-xs">
                      Clear
                    </Button>
                  )}
                </div>
                {searchResults.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {searchResults.map((result) => (
                      <div
                        key={result.id}
                        className="flex items-start justify-between gap-3 p-4 rounded-xl border border-border bg-muted/30 hover:bg-muted/60 transition-colors cursor-pointer"
                        onClick={() => navigate('/session/' + result.session_id)}
                      >
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <p className="text-sm leading-relaxed break-words">
                            {highlightMatch(result.content, searchQuery)}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(result.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                      </div>
                    ))}
                  </div>
                )}
                {!searching && searchResults.length === 0 && (
                  <div className="text-center py-8">
                    <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No messages found matching "{searchQuery}"</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Patient View ─────────────────────────────────────── */}
          {profile?.role === 'patient' && (
            <div className="space-y-8">
              {/* Create Session CTA */}
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                {sessions.some(s => s.status === 'waiting' || s.status === 'active') ? (
                  <div className="text-center py-4">
                    <div className="w-12 h-12 rounded-2xl bg-yellow-100 dark:bg-yellow-500/10 flex items-center justify-center mx-auto mb-3">
                      <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Session Already Active</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Complete your current consultation before requesting a new one.
                    </p>
                  </div>
                ) : (
                  <Button 
                    onClick={handleCreateSession}
                    disabled={loadingSessions}
                    className="w-full h-14 text-base gap-3 rounded-xl shadow-lg shadow-primary/20"
                    size="lg"
                  >
                    <Plus className="w-5 h-5" />
                    {loadingSessions ? 'Creating...' : 'Request New Consultation'}
                  </Button>
                )}
              </div>

              {/* Active + Waiting Sessions */}
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  Your Sessions
                </h2>
                {loadingSessions && sessions.length === 0 ? (
                  <div className="text-center py-16">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground">Loading sessions...</p>
                  </div>
                ) : sessions.filter(s => s.status !== 'completed').length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                      <MessageSquare className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground">No active sessions</p>
                    <p className="text-sm text-muted-foreground mt-1">Click above to request a consultation</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {sessions.filter(s => s.status !== 'completed').map((session) => (
                      <div key={session.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                              session.status === 'active'
                                ? 'bg-emerald-100 dark:bg-emerald-500/10'
                                : 'bg-yellow-100 dark:bg-yellow-500/10'
                            }`}>
                              {session.status === 'active'
                                ? <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                : <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                              }
                            </div>
                            <div>
                              {session.doctor && (
                                <p className="text-sm font-semibold text-foreground">
                                  Dr. {session.doctor.full_name}
                                </p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {new Date(session.created_at).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          <Badge 
                            variant={session.status === 'active' ? 'default' : 'secondary'}
                            className="gap-1.5 rounded-full px-3"
                          >
                            {session.status === 'waiting' && <Clock className="w-3 h-3" />}
                            {session.status === 'active' && <CheckCircle className="w-3 h-3" />}
                            {session.status === 'waiting' ? 'Waiting' : 'Active'}
                          </Badge>
                        </div>
                        {session.status === 'active' && (
                          <Button
                            variant="outline"
                            className="w-full mt-4 gap-2.5 h-10 rounded-xl"
                            onClick={() => navigate('/session/' + session.id)}
                          >
                            <MessageSquare className="w-4 h-4" />
                            Open Chat
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Past Consultations */}
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center">
                    <FileCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  Past Consultations
                </h2>
                {sessions.filter(s => s.status === 'completed').length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                      <FileCheck className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground">No completed consultations yet</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sessions.filter(s => s.status === 'completed').map((session) => (
                      <div key={session.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center">
                            <Stethoscope className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {session.doctor ? `Dr. ${session.doctor.full_name}` : 'Completed Session'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(session.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        {session.summary && (
                          <div className="border-t border-border pt-3">
                            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Summary</p>
                            <p className="text-xs text-muted-foreground leading-relaxed max-h-28 overflow-y-auto whitespace-pre-wrap">
                              {session.summary}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Doctor View ──────────────────────────────────────── */}
          {profile?.role === 'doctor' && (
            <div className="space-y-8">
              {/* Incoming Requests */}
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-yellow-100 dark:bg-yellow-500/10 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  Incoming Requests
                  {sessions.filter(s => s.status === 'waiting').length > 0 && (
                    <Badge variant="secondary" className="rounded-full ml-1">
                      {sessions.filter(s => s.status === 'waiting').length}
                    </Badge>
                  )}
                </h2>
                {loadingSessions ? (
                  <div className="text-center py-16">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground">Loading sessions...</p>
                  </div>
                ) : sessions.filter(s => s.status === 'waiting').length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                      <Clock className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground">No pending requests</p>
                    <p className="text-sm text-muted-foreground mt-1">New patient requests will appear here</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sessions.filter(s => s.status === 'waiting').map((session) => (
                      <div key={session.id} className="rounded-2xl border border-yellow-200 dark:border-yellow-800/50 bg-yellow-50/50 dark:bg-yellow-950/20 p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-xl bg-yellow-100 dark:bg-yellow-500/10 flex items-center justify-center">
                            <User className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {session.patient?.full_name || 'Patient'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(session.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        {session.patient_language && (
                          <p className="text-xs text-muted-foreground mb-3">
                            Language: <span className="font-medium text-foreground">{session.patient_language}</span>
                          </p>
                        )}
                        <Button 
                          onClick={() => handleAcceptSession(session.id)}
                          className="w-full gap-2.5 h-10 rounded-xl shadow-sm"
                          disabled={loadingSessions}
                        >
                          <CheckCircle className="w-4 h-4" />
                          Accept Patient
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Active Consultations */}
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  Active Consultations
                </h2>
                {sessions.filter(s => s.status === 'active' && s.doctor_id === profile.id).length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                      <MessageSquare className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground">No active consultations</p>
                    <p className="text-sm text-muted-foreground mt-1">Accept a patient request to begin</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sessions.filter(s => s.status === 'active' && s.doctor_id === profile.id).map((session) => (
                      <div key={session.id} className="rounded-2xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center">
                            <User className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {session.patient?.full_name || 'Patient'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(session.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <Button 
                          variant="outline"
                          className="w-full gap-2.5 h-10 rounded-xl"
                          onClick={() => navigate('/session/' + session.id)}
                        >
                          <MessageSquare className="w-4 h-4" />
                          Continue Chat
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Past Consultations */}
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center">
                    <FileCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  Past Consultations
                </h2>
                {sessions.filter(s => s.status === 'completed').length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                      <FileCheck className="w-7 h-7 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground">No completed consultations yet</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sessions.filter(s => s.status === 'completed').map((session) => (
                      <div key={session.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center">
                            <User className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">
                              {session.patient?.full_name || 'Patient'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(session.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        {session.summary && (
                          <div className="border-t border-border pt-3">
                            <p className="text-xs font-semibold text-muted-foreground mb-1.5">Summary</p>
                            <p className="text-xs text-muted-foreground leading-relaxed max-h-28 overflow-y-auto whitespace-pre-wrap">
                              {session.summary}
                            </p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DoctorDashboard;
    </div>
  );
};

export default DoctorDashboard;

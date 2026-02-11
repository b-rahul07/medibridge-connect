import { useState, useEffect, useCallback } from "react";
import { LogOut, Activity, User, Stethoscope, Plus, Clock, CheckCircle, MessageSquare, FileCheck, Search, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
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

  // Sessions are now auto-fetched by useSessions hook via polling

  // Handler: Create new session (for patients)
  const handleCreateSession = async () => {
    if (!profile) return;
    
    try {
      await createSession();
      await fetchSessions();
    } catch (error) {
      console.error('Failed to create session:', error);
    }
  };

  // Handler: Accept session (for doctors)
  const handleAcceptSession = async (sessionId: string) => {
    if (!profile) return;
    
    try {
      await acceptSession(sessionId, profile.id, navigate);
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
          <p className="text-sm text-muted-foreground">Loading Profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Activity className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground text-sm hidden sm:inline">MediBridge</span>
          </Link>

          <div className="h-5 w-px bg-border mx-1 hidden sm:block" />

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center">
              {profile?.role === 'doctor' ? (
                <Stethoscope className="w-3.5 h-3.5 text-primary" />
              ) : (
                <User className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </div>
            <div className="flex items-center gap-2 hidden sm:flex">
              <span className="text-sm font-medium text-foreground">
                {profile?.full_name || user?.email || 'User'}
              </span>
              <Badge 
                variant={profile?.role === 'doctor' ? 'default' : 'secondary'}
                className="text-[10px] px-2 py-0.5"
              >
                {profile?.role === 'doctor' ? 'Doctor View' : 'Patient View'}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={handleSignOut}
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
          {/* Page Header */}
          <div className="space-y-1 sm:space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Consultations</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {profile?.role === 'patient' 
                ? 'Manage your consultation sessions with doctors'
                : 'View and manage patient consultation requests'}
            </p>
          </div>

          {/* Conversation Search */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Search conversations by keyword..."
                    className="pl-9 pr-9"
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
                <Button onClick={handleSearch} disabled={searching || !searchInput.trim()} className="gap-2">
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
                <div className="mt-4 space-y-3">
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
                          className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-muted/50 hover:bg-muted transition-colors"
                        >
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className="text-sm leading-relaxed break-words">
                              {highlightMatch(result.content, searchQuery)}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(result.created_at).toLocaleString()}
                              </span>
                              <span className="font-mono">
                                Session: {result.session_id.slice(0, 8)}...
                              </span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="flex-shrink-0 gap-1"
                            onClick={() => navigate('/session/' + result.session_id)}
                          >
                            <ArrowRight className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {!searching && searchResults.length === 0 && (
                    <div className="text-center py-6">
                      <Search className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No messages found matching "{searchQuery}"</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Patient View */}
          {profile?.role === 'patient' && (
            <div className="space-y-6">
              {/* Create Session Button */}
              <Card>
                <CardContent className="pt-6">
                  <Button 
                    onClick={handleCreateSession}
                    disabled={loadingSessions}
                    className="w-full h-16 text-lg gap-3"
                    size="lg"
                  >
                    <Plus className="w-6 h-6" />
                    {loadingSessions ? 'Creating...' : 'Request New Consultation'}
                  </Button>
                </CardContent>
              </Card>

              {/* Sessions List */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">Your Sessions</h2>
                {loadingSessions && sessions.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground">Loading sessions...</p>
                  </div>
                ) : sessions.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No consultation sessions yet</p>
                      <p className="text-sm text-muted-foreground mt-2">Click the button above to request a consultation</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {sessions.map((session) => (
                      <Card key={session.id}>
                        <CardContent className="pt-6">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">
                                  {new Date(session.created_at).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-sm font-medium">Session ID: {session.id.slice(0, 8)}...</p>
                            </div>
                            <Badge 
                              variant={session.status === 'waiting' ? 'secondary' : session.status === 'active' ? 'default' : 'outline'}
                              className="gap-1"
                            >
                              {session.status === 'waiting' && <Clock className="w-3 h-3" />}
                              {session.status === 'active' && <CheckCircle className="w-3 h-3" />}
                              {session.status === 'completed' && <FileCheck className="w-3 h-3" />}
                              {session.status === 'waiting' ? 'Waiting for Doctor' : session.status === 'active' ? 'Active' : 'Completed'}
                            </Badge>
                          </div>
                          {session.status === 'active' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-3 gap-2"
                              onClick={() => navigate('/session/' + session.id)}
                            >
                              <MessageSquare className="w-4 h-4" />
                              Open Chat
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
              {/* Past Consultations */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-blue-500" />
                  Past Consultations
                </h2>
                {sessions.filter(s => s.status === 'completed').length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <FileCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No completed consultations yet</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sessions.filter(s => s.status === 'completed').map((session) => (
                      <Card key={session.id}>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <FileCheck className="w-4 h-4 text-blue-500" />
                            Completed Session
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              {new Date(session.created_at).toLocaleString()}
                            </div>
                            <p className="font-mono text-xs">ID: {session.id.slice(0, 12)}...</p>
                          </div>
                          {session.summary && (
                            <div className="border-t pt-4">
                              <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Summary:</h4>
                              <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto whitespace-pre-wrap">
                                {session.summary}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>            </div>
          )}

          {/* Doctor View */}
          {profile?.role === 'doctor' && (
            <div className="space-y-6">
              {/* Incoming Requests */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <Clock className="w-5 h-5 text-yellow-500" />
                  Incoming Requests
                </h2>
                {loadingSessions ? (
                  <div className="text-center py-12">
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-sm text-muted-foreground">Loading sessions...</p>
                  </div>
                ) : sessions.filter(s => s.status === 'waiting').length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No pending consultation requests</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sessions.filter(s => s.status === 'waiting').map((session) => (
                      <Card key={session.id}>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <User className="w-4 h-4" />
                            Patient Request
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              {new Date(session.created_at).toLocaleString()}
                            </div>
                            <p className="font-mono text-xs">ID: {session.id.slice(0, 12)}...</p>
                          </div>
                          <Button 
                            onClick={() => handleAcceptSession(session.id)}
                            className="w-full gap-2"
                            disabled={loadingSessions}
                          >
                            <CheckCircle className="w-4 h-4" />
                            Accept Patient
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Active Consultations */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  My Active Consultations
                </h2>
                {sessions.filter(s => s.status === 'active' && s.doctor_id === profile.id).length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No active consultations</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sessions.filter(s => s.status === 'active' && s.doctor_id === profile.id).map((session) => (
                      <Card key={session.id}>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            Active Session
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              {new Date(session.created_at).toLocaleString()}
                            </div>
                            <p className="font-mono text-xs">ID: {session.id.slice(0, 12)}...</p>
                          </div>
                          <Button 
                            variant="outline"
                            className="w-full gap-2"
                            onClick={() => navigate('/session/' + session.id)}
                          >
                            <MessageSquare className="w-4 h-4" />
                            Continue Chat
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Past Consultations */}
              <div className="space-y-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-blue-500" />
                  Past Consultations
                </h2>
                {sessions.filter(s => s.status === 'completed').length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <FileCheck className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No completed consultations yet</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sessions.filter(s => s.status === 'completed').map((session) => (
                      <Card key={session.id}>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <FileCheck className="w-4 h-4 text-blue-500" />
                            Completed Session
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              {new Date(session.created_at).toLocaleString()}
                            </div>
                            <p className="font-mono text-xs">ID: {session.id.slice(0, 12)}...</p>
                          </div>
                          {session.summary && (
                            <div className="border-t pt-4">
                              <h4 className="text-xs font-semibold mb-2 text-muted-foreground">Summary:</h4>
                              <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto whitespace-pre-wrap">
                                {session.summary}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
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

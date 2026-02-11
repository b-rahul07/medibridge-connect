import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signup, login } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Activity, Stethoscope, User, ArrowLeft } from 'lucide-react';
import ThemeToggle from '@/components/ThemeToggle';

const Login = () => {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [role, setRole] = useState<'doctor' | 'patient'>('patient');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    try {
      if (isSignUp) {
        await signup(email, password, fullName || email.split('@')[0], role);
      } else {
        await login(email, password);
      }

      // Refresh user in auth context, then navigate
      await refreshUser();
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Authentication error:', error);
      setErrorMessage(error.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header — matches landing page */}
      <header className="w-full px-6 lg:px-12 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-foreground tracking-tight">MediBridge</span>
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={() => navigate('/')}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card shadow-2xl shadow-black/5 dark:shadow-black/30 p-8 space-y-6">
            {/* Header */}
            <div className="text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                <Activity className="w-7 h-7 text-primary" />
              </div>
              <h1 className="text-2xl font-extrabold text-foreground tracking-tight">
                {isSignUp ? 'Create Account' : 'Welcome Back'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {isSignUp
                  ? 'Sign up to start using MediBridge'
                  : 'Sign in to access your MediBridge account'}
              </p>
            </div>

            <form onSubmit={handleAuth} className="space-y-5">
              {/* Role Selection - Only shown during Sign Up */}
              {isSignUp && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">I am a</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRole('patient')}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        role === 'patient'
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        role === 'patient' ? 'bg-emerald-100 dark:bg-emerald-500/10' : 'bg-muted'
                      }`}>
                        <User className={`w-5 h-5 ${role === 'patient' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`} />
                      </div>
                      <span className="text-sm font-medium">Patient</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('doctor')}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        role === 'doctor'
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        role === 'doctor' ? 'bg-indigo-100 dark:bg-indigo-500/10' : 'bg-muted'
                      }`}>
                        <Stethoscope className={`w-5 h-5 ${role === 'doctor' ? 'text-indigo-600 dark:text-indigo-400' : 'text-muted-foreground'}`} />
                      </div>
                      <span className="text-sm font-medium">Doctor</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Full Name - Only shown during Sign Up */}
              {isSignUp && (
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-sm font-semibold">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Dr. Jane Smith"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    disabled={loading}
                    className="h-11 rounded-xl"
                  />
                </div>
              )}

              {/* Email Input */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-semibold">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="h-11 rounded-xl"
                />
              </div>

              {/* Password Input */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  disabled={loading}
                  className="h-11 rounded-xl"
                />
                {isSignUp && (
                  <p className="text-xs text-muted-foreground">
                    Password must be at least 6 characters
                  </p>
                )}
              </div>

              {/* Error Message */}
              {errorMessage && (
                <Alert variant="destructive" className="rounded-xl">
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}

              {/* Submit Button */}
              <Button type="submit" className="w-full h-11 rounded-xl text-sm font-semibold shadow-lg shadow-primary/20" disabled={loading}>
                {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
              </Button>

              {/* Toggle between Sign Up and Sign In */}
              <div className="text-center text-sm">
                <span className="text-muted-foreground">
                  {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(!isSignUp);
                    setErrorMessage(null);
                  }}
                  className="text-primary font-semibold hover:underline"
                  disabled={loading}
                >
                  {isSignUp ? 'Sign In' : 'Sign Up'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;

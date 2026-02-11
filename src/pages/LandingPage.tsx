import { Activity, ArrowRight, Languages, Mic, Send, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ThemeToggle from "@/components/ThemeToggle";

const LandingPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="w-full px-6 lg:px-12 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-foreground tracking-tight">MediBridge</span>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <button
            onClick={() => navigate("/login")}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
          >
            Provider Login
          </button>
          <button
            onClick={() => navigate("/login")}
            className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            Join Now
          </button>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col">
        <section className="flex-1 flex items-center px-6 lg:px-12 py-12 lg:py-0">
          <div className="max-w-7xl mx-auto w-full grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left — Copy */}
            <div className="space-y-8 max-w-xl">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-primary text-xs font-semibold tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Next-Gen Medical Translation
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold leading-[1.1] tracking-tight">
                <span className="text-foreground">Breaking Language</span>
                <br />
                <span className="text-primary">Barriers in</span>
                <br />
                <span className="text-primary">Healthcare.</span>
              </h1>

              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-md">
                A real-time, AI-powered consultation bridge for doctors and patients.
                Providing instant, medically-accurate translation across 100+ languages.
              </p>

              <div className="flex flex-wrap gap-4">
                <button
                  onClick={() => navigate("/login")}
                  className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25"
                >
                  Join as Patient
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => navigate("/login")}
                  className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl border border-border bg-card text-foreground font-semibold text-sm hover:bg-muted transition-colors"
                >
                  Medical Provider
                </button>
              </div>
            </div>

            {/* Right — Chat Demo Card */}
            <div className="hidden lg:flex justify-center">
              <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl shadow-black/5 dark:shadow-black/30 overflow-hidden">
                {/* Card header */}
                <div className="px-5 py-4 flex items-center gap-3 border-b border-border/50">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Active Session</p>
                    <p className="text-[11px] font-semibold text-emerald-500 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      LIVE TRANSLATING
                    </p>
                  </div>
                </div>

                {/* Chat messages */}
                <div className="px-5 py-6 space-y-5 min-h-[280px]">
                  {/* Doctor message (right-aligned, purple/primary) */}
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="bg-primary text-primary-foreground px-4 py-3 rounded-2xl rounded-tr-md max-w-[85%]">
                      <p className="text-sm leading-relaxed">Where is the pain located exactly?</p>
                    </div>
                    <p className="text-[11px] text-primary/70 italic pr-1">
                      ¿Dónde se encuentra exactamente el dolor?
                    </p>
                  </div>

                  {/* Patient message (left-aligned, muted) */}
                  <div className="flex flex-col items-start gap-1.5">
                    <div className="bg-muted text-foreground px-4 py-3 rounded-2xl rounded-tl-md max-w-[85%]">
                      <p className="text-sm leading-relaxed">Me duele mucho la parte baja de la espalda.</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground italic pl-1">
                      My lower back hurts a lot.
                    </p>
                  </div>
                </div>

                {/* Input bar */}
                <div className="px-4 pb-4">
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-background">
                    <span className="text-sm text-muted-foreground flex-1">Ask a question...</span>
                    <Mic className="w-4 h-4 text-muted-foreground" />
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                      <Send className="w-3.5 h-3.5 text-primary-foreground" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────── */}
        <section className="px-6 lg:px-12 py-20 border-t border-border/50">
          <div className="max-w-7xl mx-auto grid sm:grid-cols-3 gap-10 lg:gap-16">
            {/* Feature 1 */}
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Languages className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Real-time Translation</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Powered by GPT-4o for high-accuracy medical context translation that understands nuances.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <Mic className="w-6 h-6 text-emerald-500" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Voice Transcription</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Whisper-powered speech-to-text allowing hands-free communication during critical procedures.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-bold text-foreground">Secure Logs</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Fully encrypted session logs persisted in PostgreSQL, ensuring HIPAA-compliant record keeping.
              </p>
            </div>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────── */}
        <footer className="px-6 lg:px-12 py-6 border-t border-border/50 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="w-4 h-4" />
            <span className="text-sm font-medium">MediBridge Connect</span>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} MediBridge Connect. All rights reserved.
          </p>
        </footer>
      </main>
    </div>
  );
};

export default LandingPage;

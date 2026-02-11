import { useState } from "react";
import { Stethoscope, User, Activity } from "lucide-react";
import { useNavigate } from "react-router-dom";
import ThemeToggle from "@/components/ThemeToggle";

const LandingPage = () => {
  const navigate = useNavigate();
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="w-full px-6 py-4 flex items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold text-foreground tracking-tight">MediBridge</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-2xl w-full text-center space-y-10">
          {/* Logo mark */}
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Activity className="w-8 h-8 text-primary" />
            </div>
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-extrabold text-foreground tracking-tight leading-tight">
              Breaking Language Barriers
              <span className="block text-primary">in Healthcare</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-md mx-auto leading-relaxed">
              Real-time medical translation for safer, faster care. Communicate instantly with medically verified translations.
            </p>
          </div>

          {/* Role Selection Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-lg mx-auto">
            {/* Doctor Card */}
            <button
              onClick={() => navigate("/login")}
              onMouseEnter={() => setHoveredCard("doctor")}
              onMouseLeave={() => setHoveredCard(null)}
              className={`group relative flex flex-col items-center gap-4 p-8 rounded-2xl border border-border bg-card transition-all duration-300 cursor-pointer hover:border-primary/40 ${
                hoveredCard === "doctor" ? "glow-blue -translate-y-1" : ""
              }`}
            >
              <div className="w-16 h-16 rounded-2xl bg-medical-blue-light flex items-center justify-center transition-colors group-hover:bg-primary/20">
                <Stethoscope className="w-8 h-8 text-primary" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">I am a Doctor</h3>
                <p className="text-sm text-muted-foreground">Start a consultation session</p>
              </div>
            </button>

            {/* Patient Card */}
            <button
              onClick={() => navigate("/login")}
              onMouseEnter={() => setHoveredCard("patient")}
              onMouseLeave={() => setHoveredCard(null)}
              className={`group relative flex flex-col items-center gap-4 p-8 rounded-2xl border border-border bg-card transition-all duration-300 cursor-pointer hover:border-accent/40 ${
                hoveredCard === "patient" ? "glow-teal -translate-y-1" : ""
              }`}
            >
              <div className="w-16 h-16 rounded-2xl bg-medical-teal-light flex items-center justify-center transition-colors group-hover:bg-accent/20">
                <User className="w-8 h-8 text-accent" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-foreground">I am a Patient</h3>
                <p className="text-sm text-muted-foreground">Join a session with your doctor</p>
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LandingPage;

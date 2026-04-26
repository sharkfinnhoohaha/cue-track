"use client";

import { useEffect, useRef, useState } from "react";

/* ─── Canvas Audio Visualizer (Generative Waveform) ─── */
function AudioVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    let h = canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number }[] = [];
    const bars = 128;
    let time = 0;

    function spawnParticle() {
      particles.push({
        x: Math.random() * w,
        y: h * 0.5 + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.3,
        life: 0,
        maxLife: 100 + Math.random() * 200,
      });
    }

    function draw() {
      time += 0.016;
      const displayW = w / window.devicePixelRatio;
      const displayH = h / window.devicePixelRatio;

      // Fade background
      ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
      ctx.fillRect(0, 0, displayW, displayH);

      // Draw frequency bars
      const barWidth = displayW / bars;
      for (let i = 0; i < bars; i++) {
        const x = i * barWidth;
        const freq = i / bars;
        const amp = Math.sin(freq * Math.PI * 4 + time * 2) * 0.5 + 0.5;
        const noise = Math.sin(i * 0.1 + time * 3) * 0.3;
        const barH = (amp + noise) * displayH * 0.35;
        
        // Gradient: teal at top, transparent at bottom
        const gradient = ctx.createLinearGradient(0, displayH * 0.5 - barH, 0, displayH * 0.5 + barH);
        gradient.addColorStop(0, `rgba(74, 157, 151, ${0.6 * amp})`);
        gradient.addColorStop(0.5, `rgba(74, 157, 151, ${0.2 * amp})`);
        gradient.addColorStop(1, "rgba(74, 157, 151, 0)");
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, displayH * 0.5 - barH, barWidth - 1, barH * 2);
      }

      // Draw waveform line
      ctx.beginPath();
      ctx.strokeStyle = "rgba(74, 157, 151, 0.8)";
      ctx.lineWidth = 1.5;
      for (let x = 0; x < displayW; x += 2) {
        const t = x / displayW;
        const y = displayH * 0.5 + 
          Math.sin(t * Math.PI * 8 + time * 4) * 20 +
          Math.sin(t * Math.PI * 16 + time * 6) * 10 +
          Math.sin(t * Math.PI * 32 + time * 8) * 5;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Spawn and update particles
      if (Math.random() < 0.3) spawnParticle();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life++;
        p.x += p.vx;
        p.y += p.vy;
        const alpha = 1 - p.life / p.maxLife;
        if (alpha <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.fillStyle = `rgba(74, 157, 151, ${alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5 * alpha, 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    }

    draw();

    function onResize() {
      w = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      h = canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    }
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 0,
      }}
    />
  );
}

/* ─── Navigation ─── */
function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 md:px-10">
      <div className="text-white font-semibold text-sm tracking-wide" style={{ fontFamily: "var(--font-geist)" }}>
        CueTrack
      </div>
      <div className="hidden md:flex items-center gap-8 text-xs tracking-wide uppercase" style={{ color: "rgba(255,255,255,0.5)" }}>
        <a href="#how" className="hover:text-white transition-colors duration-200">How it works</a>
        <a href="#features" className="hover:text-white transition-colors duration-200">Features</a>
        <a href="#waitlist" className="hover:text-white transition-colors duration-200">Waitlist</a>
      </div>
    </nav>
  );
}

/* ─── Hero ─── */
function Hero() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      <AudioVisualizer />
      
      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        <h1 
          className="text-4xl md:text-6xl lg:text-7xl font-light leading-tight mb-6"
          style={{ 
            fontFamily: "var(--font-geist)",
            letterSpacing: "-0.02em",
            color: "#ffffff"
          }}
        >
          Automated IEM
          <br />
          Backing Tracks
        </h1>
        
        <p 
          className="text-base md:text-lg mb-12 max-w-2xl mx-auto leading-relaxed"
          style={{ color: "rgba(255,255,255,0.5)", fontFamily: "var(--font-geist)" }}
        >
          Upload any song. AI detects sections and generates voice count-ins. 
          Ready for your in-ear monitor in seconds.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          {!submitted ? (
            <>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm w-72 focus:outline-none focus:border-[#4A9D97] transition-colors"
                style={{ fontFamily: "var(--font-geist)" }}
              />
              <button
                onClick={() => {
                  if (email) {
                    setSubmitted(true);
                    // TODO: send to waitlist API
                  }
                }}
                className="px-8 py-3 rounded-full bg-[#4A9D97] text-black text-sm font-medium hover:bg-[#5BB5AF] transition-colors duration-200"
                style={{ fontFamily: "var(--font-geist)" }}
              >
                Join waitlist
              </button>
            </>
          ) : (
            <div className="text-[#4A9D97] text-sm" style={{ fontFamily: "var(--font-geist)" }}>
              ✅ You&apos;re on the list. We&apos;ll be in touch.
            </div>
          )}
        </div>
      </div>

      <div className="absolute bottom-8 left-0 right-0 text-center">
        <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)", fontFamily: "var(--font-geist)" }}>
          Built by musicians, for musicians
        </p>
      </div>
    </section>
  );
}

/* ─── How It Works ─── */
function HowItWorks() {
  const steps = [
    { num: "01", title: "Upload", desc: "Drag any song into CueTrack. MP3, WAV, AIFF — whatever you have." },
    { num: "02", title: "Detect", desc: "AI identifies verse, chorus, bridge, and transitions automatically." },
    { num: "03", title: "Export", desc: "Download your track with voice count-ins baked right in. Ready for IEM." },
  ];

  return (
    <section id="how" className="relative py-32 px-6">
      <div className="max-w-6xl mx-auto">
        <h2 
          className="text-2xl md:text-4xl font-light mb-20 text-center"
          style={{ fontFamily: "var(--font-geist)", letterSpacing: "-0.02em" }}
        >
          How it works
        </h2>
        
        <div className="grid md:grid-cols-3 gap-12">
          {steps.map((step) => (
            <div key={step.num} className="group">
              <div 
                className="text-5xl font-light mb-6"
                style={{ color: "rgba(74, 157, 151, 0.3)", fontFamily: "var(--font-geist)" }}
              >
                {step.num}
              </div>
              <h3 
                className="text-lg font-medium mb-3"
                style={{ fontFamily: "var(--font-geist)" }}
              >
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Features ─── */
function Features() {
  const features = [
    { title: "Section Detection", desc: "AI identifies verse, chorus, bridge, intro, and outro without manual marking." },
    { title: "Voice Count-Ins", desc: '"Chorus in 4... 3... 2... 1..." — generated automatically at every transition." },
    { title: "IEM Ready", desc: "Export WAV or MP3 with markers, compatible with LiveTrak, Playback, and Prime." },
    { title: "Custom Cues", desc: "Add your own voice cues — "Solo section", "Key change", "Tag" — anything." },
    { title: "Batch Process", desc: "Upload a whole setlist. Get every track processed while you grab coffee." },
    { title: "Fine-Tune", desc: "Adjust timing, marker placement, and voice level for each track." },
  ];

  return (
    <section id="features" className="relative py-32 px-6 border-t"
      style={{ borderColor: "rgba(255,255,255,0.06)" }}
    >
      <div className="max-w-6xl mx-auto">
        <h2 
          className="text-2xl md:text-4xl font-light mb-20 text-center"
          style={{ fontFamily: "var(--font-geist)", letterSpacing: "-0.02em" }}
        >
          Features
        </h2>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((f) => (
            <div 
              key={f.title}
              className="p-6 rounded-lg border hover:border-[#4A9D97]/50 transition-colors duration-300"
              style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
            >
              <h3 className="text-sm font-medium mb-2" style={{ fontFamily: "var(--font-geist)" }}>
                {f.title}
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Waitlist CTA ─── */
function Waitlist() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <section id="waitlist" className="relative py-32 px-6"
      style={{ background: "rgba(74, 157, 151, 0.03)" }}
    >
      <div className="max-w-2xl mx-auto text-center">
        <h2 
          className="text-2xl md:text-4xl font-light mb-6"
          style={{ fontFamily: "var(--font-geist)", letterSpacing: "-0.02em" }}
        >
          Join the waitlist
        </h2>
        
        <p className="text-sm mb-10" style={{ color: "rgba(255,255,255,0.4)" }}>
          Be the first to try CueTrack. Early access members get lifetime pricing.
        </p>

        {!submitted ? (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-6 py-3 rounded-full bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm w-80 focus:outline-none focus:border-[#4A9D97] transition-colors"
              style={{ fontFamily: "var(--font-geist)" }}
            />
            <button
              onClick={() => {
                if (email) {
                  setSubmitted(true);
                  // TODO: connect to waitlist API
                }
              }}
              className="px-8 py-3 rounded-full bg-[#4A9D97] text-black text-sm font-medium hover:bg-[#5BB5AF] transition-colors duration-200"
              style={{ fontFamily: "var(--font-geist)" }}
            >
              Get early access
            </button>
          </div>
        ) : (
          <div className="text-[#4A9D97] text-sm" style={{ fontFamily: "var(--font-geist)" }}>
            ✅ You&apos;re on the list. We&apos;ll be in touch.
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Footer ─── */
function Footer() {
  return (
    <footer className="py-8 px-6 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--font-geist)" }}>
          © 2026 CueTrack
        </div>
        <div className="flex items-center gap-6 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          <a href="#" className="hover:text-white transition-colors">Twitter</a>
          <a href="#" className="hover:text-white transition-colors">GitHub</a>
          <a href="#" className="hover:text-white transition-colors">Contact</a>
        </div>
      </div>
    </footer>
  );
}

/* ─── Page ─── */
export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Nav />
      <Hero />
      <HowItWorks />
      <Features />
      <Waitlist />
      <Footer />
    </div>
  );
}

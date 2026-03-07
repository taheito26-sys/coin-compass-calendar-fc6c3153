import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function AuthPage({ onAuth }: { onAuth: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin }
        });
        if (error) throw error;
        setSuccess("Check your email for a confirmation link.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        onAuth();
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    }
    setLoading(false);
  };

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "100vh", background: "var(--bg, #0a0a0a)",
      fontFamily: "var(--lt-font, 'Inter', sans-serif)",
    }}>
      <div style={{
        width: 380, padding: 32,
        background: "var(--panel, #1a1a2e)",
        border: "1px solid var(--line, rgba(255,255,255,.08))",
        borderRadius: "var(--lt-radius, 12px)",
        boxShadow: "0 20px 60px rgba(0,0,0,.4)",
      }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text, #fff)", marginBottom: 4, textAlign: "center" }}>
          CoinCompass
        </h1>
        <p style={{ fontSize: 12, color: "var(--muted, #888)", textAlign: "center", marginBottom: 24 }}>
          {mode === "login" ? "Sign in to sync your portfolio" : "Create your account"}
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            className="inp"
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ padding: "10px 12px", fontSize: 13 }}
          />
          <input
            className="inp"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            style={{ padding: "10px 12px", fontSize: 13 }}
          />
          {error && <div style={{ fontSize: 11, color: "var(--bad, #dc2626)", padding: "6px 8px", background: "rgba(220,38,38,.1)", borderRadius: 6 }}>{error}</div>}
          {success && <div style={{ fontSize: 11, color: "var(--good, #16a34a)", padding: "6px 8px", background: "rgba(22,163,74,.1)", borderRadius: 6 }}>{success}</div>}
          <button className="btn" type="submit" disabled={loading} style={{ padding: "10px 0", fontSize: 13, fontWeight: 700 }}>
            {loading ? "..." : mode === "login" ? "Sign In" : "Sign Up"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
          {mode === "login" ? (
            <>Don't have an account? <button onClick={() => { setMode("signup"); setError(""); setSuccess(""); }} style={{ background: "none", border: "none", color: "var(--brand, #4f46e5)", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Sign Up</button></>
          ) : (
            <>Already have an account? <button onClick={() => { setMode("login"); setError(""); setSuccess(""); }} style={{ background: "none", border: "none", color: "var(--brand, #4f46e5)", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Sign In</button></>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button
            onClick={onAuth}
            style={{ background: "none", border: "none", color: "var(--muted2, #666)", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}
          >
            Continue without account
          </button>
        </div>
      </div>
    </div>
  );
}

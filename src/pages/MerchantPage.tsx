/**
 * MerchantPage — Full merchant platform hub
 * Tabs: Overview, Directory, Invites, Relationships, Deals, Messages, Approvals, Notifications, Audit, Settings
 */
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import * as api from "@/lib/merchantApi";

type MerchantTab = "overview" | "directory" | "invites" | "relationships" | "deals" | "messages" | "approvals" | "notifications" | "audit" | "settings";

const TABS: { id: MerchantTab; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "directory", label: "Directory", icon: "🔍" },
  { id: "invites", label: "Invites", icon: "📨" },
  { id: "relationships", label: "Relationships", icon: "🤝" },
  { id: "deals", label: "Deals", icon: "💰" },
  { id: "messages", label: "Messages", icon: "💬" },
  { id: "approvals", label: "Approvals", icon: "✅" },
  { id: "notifications", label: "Notifications", icon: "🔔" },
  { id: "audit", label: "Audit", icon: "📋" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div style={{
      background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12,
      padding: "16px 20px", flex: "1 1 180px", minWidth: 140,
    }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "var(--good)", pending: "var(--warn)", rejected: "#ef4444",
    accepted: "var(--good)", withdrawn: "var(--muted)", expired: "var(--muted)",
    draft: "var(--muted)", due: "var(--warn)", settled: "var(--good)",
    closed: "var(--muted)", overdue: "#ef4444", cancelled: "var(--muted)",
    approved: "var(--good)", suspended: "#ef4444", terminated: "#ef4444",
  };
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
      background: colors[status] || "var(--muted)", color: "#fff", textTransform: "uppercase",
    }}>{status}</span>
  );
}

// ── Onboarding ──
function MerchantOnboarding({ onCreated }: { onCreated: () => void }) {
  const [nickname, setNickname] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [merchantType, setMerchantType] = useState("independent");
  const [region, setRegion] = useState("");
  const [bio, setBio] = useState("");
  const [discoverability, setDiscoverability] = useState("public");
  const [nickAvailable, setNickAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const checkNick = useCallback(async (v: string) => {
    if (v.length < 3) { setNickAvailable(null); return; }
    try {
      const { available } = await api.checkNickname(v);
      setNickAvailable(available);
    } catch { setNickAvailable(null); }
  }, []);

  const handleSubmit = async () => {
    setLoading(true); setError("");
    try {
      await api.createProfile({ nickname, display_name: displayName, merchant_type: merchantType, region: region || undefined, discoverability, bio: bio || undefined });
      onCreated();
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 24 }}>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Create Your Merchant Profile</h2>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 24 }}>Set up your merchant identity to start collaborating.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Display Name *</label>
          <input className="inputBox" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Taheito Trading" />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>
            Nickname * {nickAvailable === true && <span style={{ color: "var(--good)" }}>✓ Available</span>}
            {nickAvailable === false && <span style={{ color: "#ef4444" }}>✗ Taken</span>}
          </label>
          <input className="inputBox" value={nickname} onChange={e => { setNickname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "")); checkNick(e.target.value); }} placeholder="taheito_trading" />
          <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2 }}>3-30 chars: a-z, 0-9, underscore</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Type</label>
            <select className="inputBox" value={merchantType} onChange={e => setMerchantType(e.target.value)}>
              <option value="independent">Independent</option>
              <option value="desk">Desk</option>
              <option value="partner">Partner</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Region</label>
            <input className="inputBox" value={region} onChange={e => setRegion(e.target.value)} placeholder="Qatar" />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Discoverability</label>
          <select className="inputBox" value={discoverability} onChange={e => setDiscoverability(e.target.value)}>
            <option value="public">Public — searchable by nickname & ID</option>
            <option value="merchant_id_only">Merchant ID only</option>
            <option value="hidden">Hidden — direct connection only</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Bio</label>
          <textarea className="inputBox" value={bio} onChange={e => setBio(e.target.value)} placeholder="Short description..." rows={3} style={{ resize: "vertical" }} />
        </div>
        {error && <div style={{ color: "#ef4444", fontSize: 12 }}>{error}</div>}
        <button className="btn primary" onClick={handleSubmit} disabled={loading || !displayName || !nickname || nickAvailable === false}
          style={{ padding: "10px 20px" }}>
          {loading ? "Creating..." : "Create Merchant Profile"}
        </button>
      </div>
    </div>
  );
}

// ── Overview Tab ──
function OverviewTab({ profile, relationships, deals, unreadCount }: {
  profile: api.MerchantProfile; relationships: api.MerchantRelationship[];
  deals: api.MerchantDeal[]; unreadCount: number;
}) {
  const activeRels = relationships.filter(r => r.status === "active").length;
  const activeDeals = deals.filter(d => ["active", "due"].includes(d.status)).length;
  const totalExposure = deals.filter(d => ["active", "due"].includes(d.status)).reduce((s, d) => s + d.amount, 0);
  const totalRealized = deals.reduce((s, d) => s + (d.realized_pnl || 0), 0);

  return (
    <div>
      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{profile.display_name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>@{profile.nickname}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>Merchant ID</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--brand)", fontFamily: "monospace" }}>{profile.merchant_id}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <StatusBadge status={profile.status} />
          <span style={{ fontSize: 10, color: "var(--muted)", padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.06)" }}>{profile.merchant_type}</span>
          {profile.region && <span style={{ fontSize: 10, color: "var(--muted)", padding: "2px 8px", borderRadius: 999, background: "rgba(255,255,255,0.06)" }}>{profile.region}</span>}
        </div>
        {profile.bio && <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, lineHeight: 1.5 }}>{profile.bio}</p>}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <StatCard label="Active Relationships" value={activeRels} />
        <StatCard label="Active Deals" value={activeDeals} />
        <StatCard label="Active Exposure" value={`$${totalExposure.toLocaleString()}`} accent="var(--warn)" />
        <StatCard label="Realized P&L" value={`$${totalRealized.toLocaleString()}`} accent={totalRealized >= 0 ? "var(--good)" : "#ef4444"} />
        <StatCard label="Unread Notifications" value={unreadCount} accent={unreadCount > 0 ? "var(--warn)" : undefined} />
      </div>
    </div>
  );
}

// ── Directory Tab ──
function DirectoryTab({ myProfile, onInviteSent }: { myProfile: api.MerchantProfile; onInviteSent: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<api.MerchantProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviteTarget, setInviteTarget] = useState<api.MerchantProfile | null>(null);
  const [inviteMsg, setInviteMsg] = useState("");
  const [invitePurpose, setInvitePurpose] = useState("general collaboration");
  const [sending, setSending] = useState(false);

  const doSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const { results: r } = await api.searchMerchants(query);
      setResults(r.filter(m => m.id !== myProfile.id));
    } catch { setResults([]); }
    finally { setSearching(false); }
  };

  const doInvite = async () => {
    if (!inviteTarget) return;
    setSending(true);
    try {
      await api.sendInvite({ to_merchant_id: inviteTarget.id, purpose: invitePurpose, message: inviteMsg || undefined });
      setInviteTarget(null); setInviteMsg(""); onInviteSent();
    } catch (err: any) { alert(err.message); }
    finally { setSending(false); }
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input className="inputBox" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by Merchant ID or nickname..."
          onKeyDown={e => e.key === "Enter" && doSearch()} style={{ flex: 1 }} />
        <button className="btn primary" onClick={doSearch} disabled={searching}>{searching ? "..." : "Search"}</button>
      </div>

      {results.map(m => (
        <div key={m.id} style={{
          background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10,
          padding: 16, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8,
        }}>
          <div>
            <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{m.display_name}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>@{m.nickname} · {m.merchant_id}</div>
            <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2 }}>{m.merchant_type} · {m.region || "—"}</div>
          </div>
          <button className="btn primary" onClick={() => setInviteTarget(m)} style={{ fontSize: 11, padding: "6px 14px" }}>
            Send Invite
          </button>
        </div>
      ))}

      {inviteTarget && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", zIndex: 1000,
        }} onClick={() => setInviteTarget(null)}>
          <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 16, padding: 24, width: "min(440px, 90vw)" }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ color: "var(--text)", fontSize: 16, marginBottom: 16 }}>Invite {inviteTarget.display_name}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Purpose</label>
                <input className="inputBox" value={invitePurpose} onChange={e => setInvitePurpose(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Message</label>
                <textarea className="inputBox" value={inviteMsg} onChange={e => setInviteMsg(e.target.value)} rows={3} placeholder="Introduce yourself..." />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn secondary" onClick={() => setInviteTarget(null)}>Cancel</button>
                <button className="btn primary" onClick={doInvite} disabled={sending}>{sending ? "Sending..." : "Send Invite"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Invites Tab ──
function InvitesTab({ onAction }: { onAction: () => void }) {
  const [inbox, setInbox] = useState<api.MerchantInvite[]>([]);
  const [sent, setSent] = useState<api.MerchantInvite[]>([]);
  const [view, setView] = useState<"inbox" | "sent">("inbox");

  useEffect(() => { api.fetchInbox().then(r => setInbox(r.invites)).catch(() => {}); }, []);
  useEffect(() => { api.fetchSentInvites().then(r => setSent(r.invites)).catch(() => {}); }, []);

  const handleAccept = async (id: string) => {
    try { await api.acceptInvite(id); onAction(); api.fetchInbox().then(r => setInbox(r.invites)); } catch (e: any) { alert(e.message); }
  };
  const handleReject = async (id: string) => {
    try { await api.rejectInvite(id); api.fetchInbox().then(r => setInbox(r.invites)); } catch (e: any) { alert(e.message); }
  };
  const handleWithdraw = async (id: string) => {
    try { await api.withdrawInvite(id); api.fetchSentInvites().then(r => setSent(r.invites)); } catch (e: any) { alert(e.message); }
  };

  const list = view === "inbox" ? inbox : sent;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={`btn ${view === "inbox" ? "primary" : "secondary"}`} onClick={() => setView("inbox")} style={{ fontSize: 11 }}>
          Inbox ({inbox.filter(i => i.status === "pending").length})
        </button>
        <button className={`btn ${view === "sent" ? "primary" : "secondary"}`} onClick={() => setView("sent")} style={{ fontSize: 11 }}>
          Sent ({sent.filter(i => i.status === "pending").length})
        </button>
      </div>

      {list.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: 40 }}>No invites</div>}
      {list.map(inv => (
        <div key={inv.id} style={{
          background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10,
          padding: 16, marginBottom: 8,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>
                {view === "inbox" ? (inv.from_display_name || inv.from_merchant_id) : (inv.to_display_name || inv.to_merchant_id)}
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>
                {inv.purpose || "General collaboration"} · Role: {inv.requested_role}
              </div>
              {inv.message && <div style={{ fontSize: 11, color: "var(--muted2)", marginTop: 4, fontStyle: "italic" }}>"{inv.message}"</div>}
              <div style={{ fontSize: 9, color: "var(--muted2)", marginTop: 4 }}>{new Date(inv.created_at).toLocaleDateString()}</div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <StatusBadge status={inv.status} />
              {view === "inbox" && inv.status === "pending" && (
                <>
                  <button className="btn primary" onClick={() => handleAccept(inv.id)} style={{ fontSize: 10, padding: "4px 10px" }}>Accept</button>
                  <button className="btn secondary" onClick={() => handleReject(inv.id)} style={{ fontSize: 10, padding: "4px 10px" }}>Reject</button>
                </>
              )}
              {view === "sent" && inv.status === "pending" && (
                <button className="btn secondary" onClick={() => handleWithdraw(inv.id)} style={{ fontSize: 10, padding: "4px 10px" }}>Withdraw</button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Relationships Tab ──
function RelationshipsTab({ relationships, onSelect }: { relationships: api.MerchantRelationship[]; onSelect: (id: string) => void }) {
  return (
    <div>
      {relationships.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: 40 }}>No relationships yet. Send invites from the Directory.</div>}
      {relationships.map(rel => {
        const counterparty = rel.my_role === "owner"
          ? { name: rel.b_display_name, nick: rel.b_nickname, code: rel.b_merchant_code }
          : { name: rel.a_display_name, nick: rel.a_nickname, code: rel.a_merchant_code };
        return (
          <div key={rel.id} onClick={() => onSelect(rel.id)} style={{
            background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10,
            padding: 16, marginBottom: 8, cursor: "pointer", transition: "border-color .15s",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>{counterparty.name}</div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>@{counterparty.nick} · {counterparty.code}</div>
                <div style={{ fontSize: 10, color: "var(--muted2)", marginTop: 2 }}>{rel.relationship_type} · Your role: {rel.my_role}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <StatusBadge status={rel.status} />
                <div style={{ fontSize: 9, color: "var(--muted2)" }}>{new Date(rel.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Relationship Workspace ──
function RelationshipWorkspace({ relId, onBack }: { relId: string; onBack: () => void }) {
  const [rel, setRel] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [deals, setDeals] = useState<api.MerchantDeal[]>([]);
  const [messages, setMessages] = useState<api.MerchantMessage[]>([]);
  const [auditLogs, setAuditLogs] = useState<api.AuditLog[]>([]);
  const [wsTab, setWsTab] = useState<"overview" | "deals" | "messages" | "audit">("overview");
  const [msgInput, setMsgInput] = useState("");
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [newDeal, setNewDeal] = useState({ deal_type: "lending", title: "", amount: 0, currency: "USDT", due_date: "" });

  const load = useCallback(async () => {
    try {
      const r = await api.fetchRelationship(relId);
      setRel(r.relationship); setSummary(r.summary);
      const d = await api.fetchDeals(relId); setDeals(d.deals);
      const m = await api.fetchMessages(relId); setMessages(m.messages);
      const a = await api.fetchRelAudit(relId); setAuditLogs(a.logs);
    } catch {}
  }, [relId]);

  useEffect(() => { load(); }, [load]);

  const sendMsg = async () => {
    if (!msgInput.trim()) return;
    try { await api.sendMessage(relId, msgInput); setMsgInput(""); load(); } catch {}
  };

  const handleCreateDeal = async () => {
    try {
      await api.createDeal({ relationship_id: relId, ...newDeal, due_date: newDeal.due_date || undefined });
      setShowNewDeal(false); setNewDeal({ deal_type: "lending", title: "", amount: 0, currency: "USDT", due_date: "" });
      load();
    } catch (e: any) { alert(e.message); }
  };

  const handleSettlement = async (dealId: string) => {
    const amount = prompt("Settlement amount:");
    if (!amount) return;
    try {
      await api.submitSettlement(dealId, { paid_amount: parseFloat(amount), paid_date: new Date().toISOString().slice(0, 10) });
      load();
    } catch (e: any) { alert(e.message); }
  };

  const handleActivateDeal = async (dealId: string) => {
    try { await api.updateDeal(dealId, { status: "active" } as any); load(); } catch (e: any) { alert(e.message); }
  };

  if (!rel) return <div style={{ color: "var(--muted)", padding: 40, textAlign: "center" }}>Loading...</div>;

  const WS_TABS = [
    { id: "overview", label: "Overview" }, { id: "deals", label: "Deals" },
    { id: "messages", label: "Messages" }, { id: "audit", label: "Audit" },
  ];

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--brand)", cursor: "pointer", fontSize: 12, marginBottom: 12 }}>
        ← Back to Relationships
      </button>

      <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontWeight: 700, color: "var(--text)", fontSize: 16 }}>
              {rel.a_display_name} ↔ {rel.b_display_name}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{rel.relationship_type} · <StatusBadge status={rel.status} /></div>
          </div>
        </div>
        {summary && (
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
            <StatCard label="Deals" value={summary.totalDeals} />
            <StatCard label="Active Exposure" value={`$${(summary.activeExposure || 0).toLocaleString()}`} accent="var(--warn)" />
            <StatCard label="Realized P&L" value={`$${(summary.realizedProfit || 0).toLocaleString()}`} accent="var(--good)" />
            <StatCard label="Pending Approvals" value={summary.pendingApprovals} accent={summary.pendingApprovals > 0 ? "var(--warn)" : undefined} />
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
        {WS_TABS.map(t => (
          <button key={t.id} className={`btn ${wsTab === t.id ? "primary" : "secondary"}`} onClick={() => setWsTab(t.id as any)}
            style={{ fontSize: 11, padding: "6px 14px" }}>{t.label}</button>
        ))}
      </div>

      {wsTab === "overview" && (
        <div style={{ color: "var(--muted)", fontSize: 13 }}>
          <p>Relationship created on {new Date(rel.created_at).toLocaleDateString()}</p>
        </div>
      )}

      {wsTab === "deals" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>Deals</div>
            <button className="btn primary" onClick={() => setShowNewDeal(true)} style={{ fontSize: 11, padding: "6px 14px" }}>+ New Deal</button>
          </div>

          {showNewDeal && (
            <div style={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 16, marginBottom: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <label style={{ fontSize: 10, color: "var(--muted)" }}>Type</label>
                  <select className="inputBox" value={newDeal.deal_type} onChange={e => setNewDeal(d => ({ ...d, deal_type: e.target.value }))}>
                    <option value="lending">Lending</option><option value="arbitrage">Arbitrage</option>
                    <option value="partnership">Partnership</option><option value="capital_placement">Capital Placement</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, color: "var(--muted)" }}>Title</label>
                  <input className="inputBox" value={newDeal.title} onChange={e => setNewDeal(d => ({ ...d, title: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: "var(--muted)" }}>Amount</label>
                  <input className="inputBox" type="number" value={newDeal.amount} onChange={e => setNewDeal(d => ({ ...d, amount: +e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 10, color: "var(--muted)" }}>Due Date</label>
                  <input className="inputBox" type="date" value={newDeal.due_date} onChange={e => setNewDeal(d => ({ ...d, due_date: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button className="btn secondary" onClick={() => setShowNewDeal(false)}>Cancel</button>
                <button className="btn primary" onClick={handleCreateDeal} disabled={!newDeal.title || !newDeal.amount}>Create</button>
              </div>
            </div>
          )}

          {deals.length === 0 && <div style={{ color: "var(--muted)", fontSize: 12, textAlign: "center", padding: 20 }}>No deals yet</div>}
          {deals.map(d => (
            <div key={d.id} style={{
              background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10,
              padding: 14, marginBottom: 8,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{d.title}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>
                    {d.deal_type} · {d.currency} {d.amount.toLocaleString()} · {d.due_date ? `Due: ${d.due_date}` : "No due date"}
                  </div>
                  {d.realized_pnl != null && <div style={{ fontSize: 10, color: d.realized_pnl >= 0 ? "var(--good)" : "#ef4444" }}>P&L: ${d.realized_pnl.toLocaleString()}</div>}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <StatusBadge status={d.status} />
                  {d.status === "draft" && <button className="btn primary" onClick={() => handleActivateDeal(d.id)} style={{ fontSize: 9, padding: "3px 8px" }}>Activate</button>}
                  {["active", "due", "overdue"].includes(d.status) && (
                    <button className="btn secondary" onClick={() => handleSettlement(d.id)} style={{ fontSize: 9, padding: "3px 8px" }}>Settle</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {wsTab === "messages" && (
        <div>
          <div style={{
            background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10,
            padding: 12, maxHeight: 400, overflowY: "auto", marginBottom: 12,
          }}>
            {messages.length === 0 && <div style={{ color: "var(--muted)", fontSize: 12, textAlign: "center", padding: 20 }}>No messages yet</div>}
            {messages.map(m => (
              <div key={m.id} style={{
                padding: "8px 0", borderBottom: "1px solid var(--line2)",
                opacity: m.message_type === "system" ? 0.6 : 1,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
                  <span style={{ fontWeight: 600, color: "var(--text)" }}>{m.sender_name || m.sender_merchant_id}</span>
                  <span style={{ color: "var(--muted2)" }}>{new Date(m.created_at).toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 12, color: m.message_type === "system" ? "var(--muted)" : "var(--text)", marginTop: 4 }}>{m.body}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="inputBox" value={msgInput} onChange={e => setMsgInput(e.target.value)} placeholder="Type a message..."
              onKeyDown={e => e.key === "Enter" && sendMsg()} style={{ flex: 1 }} />
            <button className="btn primary" onClick={sendMsg} style={{ fontSize: 11 }}>Send</button>
          </div>
        </div>
      )}

      {wsTab === "audit" && (
        <div>
          {auditLogs.length === 0 && <div style={{ color: "var(--muted)", fontSize: 12, textAlign: "center", padding: 20 }}>No audit entries</div>}
          {auditLogs.map(log => (
            <div key={log.id} style={{
              background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8,
              padding: 10, marginBottom: 6, fontSize: 11,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 600, color: "var(--text)" }}>{log.action} {log.entity_type}</span>
                <span style={{ color: "var(--muted2)", fontSize: 9 }}>{new Date(log.created_at).toLocaleString()}</span>
              </div>
              {log.actor_name && <div style={{ fontSize: 10, color: "var(--muted)" }}>By: {log.actor_name}</div>}
              {log.note && <div style={{ fontSize: 10, color: "var(--muted2)", fontStyle: "italic" }}>{log.note}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Approvals Tab ──
function ApprovalsTab({ onAction }: { onAction: () => void }) {
  const [inbox, setInbox] = useState<api.MerchantApproval[]>([]);
  const [sent, setSent] = useState<api.MerchantApproval[]>([]);
  const [view, setView] = useState<"inbox" | "sent">("inbox");

  useEffect(() => { api.fetchApprovalInbox().then(r => setInbox(r.approvals)).catch(() => {}); }, []);
  useEffect(() => { api.fetchSentApprovals().then(r => setSent(r.approvals)).catch(() => {}); }, []);

  const handleApprove = async (id: string) => {
    const note = prompt("Approval note (optional):");
    try { await api.approveRequest(id, note || undefined); onAction(); api.fetchApprovalInbox().then(r => setInbox(r.approvals)); } catch (e: any) { alert(e.message); }
  };
  const handleReject = async (id: string) => {
    const note = prompt("Rejection reason:");
    try { await api.rejectRequest(id, note || undefined); api.fetchApprovalInbox().then(r => setInbox(r.approvals)); } catch (e: any) { alert(e.message); }
  };

  const list = view === "inbox" ? inbox : sent;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className={`btn ${view === "inbox" ? "primary" : "secondary"}`} onClick={() => setView("inbox")} style={{ fontSize: 11 }}>
          Inbox ({inbox.filter(a => a.status === "pending").length})
        </button>
        <button className={`btn ${view === "sent" ? "primary" : "secondary"}`} onClick={() => setView("sent")} style={{ fontSize: 11 }}>Sent</button>
      </div>

      {list.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: 40 }}>No approval requests</div>}
      {list.map(a => (
        <div key={a.id} style={{
          background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 8,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{a.type.replace(/_/g, " ")}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>
                {a.submitter_name || a.submitted_by_merchant_id} · {new Date(a.submitted_at).toLocaleDateString()}
              </div>
              {a.resolution_note && <div style={{ fontSize: 10, color: "var(--muted2)", fontStyle: "italic", marginTop: 2 }}>{a.resolution_note}</div>}
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <StatusBadge status={a.status} />
              {view === "inbox" && a.status === "pending" && (
                <>
                  <button className="btn primary" onClick={() => handleApprove(a.id)} style={{ fontSize: 10, padding: "4px 10px" }}>Approve</button>
                  <button className="btn secondary" onClick={() => handleReject(a.id)} style={{ fontSize: 10, padding: "4px 10px" }}>Reject</button>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Notifications Tab ──
function NotificationsTab() {
  const [notifs, setNotifs] = useState<api.MerchantNotification[]>([]);

  useEffect(() => { api.fetchNotifications().then(r => setNotifs(r.notifications)).catch(() => {}); }, []);

  const markRead = async (id: string) => {
    await api.markNotificationRead(id);
    setNotifs(n => n.map(x => x.id === id ? { ...x, read_at: new Date().toISOString() } : x));
  };
  const markAll = async () => {
    await api.markAllRead();
    setNotifs(n => n.map(x => ({ ...x, read_at: x.read_at || new Date().toISOString() })));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button className="btn secondary" onClick={markAll} style={{ fontSize: 10 }}>Mark all read</button>
      </div>
      {notifs.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: 40 }}>No notifications</div>}
      {notifs.map(n => (
        <div key={n.id} onClick={() => !n.read_at && markRead(n.id)} style={{
          background: n.read_at ? "var(--panel)" : "rgba(59,130,246,0.06)",
          border: `1px solid ${n.read_at ? "var(--line)" : "rgba(59,130,246,0.2)"}`,
          borderRadius: 8, padding: 12, marginBottom: 6, cursor: n.read_at ? "default" : "pointer",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
            <span style={{ fontWeight: 600, color: "var(--text)" }}>{n.title}</span>
            <span style={{ color: "var(--muted2)" }}>{new Date(n.created_at).toLocaleString()}</span>
          </div>
          {n.body && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{n.body}</div>}
          <span style={{ fontSize: 9, color: "var(--muted2)", textTransform: "uppercase" }}>{n.category}</span>
        </div>
      ))}
    </div>
  );
}

// ── Settings Tab ──
function MerchantSettingsTab({ profile, onSave }: { profile: api.MerchantProfile; onSave: () => void }) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio || "");
  const [discoverability, setDiscoverability] = useState(profile.discoverability);
  const [region, setRegion] = useState(profile.region || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateProfile({ display_name: displayName, bio, discoverability, region });
      onSave();
    } catch (e: any) { alert(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Merchant ID</label>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--brand)", fontFamily: "monospace" }}>{profile.merchant_id}</div>
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Nickname (immutable)</label>
          <div style={{ fontSize: 13, color: "var(--text)" }}>@{profile.nickname}</div>
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Display Name</label>
          <input className="inputBox" value={displayName} onChange={e => setDisplayName(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Region</label>
          <input className="inputBox" value={region} onChange={e => setRegion(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Discoverability</label>
          <select className="inputBox" value={discoverability} onChange={e => setDiscoverability(e.target.value)}>
            <option value="public">Public</option>
            <option value="merchant_id_only">Merchant ID only</option>
            <option value="hidden">Hidden</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 4 }}>Bio</label>
          <textarea className="inputBox" value={bio} onChange={e => setBio(e.target.value)} rows={3} />
        </div>
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Changes"}</button>
      </div>
    </div>
  );
}

// ── Audit Tab ──
function AuditTab() {
  const [logs, setLogs] = useState<api.AuditLog[]>([]);
  useEffect(() => { api.fetchMyActivity().then(r => setLogs(r.logs)).catch(() => {}); }, []);

  return (
    <div>
      {logs.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: 40 }}>No activity yet</div>}
      {logs.map(log => (
        <div key={log.id} style={{
          background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8,
          padding: 10, marginBottom: 6, fontSize: 11,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 600, color: "var(--text)", textTransform: "capitalize" }}>{log.action} {log.entity_type}</span>
            <span style={{ color: "var(--muted2)", fontSize: 9 }}>{new Date(log.created_at).toLocaleString()}</span>
          </div>
          {log.note && <div style={{ fontSize: 10, color: "var(--muted2)", fontStyle: "italic", marginTop: 2 }}>{log.note}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Main Page ──
export default function MerchantPage() {
  const { isSignedIn } = useAuth();
  const [profile, setProfile] = useState<api.MerchantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<MerchantTab>("overview");
  const [relationships, setRelationships] = useState<api.MerchantRelationship[]>([]);
  const [deals, setDeals] = useState<api.MerchantDeal[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedRelId, setSelectedRelId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const { profile: p } = await api.fetchMyProfile();
      setProfile(p);
      if (p) {
        const [rels, d, n] = await Promise.all([
          api.fetchRelationships(), api.fetchDeals(), api.fetchUnreadCount(),
        ]);
        setRelationships(rels.relationships);
        setDeals(d.deals);
        setUnreadCount(n.unread);
      }
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isSignedIn) loadAll(); }, [isSignedIn, loadAll]);

  // Polling every 15s
  useEffect(() => {
    if (!profile) return;
    const iv = setInterval(() => {
      api.fetchUnreadCount().then(r => setUnreadCount(r.unread)).catch(() => {});
    }, 15000);
    return () => clearInterval(iv);
  }, [profile]);

  if (loading) return <div style={{ color: "var(--muted)", padding: 40, textAlign: "center" }}>Loading...</div>;
  if (!profile) return <MerchantOnboarding onCreated={loadAll} />;

  if (selectedRelId) {
    return <RelationshipWorkspace relId={selectedRelId} onBack={() => { setSelectedRelId(null); loadAll(); }} />;
  }

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Tab bar */}
      <div style={{
        display: "flex", gap: 2, overflowX: "auto", marginBottom: 20,
        borderBottom: "1px solid var(--line)", paddingBottom: 8,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? "var(--brand)" : "transparent",
              color: tab === t.id ? "#fff" : "var(--muted)",
              border: "none", borderRadius: 8, padding: "6px 12px",
              fontSize: 11, fontWeight: tab === t.id ? 700 : 400,
              cursor: "pointer", whiteSpace: "nowrap", transition: "all .15s",
              display: "flex", alignItems: "center", gap: 4,
            }}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {t.id === "notifications" && unreadCount > 0 && (
              <span style={{ background: "#ef4444", color: "#fff", fontSize: 8, fontWeight: 900, borderRadius: 999, padding: "1px 5px" }}>{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab profile={profile} relationships={relationships} deals={deals} unreadCount={unreadCount} />}
      {tab === "directory" && <DirectoryTab myProfile={profile} onInviteSent={loadAll} />}
      {tab === "invites" && <InvitesTab onAction={loadAll} />}
      {tab === "relationships" && <RelationshipsTab relationships={relationships} onSelect={setSelectedRelId} />}
      {tab === "deals" && (
        <div>
          {deals.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: 40 }}>No deals. Open a relationship to create deals.</div>}
          {deals.map(d => (
            <div key={d.id} style={{
              background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 8,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 13 }}>{d.title}</div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>{d.deal_type} · {d.currency} {d.amount.toLocaleString()}</div>
                </div>
                <StatusBadge status={d.status} />
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === "messages" && <div style={{ color: "var(--muted)", fontSize: 13, textAlign: "center", padding: 40 }}>Select a relationship to view messages.</div>}
      {tab === "approvals" && <ApprovalsTab onAction={loadAll} />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "settings" && <MerchantSettingsTab profile={profile} onSave={loadAll} />}
    </div>
  );
}

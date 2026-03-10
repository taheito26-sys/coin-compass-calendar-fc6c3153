/**
 * merchantApi.ts — Frontend API client for the Merchant Platform
 */

const WORKER_BASE = import.meta.env.VITE_WORKER_API_URL || "";

async function getAuthToken(): Promise<string | null> {
  try {
    return (await (window as any).Clerk?.session?.getToken()) || null;
  } catch { return null; }
}

async function mFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(`${WORKER_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as any).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Profile ──
export interface MerchantProfile {
  id: string; owner_user_id: string; merchant_id: string; nickname: string;
  display_name: string; merchant_type: string; region: string | null;
  default_currency: string; discoverability: string; bio: string | null;
  status: string; created_at: string; updated_at: string;
}

export const fetchMyProfile = () => mFetch<{ profile: MerchantProfile | null }>("/api/merchant/profile/me");

export const createProfile = (data: {
  nickname: string; display_name: string; merchant_type?: string;
  region?: string; default_currency?: string; discoverability?: string; bio?: string;
}) => mFetch<{ profile: MerchantProfile }>("/api/merchant/profile", { method: "POST", body: JSON.stringify(data) });

export const updateProfile = (data: Partial<{
  display_name: string; merchant_type: string; region: string;
  default_currency: string; discoverability: string; bio: string;
}>) => mFetch<{ profile: MerchantProfile }>("/api/merchant/profile/me", { method: "PATCH", body: JSON.stringify(data) });

export const fetchProfile = (merchantId: string) =>
  mFetch<{ profile: MerchantProfile }>(`/api/merchant/profile/${merchantId}`);

export const searchMerchants = (q: string) =>
  mFetch<{ results: MerchantProfile[] }>(`/api/merchant/search?q=${encodeURIComponent(q)}`);

export const checkNickname = (nickname: string) =>
  mFetch<{ available: boolean }>(`/api/merchant/check-nickname?nickname=${encodeURIComponent(nickname)}`);

// ── Invites ──
export interface MerchantInvite {
  id: string; from_merchant_id: string; to_merchant_id: string;
  status: string; purpose: string | null; requested_role: string;
  message: string | null; requested_scope: string | null;
  expires_at: string | null; created_at: string; updated_at: string;
  from_display_name?: string; from_nickname?: string; from_merchant_code?: string;
  to_display_name?: string; to_nickname?: string; to_merchant_code?: string;
}

export const sendInvite = (data: {
  to_merchant_id: string; purpose?: string; requested_role?: string;
  message?: string; requested_scope?: string[];
}) => mFetch<{ invite: MerchantInvite }>("/api/merchant/invites", { method: "POST", body: JSON.stringify(data) });

export const fetchInbox = () => mFetch<{ invites: MerchantInvite[] }>("/api/merchant/invites/inbox");
export const fetchSentInvites = () => mFetch<{ invites: MerchantInvite[] }>("/api/merchant/invites/sent");
export const acceptInvite = (id: string) => mFetch<{ relationship_id: string }>(`/api/merchant/invites/${id}/accept`, { method: "POST", body: "{}" });
export const rejectInvite = (id: string, reason?: string) => mFetch(`/api/merchant/invites/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) });
export const withdrawInvite = (id: string) => mFetch(`/api/merchant/invites/${id}/withdraw`, { method: "POST", body: "{}" });

// ── Relationships ──
export interface MerchantRelationship {
  id: string; merchant_a_id: string; merchant_b_id: string;
  relationship_type: string; status: string;
  a_display_name?: string; a_nickname?: string; a_merchant_code?: string;
  b_display_name?: string; b_nickname?: string; b_merchant_code?: string;
  my_role?: string; created_at: string; updated_at: string;
}

export const fetchRelationships = () => mFetch<{ relationships: MerchantRelationship[] }>("/api/merchant/relationships");
export const fetchRelationship = (id: string) => mFetch<{
  relationship: MerchantRelationship; roles: any[]; summary: {
    totalDeals: number; activeExposure: number; realizedProfit: number; pendingApprovals: number;
  };
}>(`/api/merchant/relationships/${id}`);
export const updateRelSettings = (id: string, data: any) =>
  mFetch(`/api/merchant/relationships/${id}/settings`, { method: "PATCH", body: JSON.stringify(data) });
export const suspendRelationship = (id: string) =>
  mFetch(`/api/merchant/relationships/${id}/suspend`, { method: "POST", body: "{}" });
export const terminateRelationship = (id: string) =>
  mFetch(`/api/merchant/relationships/${id}/terminate`, { method: "POST", body: "{}" });

// ── Deals ──
export interface MerchantDeal {
  id: string; relationship_id: string; deal_type: string; title: string;
  amount: number; currency: string; status: string; metadata: string | null;
  issue_date: string | null; due_date: string | null; close_date: string | null;
  expected_return: number | null; realized_pnl: number | null;
  created_by: string; created_at: string; updated_at: string;
}

export const fetchDeals = (relId?: string) =>
  mFetch<{ deals: MerchantDeal[] }>(`/api/merchant/deals${relId ? `?relationship_id=${relId}` : ""}`);
export const createDeal = (data: {
  relationship_id: string; deal_type: string; title: string; amount: number;
  currency?: string; issue_date?: string; due_date?: string; expected_return?: number;
}) => mFetch<{ deal: MerchantDeal }>("/api/merchant/deals", { method: "POST", body: JSON.stringify(data) });
export const updateDeal = (id: string, data: Partial<MerchantDeal>) =>
  mFetch<{ deal: MerchantDeal }>(`/api/merchant/deals/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const submitSettlement = (dealId: string, data: { paid_amount: number; paid_date: string; variance_note?: string }) =>
  mFetch<{ settlement_id: string; approval_id: string }>(`/api/merchant/deals/${dealId}/submit-settlement`, { method: "POST", body: JSON.stringify(data) });
export const recordProfit = (dealId: string, data: {
  period: string; gross_profit: number; net_distributable: number;
  share_a?: number; share_b?: number; note?: string;
}) => mFetch<{ profit_id: string; approval_id: string }>(`/api/merchant/deals/${dealId}/record-profit`, { method: "POST", body: JSON.stringify(data) });
export const closeDeal = (dealId: string, data?: { realized_pnl?: number; note?: string }) =>
  mFetch<{ approval_id: string }>(`/api/merchant/deals/${dealId}/close`, { method: "POST", body: JSON.stringify(data || {}) });

// ── Messages ──
export interface MerchantMessage {
  id: string; relationship_id: string; sender_user_id: string;
  sender_merchant_id: string; message_type: string; body: string;
  sender_name?: string; sender_nickname?: string;
  read_by: string | null; created_at: string;
}

export const fetchMessages = (relId: string, limit = 50, offset = 0) =>
  mFetch<{ messages: MerchantMessage[] }>(`/api/merchant/messages/${relId}/messages?limit=${limit}&offset=${offset}`);
export const sendMessage = (relId: string, body: string) =>
  mFetch<{ message: MerchantMessage }>(`/api/merchant/messages/${relId}/messages`, { method: "POST", body: JSON.stringify({ body }) });

// ── Approvals ──
export interface MerchantApproval {
  id: string; relationship_id: string; type: string;
  target_entity_type: string | null; target_entity_id: string | null;
  proposed_payload: string | null; status: string;
  submitted_by_user_id: string; submitted_by_merchant_id: string;
  submitter_name?: string; submitter_nickname?: string;
  resolution_note: string | null; submitted_at: string; resolved_at: string | null;
}

export const fetchApprovalInbox = () => mFetch<{ approvals: MerchantApproval[] }>("/api/merchant/approvals/inbox");
export const fetchSentApprovals = () => mFetch<{ approvals: MerchantApproval[] }>("/api/merchant/approvals/sent");
export const approveRequest = (id: string, note?: string) =>
  mFetch<{ ok: boolean }>(`/api/merchant/approvals/${id}/approve`, { method: "POST", body: JSON.stringify({ note }) });
export const rejectRequest = (id: string, note?: string) =>
  mFetch<{ ok: boolean }>(`/api/merchant/approvals/${id}/reject`, { method: "POST", body: JSON.stringify({ note }) });

// ── Audit ──
export interface AuditLog {
  id: string; actor_user_id: string; actor_merchant_id: string | null;
  entity_type: string; entity_id: string; action: string;
  before_state: string | null; after_state: string | null;
  note: string | null; actor_name?: string; created_at: string;
}

export const fetchRelAudit = (relId: string) =>
  mFetch<{ logs: AuditLog[] }>(`/api/merchant/audit/relationship/${relId}`);
export const fetchMyActivity = () =>
  mFetch<{ logs: AuditLog[] }>("/api/merchant/audit/activity");

// ── Notifications ──
export interface MerchantNotification {
  id: string; user_id: string; merchant_id: string | null;
  category: string; title: string; body: string | null;
  link_type: string | null; link_id: string | null;
  read_at: string | null; created_at: string;
}

export const fetchNotifications = (limit = 50) =>
  mFetch<{ notifications: MerchantNotification[] }>(`/api/merchant/notifications?limit=${limit}`);
export const fetchUnreadCount = () =>
  mFetch<{ unread: number }>("/api/merchant/notifications/count");
export const markNotificationRead = (id: string) =>
  mFetch(`/api/merchant/notifications/${id}/read`, { method: "POST", body: "{}" });
export const markAllRead = () =>
  mFetch("/api/merchant/notifications/read-all", { method: "POST", body: "{}" });

import React, { createContext, useContext, useEffect, useMemo, useState, useRef } from "react";
import { apiJson } from "@/lib/api.js";
import { clearUserSyncArtefacts } from "@/lib/syncDb.js";

const AuthCtx = createContext(null);

// localStorage key for storing last known user ID
const LAST_KNOWN_USER_ID_KEY = "tradecrm:lastKnownUserId";

/**
 * Get the last known user ID from localStorage
 */
export function getLastKnownUserId() {
  try {
    return localStorage.getItem(LAST_KNOWN_USER_ID_KEY);
  } catch {
    return null;
  }
}

/**
 * Store the last known user ID to localStorage
 */
function setLastKnownUserId(userId) {
  try {
    if (userId) {
      localStorage.setItem(LAST_KNOWN_USER_ID_KEY, userId);
    }
  } catch {}
}

/**
 * Remove the last known user ID from localStorage. Called on explicit logout
 * so the next user on the same device doesn't see the previous user's id.
 */
function clearLastKnownUserId() {
  try {
    localStorage.removeItem(LAST_KNOWN_USER_ID_KEY);
  } catch {}
}

/**
 * Detect network/connectivity errors (as opposed to auth errors like 401/403).
 * Used to avoid resetting user state on transient VPN/network disruptions.
 */
function isNetworkError(e) {
  if (!e) return true;
  if (e.status === 401 || e.status === 403) return false;
  if (!e.status || e.status === 0) return true;
  const msg = e.message || "";
  return msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Load failed");
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null); // Last auth error (network, blocked, or auth failure)

  const refresh = async () => {
    setLoading(true);
    try {
      const me = await apiJson("/api/auth/me");
      const fetchedUser = me?.user ?? null;
      setUser(fetchedUser);
      setAuthError(null);
      
      // Store last known user ID on successful auth
      if (fetchedUser?.id) {
        setLastKnownUserId(fetchedUser.id);
      }
    } catch (e) {
      if (isNetworkError(e) && user) {
        // Network error (VPN drop, timeout, etc.) — do NOT reset user.
        // Resetting user to null causes userId oscillation which triggers
        // the sync-reset cascade that wipes trades (see syncDb.js).
        setAuthError({
          code: "NETWORK_ERROR",
          status: 0,
          message: e?.message || "Network error",
        });
      } else {
        // Genuine auth error (401/403) or no user was set yet — reset
        setUser(null);
        setAuthError({
          code: e?.code || (e?.status === 0 ? "NETWORK_ERROR" : "AUTH_ERROR"),
          status: e?.status || 0,
          message: e?.message || "Auth failed",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  /**
   * Login function - returns user on success, or { requires2fa, ticket, expires_at } if 2FA is needed
   */
  const login = async ({ username, password, remember }) => {
    const res = await apiJson("/api/auth/login", {
      method: "POST",
      body: { username, password, remember: !!remember },
    });
    // Check if 2FA is required
    if (res?.requires2fa) {
      return { requires2fa: true, ticket: res.ticket, expires_at: res.expires_at };
    }
    const loggedInUser = res?.user ?? null;
    setUser(loggedInUser);
    setAuthError(null);
    // Store last known user ID on successful login
    if (loggedInUser?.id) {
      setLastKnownUserId(loggedInUser.id);
    }
    // Re-fetch /api/auth/me to confirm the session cookie is working.
    // This catches cases where stale duplicate cookies shadow the new one.
    try { await refresh(); } catch { /* refresh sets its own error state */ }
    return { user: loggedInUser };
  };

  /**
   * Complete 2FA login with ticket and code
   */
  const verify2faLogin = async (ticket, code) => {
    const res = await apiJson("/api/auth/2fa/verify-login", {
      method: "POST",
      body: { ticket, code },
    });
    const loggedInUser = res?.user ?? null;
    setUser(loggedInUser);
    setAuthError(null);
    // Store last known user ID on successful 2FA login
    if (loggedInUser?.id) {
      setLastKnownUserId(loggedInUser.id);
    }
    // Re-fetch to confirm the session cookie is working
    try { await refresh(); } catch { /* refresh sets its own error state */ }
    return loggedInUser;
  };

  const logout = async () => {
    // Snapshot the userId BEFORE the network call so we can clean per-user
    // artefacts even if the request fails.
    const userIdToClean = user?.id ?? getLastKnownUserId();
    try { await apiJson("/api/auth/logout", { method: "POST" }); } catch {}
    // Drop per-user outbox / lastSynced / cached state so the next user
    // on this device can't see or replay the previous user's data.
    clearUserSyncArtefacts(userIdToClean);
    clearLastKnownUserId();
    setUser(null);
  };

  const changePassword = async ({ oldPassword, newPassword }) => {
    await apiJson("/api/auth/change-password", {
      method: "POST",
      body: { oldPassword, newPassword },
    });
    return true;
  };
  const verifyPassword = async ({ password }) => {
    await apiJson("/api/auth/verify-password", {
      method: "POST",
      body: { password },
    });
    return true;
  };

  const updateDisplayName = async (displayName) => {
    const res = await apiJson("/api/auth/display-name", {
      method: "PATCH",
      body: { displayName },
    });
    // Refresh user to update display name in context
    if (res?.ok && res?.user) {
      setUser(res.user);
    }
    return res;
  };

  const updateUsername = async (username) => {
    const res = await apiJson("/api/auth/username", {
      method: "PATCH",
      body: { username },
    });
    if (res?.ok && res?.user) {
      setUser(res.user);
    }
    return res;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 2FA Management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start 2FA setup - returns { qr_data_url, otpauth_url }
   */
  const setup2fa = async () => {
    return apiJson("/api/auth/2fa/setup", { method: "POST" });
  };

  /**
   * Enable 2FA by verifying code - returns { ok, backup_codes }
   */
  const enable2fa = async (code) => {
    const res = await apiJson("/api/auth/2fa/enable", {
      method: "POST",
      body: { code },
    });
    // Refresh user to update twofa_enabled status
    if (res?.ok) {
      await refresh();
    }
    return res;
  };

  /**
   * Disable 2FA - requires password and 2FA code or backup code
   */
  const disable2fa = async (password, code) => {
    const res = await apiJson("/api/auth/2fa/disable", {
      method: "POST",
      body: { password, code },
    });
    // Refresh user to update twofa_enabled status
    if (res?.ok) {
      await refresh();
    }
    return res;
  };


const listAuthSessions = async () => {
  const res = await apiJson("/api/auth/sessions");
  return res?.sessions || [];
};

const revokeAuthSession = async (sid) => {
  await apiJson(`/api/auth/sessions/${encodeURIComponent(sid)}`, { method: "DELETE" });
  return true;
};

const logoutOtherDevices = async () => {
  const res = await apiJson("/api/auth/sessions/logout-others", { method: "POST" });
  return res;
};

const logoutAllDevices = async () => {
  const res = await apiJson("/api/auth/sessions/logout-all", { method: "POST" });
  // This will also destroy current session on server side
  setUser(null);
  return res;
};

  const value = useMemo(() => ({
    user,
    loading,
    refresh,
    login,
    verify2faLogin,
    logout,
    changePassword,
    verifyPassword,
    updateDisplayName,
    updateUsername,
    setup2fa,
    enable2fa,
    disable2fa,
    listSessions: listAuthSessions,
    revokeSession: revokeAuthSession,
    logoutOtherDevices,
    logoutAllDevices,
    isAuthed: !!user,
    isAdmin: user?.role === "admin",
    authError,
    lastKnownUserId: getLastKnownUserId(),
  }), [user, loading, authError]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider/>");
  return ctx;
}

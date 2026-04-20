import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/auth/AuthProvider.jsx";
import { useI18n } from "@/i18n/I18nProvider.jsx";
import Modal from "@/components/common/Modal.jsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card.jsx";
import Input from "@/components/ui/Input.jsx";
import Button from "@/components/ui/Button.jsx";
import Badge from "@/components/ui/Badge.jsx";
import { User, Pencil, Clock, Check, X, Trash2 } from "lucide-react";

const DISPLAY_NAME_COOLDOWN_DAYS = 7;
const USERNAME_COOLDOWN_DAYS = 30;

// Helper to pluralize days (Russian/Ukrainian)
function pluralizeDays(count, lang) {
  if (lang === "ru" || lang === "uk") {
    const n = Math.abs(count);
    const lastDigit = n % 10;
    const lastTwoDigits = n % 100;
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return "дней";
    if (lastDigit === 1) return "день";
    if (lastDigit >= 2 && lastDigit <= 4) return "дня";
    return "дней";
  }
  return count === 1 ? "day" : "days";
}

// Check cooldown availability
function canChange(changedAt, cooldownDays) {
  if (!changedAt) return true;
  const lastChange = new Date(changedAt);
  const now = new Date();
  const daysSinceChange = (now - lastChange) / (1000 * 60 * 60 * 24);
  return daysSinceChange >= cooldownDays;
}

// Get remaining days
function getDaysRemaining(changedAt, cooldownDays) {
  if (!changedAt) return 0;
  const lastChange = new Date(changedAt);
  const now = new Date();
  const daysSinceChange = (now - lastChange) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.ceil(cooldownDays - daysSinceChange));
}

// Profile row component
function ProfileRow({ label, value, hint, onEdit, editDisabled, cooldownText }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-muted-foreground mb-0.5">{label}</div>
        <div className="text-sm font-semibold truncate">{value || "—"}</div>
        {cooldownText ? (
          <div className="flex items-center gap-1.5 mt-1 text-xs text-amber-400">
            <Clock className="h-3 w-3" />
            <span>{cooldownText}</span>
          </div>
        ) : hint ? (
          <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onEdit}
        disabled={editDisabled}
        className="shrink-0 h-8 w-8 p-0"
      >
        <Pencil className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function ProfileSettingsCard() {
  const { t, lang } = useI18n();
  const { user, verifyPassword, updateDisplayName, updateUsername } = useAuth();

  // Modal states
  const [displayNameModalOpen, setDisplayNameModalOpen] = useState(false);
  const [usernameModalOpen, setUsernameModalOpen] = useState(false);

  // Display Name modal state
  const [newDisplayName, setNewDisplayName] = useState("");
  const [displayNamePassword, setDisplayNamePassword] = useState("");
  const [displayNameSaving, setDisplayNameSaving] = useState(false);
  const [displayNameErr, setDisplayNameErr] = useState("");
  const [displayNameOk, setDisplayNameOk] = useState("");

  // Username modal state
  const [newUsername, setNewUsername] = useState("");
  const [usernamePassword, setUsernamePassword] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameErr, setUsernameErr] = useState("");
  const [usernameOk, setUsernameOk] = useState("");

  // Success messages shown in card (after modal closes)
  const [cardDisplayNameOk, setCardDisplayNameOk] = useState("");
  const [cardUsernameOk, setCardUsernameOk] = useState("");

  // Cooldown calculations
  const canChangeDisplayName = canChange(user?.display_name_changed_at, DISPLAY_NAME_COOLDOWN_DAYS);
  const displayNameDaysRemaining = getDaysRemaining(user?.display_name_changed_at, DISPLAY_NAME_COOLDOWN_DAYS);
  
  const canChangeUsernameNow = canChange(user?.username_changed_at, USERNAME_COOLDOWN_DAYS);
  const usernameDaysRemaining = getDaysRemaining(user?.username_changed_at, USERNAME_COOLDOWN_DAYS);

  // Format cooldown text
  const formatCooldownText = (days) => {
    const daysWord = pluralizeDays(days, lang);
    const template = t("settings.profile.nextChangeAvailable");
    // If translation contains placeholders, replace them; otherwise use as-is
    if (template && template.includes("{days}")) {
      return template.replace("{days}", days).replace("{daysWord}", daysWord);
    }
    // Fallback if translation doesn't exist or doesn't have placeholders
    return `Available in ${days} ${daysWord}`;
  };

  // Open display name modal
  const openDisplayNameModal = useCallback(() => {
    setNewDisplayName(user?.display_name || user?.nickname || user?.username || "");
    setDisplayNamePassword("");
    setDisplayNameErr("");
    setDisplayNameOk("");
    setDisplayNameModalOpen(true);
  }, [user]);

  // Close display name modal
  const closeDisplayNameModal = useCallback(() => {
    setDisplayNameModalOpen(false);
    setNewDisplayName("");
    setDisplayNamePassword("");
    setDisplayNameErr("");
    setDisplayNameOk("");
  }, []);

  // Open username modal
  const openUsernameModal = useCallback(() => {
    setNewUsername(user?.username || "");
    setUsernamePassword("");
    setUsernameErr("");
    setUsernameOk("");
    setUsernameModalOpen(true);
  }, [user]);

  // Close username modal
  const closeUsernameModal = useCallback(() => {
    setUsernameModalOpen(false);
    setNewUsername("");
    setUsernamePassword("");
    setUsernameErr("");
    setUsernameOk("");
  }, []);

  // Save display name
  const onSaveDisplayName = async () => {
    setDisplayNameErr("");
    setDisplayNameOk("");

    const trimmed = newDisplayName.trim();

    // Validation
    if (trimmed.length > 0 && trimmed.length < 2) {
      setDisplayNameErr(t("settings.profile.errors.tooShort"));
      return;
    }
    if (trimmed.length > 30) {
      setDisplayNameErr(t("settings.profile.errors.tooLong"));
      return;
    }

    // Password check (non-Google only)
    if (!user?.google_id && !displayNamePassword) {
      setDisplayNameErr(t("settings.profile.errors.passwordRequired"));
      return;
    }

    setDisplayNameSaving(true);
    try {
      // Verify password first (non-Google users)
      if (!user?.google_id) {
        await verifyPassword({ password: displayNamePassword });
      }

      const result = await updateDisplayName(trimmed);
      if (result?.ok) {
        setDisplayNameOk(t("settings.profile.ok.updated"));
        setTimeout(() => {
          setCardDisplayNameOk(t("settings.profile.ok.updated"));
          closeDisplayNameModal();
          setTimeout(() => setCardDisplayNameOk(""), 3000);
        }, 500);
      } else {
        setDisplayNameErr(t("settings.profile.errors.updateFailed"));
      }
    } catch (e) {
      if (e?.data?.days_remaining) {
        const days = e.data.days_remaining;
        const daysWord = pluralizeDays(days, lang);
        setDisplayNameErr(
          t("settings.profile.errors.cooldown", { days, daysWord })
        );
      } else if (e?.status === 401 || /password|wrong/i.test(e?.message || "")) {
        setDisplayNameErr(t("settings.profile.errors.wrongPassword"));
      } else {
        setDisplayNameErr(e?.message || t("settings.profile.errors.updateFailed"));
      }
    } finally {
      setDisplayNameSaving(false);
    }
  };

  // Clear display name
  const onClearDisplayName = async () => {
    setDisplayNameErr("");
    setDisplayNameOk("");

    // Password check (non-Google only)
    if (!user?.google_id && !displayNamePassword) {
      setDisplayNameErr(t("settings.profile.errors.passwordRequired"));
      return;
    }

    setDisplayNameSaving(true);
    try {
      // Verify password first (non-Google users)
      if (!user?.google_id) {
        await verifyPassword({ password: displayNamePassword });
      }

      const result = await updateDisplayName("");
      if (result?.ok) {
        setDisplayNameOk(t("settings.profile.ok.updated"));
        setTimeout(() => {
          setCardDisplayNameOk(t("settings.profile.ok.updated"));
          closeDisplayNameModal();
          setTimeout(() => setCardDisplayNameOk(""), 3000);
        }, 500);
      } else {
        setDisplayNameErr(t("settings.profile.errors.updateFailed"));
      }
    } catch (e) {
      if (e?.data?.days_remaining) {
        const days = e.data.days_remaining;
        const daysWord = pluralizeDays(days, lang);
        setDisplayNameErr(
          t("settings.profile.errors.cooldown", { days, daysWord })
        );
      } else if (e?.status === 401 || /password|wrong/i.test(e?.message || "")) {
        setDisplayNameErr(t("settings.profile.errors.wrongPassword"));
      } else {
        setDisplayNameErr(e?.message || t("settings.profile.errors.updateFailed"));
      }
    } finally {
      setDisplayNameSaving(false);
    }
  };

  // Save username
  const onSaveUsername = async () => {
    setUsernameErr("");
    setUsernameOk("");

    const trimmed = newUsername.trim().toLowerCase();

    // Validation
    if (trimmed.length < 3) {
      setUsernameErr(t("settings.profile.errors.usernameTooShort"));
      return;
    }
    if (trimmed.length > 20) {
      setUsernameErr(t("settings.profile.errors.usernameTooLong"));
      return;
    }
    if (!/^[a-z0-9_]+$/.test(trimmed)) {
      setUsernameErr(t("settings.profile.errors.usernameInvalid"));
      return;
    }
    if (trimmed === user?.username) {
      return; // No change
    }

    // Password check (non-Google only)
    if (!user?.google_id && !usernamePassword) {
      setUsernameErr(t("settings.profile.errors.passwordRequired"));
      return;
    }

    setUsernameSaving(true);
    try {
      // Verify password first (non-Google users)
      if (!user?.google_id) {
        await verifyPassword({ password: usernamePassword });
      }

      const result = await updateUsername(trimmed);
      if (result?.ok) {
        setUsernameOk(t("settings.profile.ok.usernameUpdated"));
        setTimeout(() => {
          setCardUsernameOk(t("settings.profile.ok.usernameUpdated"));
          closeUsernameModal();
          setTimeout(() => setCardUsernameOk(""), 3000);
        }, 500);
      } else {
        setUsernameErr(t("settings.profile.errors.usernameUpdateFailed"));
      }
    } catch (e) {
      if (e?.data?.days_remaining) {
        const days = e.data.days_remaining;
        const daysWord = pluralizeDays(days, lang);
        setUsernameErr(
          t("settings.profile.errors.usernameCooldown", { days, daysWord })
        );
      } else if (e?.status === 409 || e?.message?.includes("taken") || e?.message?.includes("exists")) {
        setUsernameErr(t("settings.profile.errors.usernameTaken"));
      } else if (e?.status === 401 || /password|wrong/i.test(e?.message || "")) {
        setUsernameErr(t("settings.profile.errors.wrongPassword"));
      } else {
        setUsernameErr(e?.message || t("settings.profile.errors.usernameUpdateFailed"));
      }
    } finally {
      setUsernameSaving(false);
    }
  };

  // Check if Save button should be disabled
  const isDisplayNameSaveDisabled = displayNameSaving || 
    (newDisplayName.trim().length > 0 && newDisplayName.trim().length < 2) || 
    newDisplayName.trim().length > 30;

  const isUsernameSaveDisabled = usernameSaving || 
    newUsername.trim().toLowerCase() === user?.username ||
    newUsername.trim().length < 3 ||
    newUsername.trim().length > 20 ||
    !/^[a-z0-9_]+$/.test(newUsername.trim());

  return (
    <>
      <Card className="premium-panel">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            {t("settings.profile.title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Display Name Row */}
          <ProfileRow
            label={t("settings.profile.displayName")}
            value={user?.display_name || user?.nickname || "—"}
            hint={canChangeDisplayName ? t("settings.profile.displayNameHint") : null}
            onEdit={openDisplayNameModal}
            editDisabled={!canChangeDisplayName}
            cooldownText={!canChangeDisplayName && displayNameDaysRemaining > 0 ? formatCooldownText(displayNameDaysRemaining) : null}
          />
          {cardDisplayNameOk && (
            <div className="flex items-center gap-1.5 text-xs text-success px-1">
              <Check className="h-3 w-3" />
              <span>{cardDisplayNameOk}</span>
            </div>
          )}

          {/* Username Row */}
          <ProfileRow
            label={t("settings.profile.usernameLabel")}
            value={user?.username || "—"}
            hint={canChangeUsernameNow ? t("settings.profile.usernameHint") : null}
            onEdit={openUsernameModal}
            editDisabled={!canChangeUsernameNow}
            cooldownText={!canChangeUsernameNow && usernameDaysRemaining > 0 ? formatCooldownText(usernameDaysRemaining) : null}
          />
          {cardUsernameOk && (
            <div className="flex items-center gap-1.5 text-xs text-success px-1">
              <Check className="h-3 w-3" />
              <span>{cardUsernameOk}</span>
            </div>
          )}

          {/* Email Row (readonly) */}
          {user?.email && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-muted-foreground mb-0.5">
                  {t("settings.profile.emailLabel")}
                </div>
                <div className="text-sm font-semibold truncate">{user.email}</div>
              </div>
              {user?.google_id && (
                <Badge variant="outline" className="text-xs whitespace-nowrap shrink-0">
                  {t("settings.profile.googleBadge")}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Display Name Edit Modal */}
      <Modal
        open={displayNameModalOpen}
        onOpenChange={(open) => !open && closeDisplayNameModal()}
        title={t("settings.profile.changeDisplayNameTitle")}
        size="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSaveDisplayName();
          }}
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold mb-1.5 block">
                {t("settings.profile.newDisplayName")}
              </label>
              <Input
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder={t("settings.profile.displayNamePlaceholder")}
                maxLength={30}
                autoFocus
              />
              <div className="mt-1.5 text-xs text-muted-foreground">
                {t("settings.profile.displayNameRules")}
              </div>
            </div>

            {/* Password field for non-Google users */}
            {!user?.google_id && (
              <div>
                <label className="text-xs font-semibold mb-1.5 block">
                  {t("settings.profile.confirmPassword")}
                </label>
                <Input
                  type="password"
                  value={displayNamePassword}
                  onChange={(e) => setDisplayNamePassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            )}

            {displayNameErr && (
              <div className="flex items-center gap-1.5 text-xs text-danger">
                <X className="h-3 w-3" />
                <span>{displayNameErr}</span>
              </div>
            )}
            {displayNameOk && (
              <div className="flex items-center gap-1.5 text-xs text-success">
                <Check className="h-3 w-3" />
                <span>{displayNameOk}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClearDisplayName}
                disabled={displayNameSaving}
                className="text-muted-foreground hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
                {t("settings.profile.clearDisplayName")}
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={closeDisplayNameModal} disabled={displayNameSaving}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={isDisplayNameSaveDisabled}>
                  {displayNameSaving ? t("settings.profile.saving") : t("common.save")}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* Username Edit Modal */}
      <Modal
        open={usernameModalOpen}
        onOpenChange={(open) => !open && closeUsernameModal()}
        title={t("settings.profile.changeUsernameTitle")}
        size="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSaveUsername();
          }}
        >
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold mb-1.5 block">
                {t("settings.profile.newUsername")}
              </label>
              <Input
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                placeholder={t("settings.profile.usernamePlaceholder")}
                maxLength={20}
                autoFocus
              />
              <div className="mt-1.5 text-xs text-muted-foreground">
                {t("settings.profile.usernameRules")}
              </div>
            </div>

            {/* Password field for non-Google users */}
            {!user?.google_id && (
              <div>
                <label className="text-xs font-semibold mb-1.5 block">
                  {t("settings.profile.confirmPassword")}
                </label>
                <Input
                  type="password"
                  value={usernamePassword}
                  onChange={(e) => setUsernamePassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            )}

            {usernameErr && (
              <div className="flex items-center gap-1.5 text-xs text-danger">
                <X className="h-3 w-3" />
                <span>{usernameErr}</span>
              </div>
            )}
            {usernameOk && (
              <div className="flex items-center gap-1.5 text-xs text-success">
                <Check className="h-3 w-3" />
                <span>{usernameOk}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={closeUsernameModal} disabled={usernameSaving}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={isUsernameSaveDisabled}>
                {usernameSaving ? t("settings.profile.saving") : t("common.save")}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}

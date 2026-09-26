import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useAuth } from "../../auth/AuthContext";
import { useLocale } from "../../i18n/LocaleContext";
import { SignInForm } from "./SignInForm";
import styles from "./AuthPanel.module.css";

/**
 * Sits in the sidebar footer. Never blocks anything -- the dashboard is
 * fully interactive whether this shows "Sign in" or an email address, per
 * CLAUDE.md Feature 4: login unlocks saving scenarios and nothing else.
 * Shown on the static demo too, where the form signs in the built-in demo
 * account (see SignInForm and auth/browserBackend.ts).
 *
 * The form is a Radix Popover portalled to <body>: rendered inside the
 * sidebar it was clipped by the sidebar's own overflow, and dropping below
 * a trigger at the very bottom of the viewport put it off-screen entirely.
 * Radix positions it beside the sidebar and flips it when there's no room.
 */
export function AuthPanel() {
  const { t } = useLocale();
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading) return null;

  if (user) {
    return (
      // Stacked, not side by side: at the sidebar's 220px a real address
      // beside the button squeezed "Sign out" onto three lines and pushed
      // both past the sidebar's edge. The address gets its own line and
      // truncates (full text in `title`); the button gets its own, full width.
      <div className={`${styles.panel} ${styles.signedIn} sidebar-auth`} data-testid="account-panel">
        <span className={styles.signedInAs}>{t("auth.signedInAs")}</span>
        <span className={styles.account} title={user.email} data-testid="account-email">
          {user.email}
        </span>
        <button type="button" className={styles.signOut} onClick={() => logout()} data-testid="sign-out-button">
          {t("auth.signOut")}
        </button>
      </div>
    );
  }

  return (
    <div className={`${styles.panel} sidebar-auth`}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button type="button" data-testid="sign-in-open-button">
            {t("auth.signIn")}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className={styles.popover}
            side="right"
            align="end"
            sideOffset={12}
            collisionPadding={16}
            aria-label={t("auth.signIn")}
            data-testid="auth-dialog"
          >
            <SignInForm idPrefix="sidebar" onSignedIn={() => setOpen(false)} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

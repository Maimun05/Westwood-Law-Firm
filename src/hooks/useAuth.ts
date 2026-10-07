import { useState, useEffect, useCallback } from "react";

import { getCurrentUserProfile, onAuthStateChange, type AuthUser } from "@/lib/auth";

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);

  const [loading, setLoading] = useState(true);

  // Re-read the profile on demand. The avatar lives on the profile row, so
  // after an upload (or a password change that clears must_change_password)
  // the caller refreshes and the top-right picture updates without a reload.
  const refresh = useCallback(async () => {
    const profile = await getCurrentUserProfile();
    setUser(profile);
  }, []);

  useEffect(() => {
    let retryCount = 0;

    const maxRetries = 3;

    // Check if user is already logged in

    const loadProfile = async () => {
      const profile = await getCurrentUserProfile();

      if (profile) {
        setUser(profile);

        setLoading(false);

        return true;
      }

      return false;
    };

    // Try to load profile with retries (for newly created accounts)

    const tryLoadWithRetries = async () => {
      const loaded = await loadProfile();

      if (!loaded && retryCount < maxRetries) {
        retryCount++;

        setTimeout(tryLoadWithRetries, 1000); // Retry after 1 second
      } else {
        setLoading(false);
      }
    };

    tryLoadWithRetries();

    // Listen for auth state changes

    const subscription = onAuthStateChange(async (authUser) => {
      if (authUser) {
        // Reset retry counter for new sign-ins

        retryCount = 0;

        const profile = await getCurrentUserProfile();

        if (profile) {
          setUser(profile);
        } else {
          // Retry loading profile for newly created accounts

          setTimeout(async () => {
            const retryProfile = await getCurrentUserProfile();

            setUser(retryProfile);
          }, 1500);
        }
      } else {
        setUser(null);
      }

      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading, refresh };
}

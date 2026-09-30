import { createClient } from '@supabase/supabase-js';

const googleProviderTokenKey = 'quick-emailer.google-provider-token';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabasePublishableKey &&
    !supabaseUrl.includes('your-project-ref') &&
    !supabasePublishableKey.includes('your-key'),
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function getStoredGoogleProviderToken() {
  return window.localStorage.getItem(googleProviderTokenKey);
}

export function clearStoredGoogleProviderToken() {
  window.localStorage.removeItem(googleProviderTokenKey);
}

// Supabase only returns an OAuth provider token immediately after sign-in. Save
// it before a later Supabase session refresh drops it from the session object.
if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.provider_token) {
      window.localStorage.setItem(googleProviderTokenKey, session.provider_token);
    }
    if (event === 'SIGNED_OUT') {
      clearStoredGoogleProviderToken();
    }
  });
}

import { Redirect } from 'expo-router';

/**
 * Landing route for the `spatiotemporal://oauth-callback` deep link used by Google
 * sign-in. Token capture happens in services/api.ts (a Linking 'url' listener),
 * which flips auth state. Expo Router still navigates here because the deep link
 * path matches this route — so we render nothing and redirect to root immediately.
 * The root layout then shows the correct screen for the (now logged-in) state.
 */
export default function OAuthCallback() {
  return <Redirect href="/" />;
}

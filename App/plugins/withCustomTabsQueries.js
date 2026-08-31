/**
 * Ensures Android 11+ package visibility for Chrome Custom Tabs.
 *
 * On Android 11+ (API 30) queryIntentActivities returns empty unless the
 * manifest declares <queries>. Without it WebBrowser.openAuthSessionAsync
 * throws "No matching browser activity found" even when Chrome is installed.
 * expo-web-browser's plugin should inject this, but we make it explicit so
 * the dev build is never missing the declaration regardless of SDK auto-injection.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withCustomTabsQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    manifest.manifest = manifest.manifest || {};
    manifest.manifest.queries = manifest.manifest.queries || [];

    const serialized = JSON.stringify(manifest.manifest.queries);
    if (serialized.includes('CustomTabsService')) return config;

    manifest.manifest.queries.push({
      intent: [
        {
          action: [{ $: { 'android:name': 'android.support.customtabs.action.CustomTabsService' } }],
          data: [{ $: { 'android:scheme': 'https' } }],
        },
      ],
    });
    manifest.manifest.queries.push({
      intent: [
        {
          action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
          category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
          data: [{ $: { 'android:scheme': 'https' } }],
        },
      ],
    });
    return config;
  });
};

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const emptyShim = path.resolve(__dirname, 'shims/empty.js');

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  // Browserify shims for Node built-ins used by @supabase/realtime-js → ws
  assert: require.resolve('assert'),
  buffer: require.resolve('buffer'),
  crypto: require.resolve('crypto-browserify'),
  events: require.resolve('events'),
  http: require.resolve('stream-http'),
  https: require.resolve('https-browserify'),
  stream: require.resolve('stream-browserify'),
  url: require.resolve('url'),
  util: require.resolve('util'),
  zlib: require.resolve('browserify-zlib'),
  // Native-only modules — stub with empty object (ws falls back to pure JS)
  net: emptyShim,
  tls: emptyShim,
  bufferutil: emptyShim,
  'utf-8-validate': emptyShim,
};

module.exports = config;

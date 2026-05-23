const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Limit transformer workers to prevent CPU saturation on slower machines
config.maxWorkers = 2;

// Reset cache on version bumps for consistent performance
config.resetCache = false;

// Optimize transformer for faster builds
config.transformer = {
  ...config.transformer,
  // Enable minification for faster parsing in dev
  minifierConfig: {
    ...config.transformer?.minifierConfig,
    mangle: false,
    output: { ascii_only: true },
  },
};

module.exports = config;

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Ensure resolver exists
config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
  // redirect imports from "react-native-worklets/*" to "react-native-worklets-core/*"
  'react-native-worklets': path.resolve(__dirname, 'node_modules', 'react-native-worklets-core'),
  // keep node_modules resolution for other packages
  ...config.resolver.extraNodeModules,
};

// Add resolver alias for worklets
config.resolver.alias = {
  'react-native-worklets': 'react-native-worklets-core',
};

module.exports = config;

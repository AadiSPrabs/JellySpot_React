const { withAppBuildGradle } = require("@expo/config-plugins");

module.exports = function withAndroidSplits(config) {
  return withAppBuildGradle(config, (cfg) => {
    const content = cfg.modResults.contents;
    const splitsBlock = `
    splits {
        abi {
            enable true
            reset()
            include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"
            universalApk false
        }
    }`;

    if (content.includes("splits {")) {
      cfg.modResults.contents = content.replace(
        /splits\s*\{[^}]*abi[^}]*\}[^}]*\}/s,
        splitsBlock,
      );
    } else {
      cfg.modResults.contents = content.replace(
        /android\s*\{/,
        "android {" + splitsBlock,
      );
    }

    return cfg;
  });
};

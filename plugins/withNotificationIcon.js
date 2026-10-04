const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Copies the notification small icon into the generated Android project.
 *
 * Why this exists: `android/` is gitignored, and `eas build` runs a prebuild
 * that regenerates it. Any file dropped into `android/app/src/main/res/`
 * by hand is therefore lost on the next build, which would leave the patched
 * TrackPlayer MusicService referencing a `R.drawable.ic_notification` that no
 * longer exists - a compile error rather than a cosmetic problem.
 *
 * A config plugin runs as part of prebuild, so the drawables are regenerated
 * every time.
 *
 * Android renders notification small icons as a white silhouette on
 * transparent. The source asset is the app's monochrome mark, which is already
 * in that format; a full-colour icon would be flattened to a white blob.
 */

/** Density bucket -> icon size in px (24dp base). */
const DENSITIES = {
  "drawable-mdpi": 24,
  "drawable-hdpi": 36,
  "drawable-xhdpi": 48,
  "drawable-xxhdpi": 72,
  "drawable-xxxhdpi": 96,
};

const SOURCE = "assets/AppIcons/monochrome-icon.png";

/**
 * Minimal PNG re-encode is out of scope for a config plugin (no image library
 * is available at prebuild time). Copying the 512px source into every bucket
 * is correct - Android scales it down by bucket - it is just a few KB larger
 * than a pre-sized set. The committed `android/` tree carries properly sized
 * copies for local builds; this guarantees CI has the file at all.
 */
module.exports = function withNotificationIcon(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const resDir = path.join(
        cfg.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
      );
      const sourcePath = path.join(projectRoot, SOURCE);

      if (!fs.existsSync(sourcePath)) {
        // Fail loudly rather than shipping a build that will not compile.
        throw new Error(
          `[withNotificationIcon] Missing source icon at ${SOURCE}. ` +
            `The TrackPlayer patch references R.drawable.ic_notification, ` +
            `so the build would fail without it.`,
        );
      }

      for (const bucket of Object.keys(DENSITIES)) {
        const dir = path.join(resDir, bucket);
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(sourcePath, path.join(dir, "ic_notification.png"));
      }

      return cfg;
    },
  ]);
};

# JellySpot

A premium, feature-rich music player built with React Native, designed for a seamless experience with both local libraries and Jellyfin servers.

## ✨ Features

- **Dual Mode Support:** Switch effortlessly between your Local Device Library and your Jellyfin Server.
- **Modern Library Navigation:** Intuitive top-bar navigation to quickly switch between **Playlists**, **Artists**, and **Albums**.
- **Quick Access Grid:** A dynamic home screen grid that prioritizes your Recently Played tracks and playlists.
- **Premium Playback Experience:** High-performance audio service with smooth transitions, progress interpolation, and a beautiful mini-player.
- **Lyrics Integration:** View synced and un-synced lyrics directly within the player.
- **Smart Queue & Shuffle:** Optimized queue management with a fast Fisher-Yates shuffle that respects user-defined limits.
- **Offline First:** Robust local database (SQLite) for tracking play history, favorites, and cached metadata.
- **Beautiful UI:** Modern design with dynamic theme colors extracted from album art.

## 🚀 Recent Improvements

- **Fixed Database Tracking:** Resolved issues with playlist tracking by implementing proper SQLite migrations.
- **Performance Optimization:** Drastic reduction in re-renders and JS thread blocking during heavy queue operations.
- **UI Refinement:** Transitioned and polished the Library screen with a new top-bar tab system.
- **Jellyfin Integration:** Enhanced metadata fetching and name resolution for Jellyfin playlists.

## 🛠️ Technical Stack

- **Framework:** React Native (Expo)
- **State Management:** Zustand
- **Database:** SQLite (Expo SQLite) with Drizzle ORM
- **Audio:** React Native Track Player
- **UI Components:** React Native Paper & Vector Icons
- **Styling:** Vanilla CSS-in-JS for maximum performance

## 📦 Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Aaditya-Sunil-Prabhu/JellySpot_React.git
   cd JellySpot_React
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npx expo start
   ```

## 📄 License

This project is for educational and personal use.

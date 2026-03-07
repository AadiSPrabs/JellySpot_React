# JellySpot

A premium, feature-rich music player built with React Native (Expo), designed for a seamless experience with local music libraries and Jellyfin servers.

## ✨ Features

- **Dual Mode Support:** Switch effortlessly between your Local Device Library and your Jellyfin Server.
- **Remote Control (Spotify Connect-like):** Control playback on other active Jellyspot/Jellyfin sessions from within the app.
- **Modern Library Navigation:** Intuitive top-bar navigation to quickly switch between **Playlists**, **Artists**, and **Albums**.
- **Quick Access Grid:** A dynamic home screen grid that prioritizes your Recently Played tracks and playlists.
- **Premium Playback Experience:** High-performance audio service with smooth transitions, progress interpolation, and a beautiful mini-player with home screen hero controls.
- **Beautiful UI:** Modern design with dynamic theme colors extracted from album art.
- **Security First:** Encrypted authentication token storage using OS Keychain/Keystore (SecureStore).

## 🚀 Recent Improvements

- **Remote Control Feature:** Full support for WebSocket-based remote sessions and client management.
- **Queue Screen Refactor:** Reimagined the queue as a dedicated, high-performance screen with smooth reordering.
- **Security Hardening:** Migrated sensitive auth data to `expo-secure-store` and conducted a comprehensive security audit.
- **UI Performance:** Optimized navigation transitions (200ms) and drastically reduced JS thread blocking.

## 🛠️ Technical Stack

- **Framework:** React Native (Expo SDK 54)
- **State Management:** Zustand
- **Database:** SQLite (Expo SQLite) with Drizzle ORM
- **Audio:** React Native Track Player
- **UI Components:** React Native Paper & Vector Icons
- **Storage:** AsyncStorage & Expo SecureStore

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

This project is licensed under the **MIT License**.

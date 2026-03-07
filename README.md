<div align="left"><img src="assets/AppIcons/playstore.png" width="500" height="500"/></div>

# JellySpot

A music player built with React Native (Expo) for local libraries and Jellyfin servers.

## Features

- **Dual Mode Support:** Seamlessly switch between local device music and Jellyfin servers.
- **Library Navigation:** Quick access to Playlists, Artists, and Albums with intuitive swipe-based tabs.
- **Now Playing Hero:** Dedicated home screen card for current track control with skip and play/pause buttons.
- **Dynamic Theming:** UI colors adapt to the current track's album art.
- **Secure Auth:** Authentication tokens are stored encrypted using OS-level secure storage (SecureStore).
- **Offline First:** Local database for library tracking and play history.

## Technical Stack

- **Framework:** React Native (Expo)
- **State Management:** Zustand
- **Database:** SQLite with Drizzle ORM
- **Audio:** React Native Track Player
- **UI:** React Native Paper

## Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Aaditya-Sunil-Prabhu/JellySpot_React.git
   cd JellySpot_React
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the app:**
   ```bash
   npx expo start
   ```

## License

MIT License

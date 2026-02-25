import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
    Auth: undefined;
    Main: NavigatorScreenParams<MainTabParamList>;
    Player: undefined;
};

export type AuthStackParamList = {
    ServerSelect: undefined;
    Login: undefined;
};

export type MainTabParamList = {
    HomeStack: NavigatorScreenParams<HomeStackParamList>;
    SearchStack: NavigatorScreenParams<SearchStackParamList>;
    LibraryStack: NavigatorScreenParams<LibraryStackParamList>;
    DownloadsStack: NavigatorScreenParams<DownloadsStackParamList>;
};

export type HomeStackParamList = {
    Home: undefined;
    Detail: { itemId: string; type: string };
    Settings: undefined;
    Appearance: undefined;
    PlaybackSettings: undefined;
    StorageSettings: undefined;
    SourceModeSettings: undefined;
    DownloadSettings: undefined;
    Dependencies: undefined;
};

export type SearchStackParamList = {
    Search: undefined;
    Detail: { itemId: string; type: string };
    Dependencies: undefined;
};

export type LibraryStackParamList = {
    Library: undefined;
    Detail: { itemId: string; type: string };
    Settings: undefined;
    Appearance: undefined;
    PlaybackSettings: undefined;
    StorageSettings: undefined;
    SourceModeSettings: undefined;
    DownloadSettings: undefined;
    Dependencies: undefined;
};

export type DownloadsStackParamList = {
    Downloads: undefined;
};

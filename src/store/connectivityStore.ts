import { create } from "zustand";
import * as Network from "expo-network";
import type { EventSubscription } from "expo-modules-core";

interface ConnectivityState {
  isOnline: boolean;
  isInternetReachable: boolean | null;
  isWifi: boolean;
  init: () => () => void;
}

// `expo-network` ships as an Expo module, so it is always linked into the
// native build (unlike @react-native-community/netinfo, which is an
// old-architecture-only library and resolves to null under the New
// Architecture).
export const useConnectivityStore = create<ConnectivityState>(
  (set) => ({
    isOnline: true,
    isInternetReachable: null,
    isWifi: false,

    init: () => {
      const apply = (state: Network.NetworkState) => {
        set({
          isOnline: state.isConnected ?? true,
          isInternetReachable: state.isInternetReachable ?? null,
          isWifi: state.type === Network.NetworkStateType.WIFI,
        });
      };

      let subscription: EventSubscription | undefined;

      try {
        subscription = Network.addNetworkStateListener(apply);
      } catch {
        // Listener unavailable - fall back to the initial fetch below.
      }

      Network.getNetworkStateAsync()
        .then(apply)
        .catch(() => {
          // Leave the optimistic defaults in place.
        });

      return () => {
        subscription?.remove();
      };
    },
  }),
);

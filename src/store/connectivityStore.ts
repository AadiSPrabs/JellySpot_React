import { create } from "zustand";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

interface ConnectivityState {
  isOnline: boolean;
  isInternetReachable: boolean | null;
  init: () => () => void;
  refresh: () => Promise<void>;
}

export const useConnectivityStore = create<ConnectivityState>(
  (set, get) => ({
    isOnline: true,
    isInternetReachable: null,

    init: () => {
      const unsubscribe = NetInfo.addEventListener(
        (state: NetInfoState) => {
          set({
            isOnline: !!state.isConnected,
            isInternetReachable: state.isInternetReachable,
          });
        },
      );

      NetInfo.fetch().then((state) => {
        set({
          isOnline: !!state.isConnected,
          isInternetReachable: state.isInternetReachable,
        });
      });

      return unsubscribe;
    },

    refresh: async () => {
      const state = await NetInfo.fetch();
      set({
        isOnline: !!state.isConnected,
        isInternetReachable: state.isInternetReachable,
      });
    },
  }),
);

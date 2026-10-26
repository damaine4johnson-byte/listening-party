import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, Text, View } from "react-native";
import Purchases, { PRODUCT_CATEGORY, type PurchasesStoreProduct } from "react-native-purchases";
import type { GoogleLoginResult } from "../auth-types";
import { api, responseError } from "../api";
import { colors, styles } from "../theme";

const PACKS = [
  { id: "coins_50", coins: 50 },
  { id: "coins_100", coins: 100 },
  { id: "coins_200", coins: 200 },
] as const;

let configuredUserId = "";

type Props = {
  accessToken: string | null;
  userId: string | null;
  onBack: () => void;
  onSignIn: () => Promise<GoogleLoginResult>;
};

export default function WalletScreen({ accessToken, userId, onBack, onSignIn }: Props) {
  const [balance, setBalance] = useState<number | null>(null);
  const [products, setProducts] = useState<PurchasesStoreProduct[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);

  const refreshBalance = useCallback(async () => {
    if (!accessToken) return;
    const result = await api("/api/coins/balance", { accessToken });
    if (!result.response.ok || typeof result.data.balance !== "number") {
      throw new Error(responseError(result.data, "Could not load your coin balance."));
    }
    setBalance(result.data.balance);
    return result.data.balance;
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !userId) {
      setBalance(null);
      setProducts([]);
      return;
    }
    const authenticatedUserId = userId;
    let active = true;
    async function load() {
      await refreshBalance();
      const apiKey = Platform.OS === "ios"
        ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
        : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
      if (!apiKey) return;
      if (!configuredUserId) {
        Purchases.configure({ apiKey, appUserID: authenticatedUserId });
        configuredUserId = authenticatedUserId;
      } else if (configuredUserId !== authenticatedUserId) {
        await Purchases.logIn(authenticatedUserId);
        configuredUserId = authenticatedUserId;
      }
      const storeProducts = await Purchases.getProducts(
        PACKS.map((pack) => pack.id),
        PRODUCT_CATEGORY.NON_SUBSCRIPTION,
      );
      if (active) setProducts(storeProducts);
    }
    void load().catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "Could not load your wallet.");
    });
    return () => { active = false; };
  }, [accessToken, userId, refreshBalance]);

  async function buy(productId: string, coins: number) {
    setError("");
    setNotice("");
    if (!userId || !accessToken) {
      setError("Sign in with Google before buying coins.");
      return;
    }
    if (!configuredUserId) {
      setError("In-app purchases are not configured for this build. Configure RevenueCat and create a development build.");
      return;
    }
    const product = products.find((item) => item.identifier === productId);
    if (!product) {
      setError("This coin pack is not available in the store yet.");
      return;
    }
    const startingBalance = balance ?? 0;
    setPending(true);
    try {
      await Purchases.purchaseStoreProduct(product);
      setNotice("Purchase confirmed. Your coins will appear after the store receipt is verified.");
      for (const delay of [1000, 2000, 4000, 8000]) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        const updatedBalance = await refreshBalance();
        if (updatedBalance !== undefined && updatedBalance >= startingBalance + coins) break;
      }
    } catch (cause) {
      if (cause && typeof cause === "object" && "userCancelled" in cause && cause.userCancelled) return;
      setError(cause instanceof Error ? cause.message : "The store purchase could not be completed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={{ gap: 18 }}>
      <View style={styles.row}>
        <Pressable onPress={onBack}><Text style={styles.body}>‹ Back</Text></Pressable>
        <Text style={[styles.eyebrow, { marginLeft: "auto" }]}>LISTENER WALLET</Text>
      </View>
      <Text style={styles.title}>Your coins.</Text>
      <Text style={styles.subtitle}>1 USD = 10 coins. Spend coins on paid room entry and song boosts.</Text>
      {!userId ? (
        <View style={styles.card}>
          <Text style={styles.body}>Sign in with Google to keep your balance across devices.</Text>
          <Pressable style={styles.button} disabled={pending} onPress={() => {
            setError("");
            void onSignIn().catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Google sign-in failed."));
          }}>
            <Text style={styles.buttonText}>Sign in with Google</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.eyebrow}>AVAILABLE BALANCE</Text>
            {balance === null ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.title}>{balance.toLocaleString()} coins</Text>}
            <Text style={styles.muted}>Wallet ID is linked to your Google account.</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.eyebrow}>TOP UP IN THE APP</Text>
            {PACKS.map((pack) => {
              const product = products.find((item) => item.identifier === pack.id);
              return (
                <Pressable
                  key={pack.id}
                  style={[styles.button, styles.buttonSecondary]}
                  disabled={pending || !product}
                  onPress={() => void buy(pack.id, pack.coins)}
                >
                  <Text style={styles.buttonText}>{`Buy ${pack.coins} coins · ${product?.priceString ?? "Unavailable"}`}</Text>
                </Pressable>
              );
            })}
            <Text style={styles.muted}>Purchases are processed by Apple or Google and verified by RevenueCat before the wallet is credited.</Text>
          </View>
        </>
      )}
      {pending && <ActivityIndicator color={colors.accent} />}
      {notice ? <Text style={styles.success}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

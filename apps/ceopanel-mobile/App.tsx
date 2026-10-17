import { useEffect, useRef, useState } from "react"
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native"
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context"
import { StatusBar } from "expo-status-bar"
import { WebView } from "react-native-webview"
import { portalOrigin, navigationPolicy } from "./navigation"

const localeObserver = `(() => {
  const publish = () => window.ReactNativeWebView.postMessage(JSON.stringify({type: 'locale', value: document.documentElement.lang}));
  new MutationObserver(publish).observe(document.documentElement, {attributes: true, attributeFilter: ['lang']});
  publish();
})();true;`

export default function App() {
  const web = useRef<WebView>(null)
  const canGoBack = useRef(false)
  useEffect(() => {
    if (Platform.OS !== "android") return
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack.current || !web.current) return false
      web.current.goBack()
      return true
    })
    return () => listener.remove()
  }, [])
  const [failed, setFailed] = useState(false),
    [arabic, setArabic] = useState(false)
  const failedLoad = useRef(false)
  const topUrl = useRef("")
  const origin = portalOrigin(process.env.EXPO_PUBLIC_CEOPANEL_URL || "")
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        {!origin ? (
          <View style={styles.message}>
            <Text style={styles.title}>Durar Masagh</Text>
            <Text>
              Set EXPO_PUBLIC_CEOPANEL_URL to your deployed HTTPS CEO Panel
              origin.
            </Text>
            <Text>حدد رابط منصة الشركة الآمن في إعدادات التطبيق.</Text>
          </View>
        ) : (
          <>
            <View style={styles.toolbar}>
              <Text style={styles.title}>Durar Masagh</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  web.current?.injectJavaScript(
                    `document.querySelector('[aria-label="Change language"]')?.click();true;`,
                  )
                }
              >
                <Text>{arabic ? "English" : "العربية"}</Text>
              </Pressable>
            </View>
            {failed && (
              <View style={styles.message}>
                <Text>
                  {arabic
                    ? "الاتصال غير متاح. مسودات الميدان محفوظة على هذا الجهاز."
                    : "Connection unavailable. Saved field drafts remain on this device."}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => web.current?.reload()}
                >
                  <Text>{arabic ? "إعادة المحاولة" : "Retry"}</Text>
                </Pressable>
              </View>
            )}
            <WebView
              ref={web}
              source={{ uri: `${origin}/` }}
              style={styles.web}
              originWhitelist={["https://*", "about:blank"]}
              sharedCookiesEnabled={false}
              thirdPartyCookiesEnabled={false}
              mixedContentMode="never"
              allowsInlineMediaPlayback
              mediaCapturePermissionGrantType="prompt"
              startInLoadingState
              renderLoading={() => <ActivityIndicator style={styles.loading} />}
              injectedJavaScript={localeObserver}
              onMessage={(event) => {
                try {
                  const message = JSON.parse(event.nativeEvent.data)
                  if (
                    message.type === "locale" &&
                    ["en", "ar"].includes(message.value)
                  )
                    setArabic(message.value === "ar")
                } catch {}
              }}
              onLoadStart={(event) => {
                failedLoad.current = false
                topUrl.current = event.nativeEvent.url
              }}
              onNavigationStateChange={(state) => {
                canGoBack.current = state.canGoBack
              }}
              onError={() => {
                failedLoad.current = true
                setFailed(true)
              }}
              onHttpError={(event) => {
                if (event.nativeEvent.url === topUrl.current) {
                  failedLoad.current = true
                  setFailed(true)
                }
              }}
              onLoad={() => {
                if (!failedLoad.current) setFailed(false)
              }}
              onShouldStartLoadWithRequest={(request) => {
                const policy = navigationPolicy(
                  origin,
                  request.url,
                  request.isTopFrame,
                )
                if (policy === "external")
                  void Linking.openURL(request.url).catch(() => {})
                return policy === "allow"
              }}
            />
          </>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  web: { flex: 1 },
  toolbar: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
  },
  title: { fontSize: 16, fontWeight: "600" },
  message: { padding: 24, gap: 16 },
  loading: { position: "absolute", top: "50%", left: "50%" },
})

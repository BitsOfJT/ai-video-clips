import Layout from "@/renderer/components/Layout";
import HomePage from "@/renderer/pages/HomePage";
import SettingsPage from "@/renderer/pages/SettingsPage";
import { useAppStore } from "@/renderer/store/useAppStore";

export default function App() {
  const view = useAppStore((state) => state.view);
  return <Layout>{view === "settings" ? <SettingsPage /> : <HomePage />}</Layout>;
}

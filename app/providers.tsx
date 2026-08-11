"use client";

import useLocalStorage from "@/hooks/use-local-storage";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider, useTheme } from "next-themes";
import { type Dispatch, type ReactNode, type SetStateAction, createContext } from "react";
import { Toaster } from "sonner";

export const AppContext = createContext<{
  font: string;
  setFont: Dispatch<SetStateAction<string>>;
  themeColor: string;
  setThemeColor: Dispatch<SetStateAction<string>>;
}>({
  font: "Default",
  setFont: () => {},
  themeColor: "Default",
  setThemeColor: () => {},
});

const ToasterProvider = () => {
  const { theme } = useTheme() as {
    theme: "light" | "dark" | "system";
  };
  return <Toaster theme={theme} />;
};

export default function Providers({ children }: { children: ReactNode }) {
  const [font, setFont] = useLocalStorage<string>("novel__font", "Default");
  const [themeColor, setThemeColor] = useLocalStorage<string>("novel__theme_color", "Default");

  return (
    <ThemeProvider attribute="class" enableSystem disableTransitionOnChange defaultTheme="light">
      <AppContext.Provider
        value={{
          font,
          setFont,
          themeColor,
          setThemeColor,
        }}
      >
        <ToasterProvider />
        {children}
        <Analytics />
        <SpeedInsights />
        <ThemeColorWrapper themeColor={themeColor} />
      </AppContext.Provider>
    </ThemeProvider>
  );
}

function ThemeColorWrapper({ themeColor }: { themeColor: string }) {
  // Apply theme class to body
  if (typeof window !== "undefined") {
    document.body.className = document.body.className.replace(/theme-\w+/g, "").trim();

    // Add new theme class if not default
    if (themeColor !== "Default") {
      document.body.classList.add(`theme-${themeColor.toLowerCase()}`);
    }
  }
  return null;
}

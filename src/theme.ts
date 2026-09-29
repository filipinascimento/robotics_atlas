import { createContext, useContext } from "react";
import { color as darkColor } from "./data";
export type ThemeMode = "light" | "dark";
export type ThemePreference = ThemeMode | "system";
export const THEME_STORAGE_KEY = "robotics-atlas-theme";
const lightColors = [
  "#087e68",
  "#365bb9",
  "#a76813",
  "#8054af",
  "#b53f65",
  "#187a9b",
  "#647719",
  "#a34b91",
  "#ac5731",
  "#477876",
];
export const visualThemes = {
  dark: {
    mode: "dark" as ThemeMode,
    color: darkColor,
    background: "#0c131b",
    text: "#dae3eb",
    muted: "#8393a2",
    grid: "#26333d",
    land: "#17242f",
    landBorder: "#3c5261",
    outline: "#e7f2fc",
    selectedOutline: "#ffffff",
    labelHalo: "#0c131b",
    count: "#061c27",
    brush: "#c1d8d1",
    mask: "#0a1018",
    leader: "#9bb6c4",
  },
  light: {
    mode: "light" as ThemeMode,
    color: (index: number) => lightColors[index] || "#647383",
    background: "#f5f8fb",
    text: "#173342",
    muted: "#526a7b",
    grid: "#dce5eb",
    land: "#e6edf2",
    landBorder: "#acbfcc",
    outline: "#ffffff",
    selectedOutline: "#162e3c",
    labelHalo: "#f5f8fb",
    count: "#ffffff",
    brush: "#147763",
    mask: "#f5f8fb",
    leader: "#617d8f",
  },
};
export type ThemeContextValue = typeof visualThemes.dark & {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
};
export const ThemeContext = createContext<ThemeContextValue>({
  ...visualThemes.dark,
  preference: "system",
  setPreference: () => {},
});
export const useTheme = () => useContext(ThemeContext);

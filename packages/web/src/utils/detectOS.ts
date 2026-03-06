import { Laptop, Monitor, Smartphone } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type DetectedOS = "macOS" | "iOS" | "Android" | "Windows" | "Linux" | "Unknown";

export interface OSInfo {
  os: DetectedOS;
  Icon: LucideIcon;
}

export function detectOS(userAgent: string | null | undefined): OSInfo {
  if (!userAgent) return { os: "Unknown", Icon: Monitor };

  const ua = userAgent.toLowerCase();
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    return { os: "iOS", Icon: Smartphone };
  }
  if (ua.includes("android")) {
    return { os: "Android", Icon: Smartphone };
  }
  if (ua.includes("macintosh") || ua.includes("mac os")) {
    return { os: "macOS", Icon: Laptop };
  }
  if (ua.includes("windows")) {
    return { os: "Windows", Icon: Monitor };
  }
  if (ua.includes("linux")) {
    return { os: "Linux", Icon: Monitor };
  }
  return { os: "Unknown", Icon: Monitor };
}

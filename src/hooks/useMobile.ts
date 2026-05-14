"use client";

import { useState, useEffect, useCallback } from "react";

interface MobileState {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isStandalone: boolean;
  hasTouchScreen: boolean;
  viewportHeight: number;
}

export function useMobile(): MobileState {
  const [state, setState] = useState<MobileState>({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    isIOS: false,
    isAndroid: false,
    isStandalone: false,
    hasTouchScreen: false,
    viewportHeight: 0,
  });

  useEffect(() => {
    const updateState = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const userAgent = navigator.userAgent;

      setState({
        isMobile: width < 768,
        isTablet: width >= 768 && width < 1024,
        isDesktop: width >= 1024,
        isIOS: /iPad|iPhone|iPod/.test(userAgent),
        isAndroid: /Android/.test(userAgent),
        isStandalone:
          window.matchMedia("(display-mode: standalone)").matches ||
          (window.navigator as { standalone?: boolean }).standalone === true,
        hasTouchScreen:
          "ontouchstart" in window ||
          navigator.maxTouchPoints > 0,
        viewportHeight: height,
      });
    };

    updateState();
    window.addEventListener("resize", updateState);
    window.addEventListener("orientationchange", updateState);

    // 监听视觉视口变化（键盘弹出）
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateState);
    }

    return () => {
      window.removeEventListener("resize", updateState);
      window.removeEventListener("orientationchange", updateState);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateState);
      }
    };
  }, []);

  return state;
}

// 检测键盘是否弹出
export function useKeyboardVisible(): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!window.visualViewport) return;

    const handleResize = () => {
      const viewport = window.visualViewport;
      if (!viewport) return;

      // 如果视口高度明显小于窗口高度，说明键盘弹出了
      const heightDiff = window.innerHeight - viewport.height;
      setIsVisible(heightDiff > 150);
    };

    window.visualViewport.addEventListener("resize", handleResize);
    return () => {
      window.visualViewport?.removeEventListener("resize", handleResize);
    };
  }, []);

  return isVisible;
}

// 触觉反馈（如果支持）
export function useHapticFeedback() {
  const vibrate = useCallback((pattern: number | number[] = 10) => {
    if ("vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  }, []);

  return { vibrate };
}

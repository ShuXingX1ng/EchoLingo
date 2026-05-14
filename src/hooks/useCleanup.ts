"use client";

import { useEffect, useRef, useCallback } from "react";

// 用于管理定时器的 hook，防止内存泄漏
export function useTimer() {
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const setTimer = useCallback((key: string, callback: () => void, delay: number) => {
    // 清除已存在的同名定时器
    const existing = timersRef.current.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      callback();
      timersRef.current.delete(key);
    }, delay);

    timersRef.current.set(key, timer);
  }, []);

  const clearTimer = useCallback((key: string) => {
    const timer = timersRef.current.get(key);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(key);
    }
  }, []);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  // 组件卸载时清理所有定时器
  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, [clearAllTimers]);

  return { setTimer, clearTimer, clearAllTimers };
}

// 用于管理 AbortController 的 hook
export function useAbortController() {
  const controllersRef = useRef<Map<string, AbortController>>(new Map());

  const getController = useCallback((key: string) => {
    let controller = controllersRef.current.get(key);
    if (!controller) {
      controller = new AbortController();
      controllersRef.current.set(key, controller);
    }
    return controller;
  }, []);

  const abort = useCallback((key: string) => {
    const controller = controllersRef.current.get(key);
    if (controller) {
      controller.abort();
      controllersRef.current.delete(key);
    }
  }, []);

  const abortAll = useCallback(() => {
    controllersRef.current.forEach((controller) => controller.abort());
    controllersRef.current.clear();
  }, []);

  // 组件卸载时中止所有请求
  useEffect(() => {
    return () => {
      abortAll();
    };
  }, [abortAll]);

  return { getController, abort, abortAll };
}

// 用于管理事件监听器的 hook
export function useEventListener() {
  const listenersRef = useRef<Array<{ target: EventTarget; type: string; handler: EventListener }>>([]);

  const addEventListener = useCallback(
    (target: EventTarget, type: string, handler: EventListener, options?: AddEventListenerOptions) => {
      target.addEventListener(type, handler, options);
      listenersRef.current.push({ target, type, handler });
    },
    []
  );

  // 组件卸载时移除所有事件监听器
  useEffect(() => {
    return () => {
      listenersRef.current.forEach(({ target, type, handler }) => {
        target.removeEventListener(type, handler);
      });
      listenersRef.current = [];
    };
  }, []);

  return { addEventListener };
}

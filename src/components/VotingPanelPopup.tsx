import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface VotingPanelPopupProps {
  /** Whether the popup should be open. */
  isOpen: boolean;
  /** Title for the popup window/document. */
  title?: string;
  /** Called when the popup is blocked by the browser. */
  onBlocked?: () => void;
  /** Called once the popup successfully opens. */
  onOpened?: () => void;
  /** Called when the popup window is closed (by the user or programmatically). */
  onClose?: () => void;
  children: React.ReactNode;
}

const POPUP_WIDTH = 800;
const POPUP_HEIGHT = 260;
const POPUP_FEATURES = `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},menubar=no,toolbar=no,location=no`;

/**
 * Copy the app's stylesheets into the popup document so portalled content is
 * styled. Vite injects styles as inline <style> tags in dev and as <link>
 * elements in a production build, so both are copied.
 */
function copyStyles(source: Document, target: Document) {
  const nodes = source.querySelectorAll('style, link[rel="stylesheet"]');
  nodes.forEach((node) => {
    target.head.appendChild(node.cloneNode(true));
  });

  // Carry over root-level CSS custom properties applied via inline styles or
  // the color-scheme, plus a sensible background so the panel matches the app.
  const rootBg = getComputedStyle(source.body).backgroundColor;
  target.body.style.margin = "0";
  target.body.style.backgroundColor = rootBg || "#1a1a1a";
}

/**
 * Renders its children inside a separate browser popup window via a React
 * portal. The popup mirrors the app's styles and reports blocked/closed state
 * so the host can offer a retry affordance.
 */
export function VotingPanelPopup({
  isOpen,
  title = "Voting Panel",
  onBlocked,
  onOpened,
  onClose,
  children,
}: VotingPanelPopupProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const windowRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep the latest callbacks in refs so the open/close logic doesn't need to
  // re-run when a parent passes new inline callbacks each render.
  const callbacksRef = useRef({ onBlocked, onOpened, onClose });
  useEffect(() => {
    callbacksRef.current = { onBlocked, onOpened, onClose };
  }, [onBlocked, onOpened, onClose]);

  useEffect(() => {
    // When closed (or unmounting) the effect's cleanup below handles teardown,
    // so there's nothing to do here.
    if (!isOpen) {
      return;
    }

    // Already open — nothing to do (guards against StrictMode double-invoke).
    if (windowRef.current && !windowRef.current.closed) {
      return;
    }

    const popup = window.open(
      "",
      "planning-poker-voting-panel",
      POPUP_FEATURES,
    );

    if (!popup) {
      callbacksRef.current.onBlocked?.();
      return;
    }

    windowRef.current = popup;
    popup.document.title = title;

    // A window opened with a fixed name is reused by the browser if one is
    // already open, in which case the size features are ignored and stale
    // content/styles remain. Reset the document and force the size so each
    // open reflects the current markup and dimensions.
    popup.document.head.innerHTML = "";
    popup.document.body.innerHTML = "";
    popup.resizeTo(POPUP_WIDTH, POPUP_HEIGHT);

    const mount = popup.document.createElement("div");
    mount.className = "voting-popup-root";
    popup.document.body.appendChild(mount);
    copyStyles(document, popup.document);
    // The portal target is a DOM node inside the freshly opened window — it's
    // the product of an imperative side effect and can't be derived during
    // render, so setting it here is the intended way to sync with the window.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContainer(mount);
    callbacksRef.current.onOpened?.();

    // Detect the user closing the popup window. beforeunload is unreliable
    // across browsers, so poll the closed flag as well.
    pollRef.current = setInterval(() => {
      if (popup.closed) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        windowRef.current = null;
        setContainer(null);
        callbacksRef.current.onClose?.();
      }
    }, 400);

    return () => {
      // Cleanup on unmount or when isOpen flips to false.
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (windowRef.current && !windowRef.current.closed) {
        windowRef.current.close();
      }
      windowRef.current = null;
      setContainer(null);
    };
  }, [isOpen, title]);

  if (!container) {
    return null;
  }

  return createPortal(children, container);
}

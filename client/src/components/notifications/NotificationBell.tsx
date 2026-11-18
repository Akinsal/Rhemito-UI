import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Drawer } from "vaul";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/contexts/NotificationContext";
import { NotificationPanelContent } from "./NotificationPanel";

// ─── Badge ────────────────────────────────────────────────────────────────────

function NotificationBadge({ count }: { count: number }): React.JSX.Element | null {
  if (count === 0) return null;

  const label = count > 99 ? "99+" : String(count);

  return (
    <motion.span
      key={count > 99 ? "99+" : count}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.6, opacity: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 20 }}
      className={cn(
        "absolute -top-2 -right-2.5 min-w-[22px] h-[19px] px-1.5",
        "bg-[#e04343] text-white",
        "ring-2 ring-white",
        "rounded-full text-[11px] font-bold leading-none",
        "flex items-center justify-center shadow-xs pointer-events-none"
      )}
      aria-hidden="true"
    >
      {label}
    </motion.span>
  );
}

// ─── Shared inner markup for the bell icon ───────────────────────────────────

function BellIcon({
  unreadCount,
}: {
  unreadCount: number;
}): React.JSX.Element {
  return (
    <>
      <Bell className="w-[18px] h-[18px] fill-white text-white" strokeWidth={1.75} />
      <AnimatePresence>
        {unreadCount > 0 && <NotificationBadge count={unreadCount} />}
      </AnimatePresence>
    </>
  );
}

// ─── Media query hook — mobile < 640px ──────────────────────────────────────

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 639px)").matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 639px)");
    const handler = (e: MediaQueryListEvent): void => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return isMobile;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function NotificationBell(): React.JSX.Element {
  const { unreadCount } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const isMobile = useIsMobile();

  const buttonClass = cn(
    "relative w-9 h-9 rounded-[10px] bg-[#3682df] hover:bg-[#2b72cc] text-white flex items-center justify-center transition-colors shadow-2xs cursor-pointer",
    isOpen && "bg-[#2b72cc]"
  );

  // Render only ONE variant — prevents the drawer Portal from leaking into desktop
  if (isMobile) {
    return (
      <Drawer.Root
        open={isOpen}
        onOpenChange={setIsOpen}
        snapPoints={[0.85]}
        activeSnapPoint={0.85}
        setActiveSnapPoint={() => undefined}
      >
        <Drawer.Trigger
          className={buttonClass}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          data-testid="button-notifications"
        >
          <BellIcon unreadCount={unreadCount} />
        </Drawer.Trigger>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" />
          <Drawer.Content
            className={cn(
              "fixed bottom-0 left-0 right-0 z-50 flex flex-col",
              "bg-card rounded-t-2xl border border-border max-h-[85vh]"
            )}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/20" />
            </div>
            <NotificationPanelContent onClose={() => setIsOpen(false)} />
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  // Desktop (>= 640px)
  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          className={buttonClass}
          aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
          data-testid="button-notifications"
        >
          <BellIcon unreadCount={unreadCount} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className={cn(
          "w-[380px] max-h-[420px] p-0 overflow-hidden",
          "flex flex-col shadow-lg border border-border rounded-xl"
        )}
      >
        <NotificationPanelContent onClose={() => setIsOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

import { ChevronDown, Menu } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { resetDeviceId } from "@/lib/deviceId";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { profileLabel, userInitials, welcomeName } from "@/lib/userDisplay";

interface HeaderProps {
  onMenuClick?: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, demoUser } = useAuth();
  const activeUser = user ?? demoUser;
  const fullName = activeUser
    ? [activeUser.firstName, activeUser.lastName].filter(Boolean).join(" ").trim() || welcomeName(activeUser)
    : "";

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {
      // session may already be gone
    }
    toast({
      title: "Logged out",
      description: "You have been signed out successfully.",
    });
    resetDeviceId();
    queryClient.clear();
    setLocation("/sign-in-sign-up");
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-white border-b border-[#f1f5f7] flex items-center justify-between px-4 md:px-10 z-40">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden w-10 h-10 flex items-center justify-center rounded-xl hover:bg-slate-100 active:scale-95 transition-all -ml-1 text-[#323130]"
          data-testid="button-mobile-menu"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <Link href="/" data-testid="link-logo-home">
          <div className="flex items-center cursor-pointer">
            <img
              src="/Rhemito-logo.svg"
              alt="Rhemito Logo"
              className="w-[26px] h-[33px] object-contain"
            />
          </div>
        </Link>
      </div>

      <div className="flex items-center gap-3.5 md:gap-4 ml-auto">
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              data-testid="button-profile-menu"
              className="inline-flex items-center gap-2.5 cursor-pointer focus-visible:outline-none"
            >
              <span
                data-testid="header-profile-label"
                className="hidden sm:inline text-sm md:text-[15px] font-bold text-[#201f1e] tracking-tight"
              >
                {profileLabel(activeUser)}
              </span>
              <span className="h-7 min-w-[34px] px-2 rounded-full bg-[#3b88eb] flex items-center justify-center shadow-2xs shrink-0">
                <span
                  data-testid="header-initials"
                  className="text-white font-medium text-xs leading-none"
                >
                  {userInitials(activeUser)}
                </span>
              </span>
              <ChevronDown className="w-4 h-4 text-[#201f1e] shrink-0" strokeWidth={2} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={10}
            className="min-w-[180px] rounded-md border border-[#e5e7eb] bg-white p-0 py-1.5 shadow-[0_6px_20px_rgba(0,0,0,0.08)]"
          >
            {fullName && (
              <div
                data-testid="header-dropdown-name"
                className="px-4 py-2 text-[13px] font-bold text-[#201f1e]"
              >
                {fullName}
              </div>
            )}
            <DropdownMenuItem
              data-testid="header-menu-my-account"
              onClick={() => setLocation("/settings?tab=accounts")}
              className="rounded-none px-4 py-2.5 text-[14px] font-normal text-[#323130] focus:bg-[#edf1f5] focus:text-[#201f1e] cursor-pointer"
            >
              My Account
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="header-menu-logout"
              onClick={handleLogout}
              className="rounded-none px-4 py-2.5 text-[14px] font-normal text-[#323130] focus:bg-[#edf1f5] focus:text-[#201f1e] cursor-pointer"
            >
              Log Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}


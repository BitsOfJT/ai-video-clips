import { cn } from "@/renderer/lib/utils";
import Sidebar from "@/renderer/components/Sidebar";
import UpdateBanner from "@/renderer/components/UpdateBanner";
import { TooltipProvider } from "@/renderer/components/ui/tooltip";

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
  /** Full-bleed main content (Long-Form Editor). Default keeps max-w-6xl. */
  contentWidth?: "default" | "full";
}

export default function Layout({ children, className, contentWidth = "default" }: LayoutProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex h-full w-full flex-col app-surface text-foreground", className)}>
        <UpdateBanner />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div
              className={cn(
                "min-h-0 flex-1",
                contentWidth === "full"
                  ? "overflow-hidden p-0"
                  : "mx-auto w-full max-w-6xl overflow-auto p-6 lg:p-8"
              )}
            >
              {children}
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

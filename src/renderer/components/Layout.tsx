import { cn } from "@/renderer/lib/utils";
import Sidebar from "@/renderer/components/Sidebar";
import UpdateBanner from "@/renderer/components/UpdateBanner";
import { TooltipProvider } from "@/renderer/components/ui/tooltip";

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

export default function Layout({ children, className }: LayoutProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex h-full w-full flex-col app-surface text-foreground", className)}>
        <UpdateBanner />
        <div className="flex min-h-0 flex-1">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            <div className="mx-auto min-h-full max-w-6xl p-6 lg:p-8">{children}</div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

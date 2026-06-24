import { cn } from "@/renderer/lib/utils";
import Sidebar from "@/renderer/components/Sidebar";
import { TooltipProvider } from "@/renderer/components/ui/tooltip";

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

export default function Layout({ children, className }: LayoutProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex h-full w-full app-surface text-foreground", className)}>
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto min-h-full max-w-6xl p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </TooltipProvider>
  );
}

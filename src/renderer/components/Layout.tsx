import { cn } from "@/renderer/lib/utils";
import Sidebar from "@/renderer/components/Sidebar";

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

export default function Layout({ children, className }: LayoutProps) {
  return (
    <div className={cn("flex h-full w-full app-surface text-foreground", className)}>
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto min-h-full max-w-6xl p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

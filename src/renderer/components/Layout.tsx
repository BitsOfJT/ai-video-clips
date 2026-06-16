import { cn } from "@/renderer/lib/utils";
import Sidebar from "@/renderer/components/Sidebar";

interface LayoutProps {
  children: React.ReactNode;
  className?: string;
}

export default function Layout({ children, className }: LayoutProps) {
  return (
    <div className={cn("flex h-full w-full bg-background text-foreground", className)}>
      <Sidebar />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}

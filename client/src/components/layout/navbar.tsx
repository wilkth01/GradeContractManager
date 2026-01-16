
import { Link } from "wouter";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useAuth } from "@/hooks/use-auth";

export function Navbar() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <Link to="/" className="text-lg font-bold">Contract Grading Portal</Link>
        </div>
        <div className="flex items-center gap-4">
          {user && <span className="text-sm text-muted-foreground">Logged in as {user.username}</span>}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

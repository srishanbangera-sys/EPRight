"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useAuth, homeFor } from "@/components/Providers";
import { Spinner } from "@/components/ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const wrongArea =
    !!user &&
    ((pathname.startsWith("/producer") && user.role !== "PRODUCER") ||
      (pathname.startsWith("/recycler") && user.role !== "RECYCLER") ||
      (pathname.startsWith("/admin") && user.role !== "ADMIN"));

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (wrongArea) router.replace(homeFor(user.role));
  }, [user, loading, wrongArea, router]);

  if (loading || !user || wrongArea) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner label="Opening EPRight" />
      </div>
    );
  }
  return <AppShell>{children}</AppShell>;
}

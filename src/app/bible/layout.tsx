import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function BibleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user || user.isAdmin > 8) {
    redirect("/");
  }

  return <>{children}</>;
}

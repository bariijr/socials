"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function useRequireAuth() {
  const router = useRouter();
  useEffect(() => {
    if (!window.localStorage.getItem("jetelio_access_token")) {
      router.replace("/login");
    }
  }, [router]);
}

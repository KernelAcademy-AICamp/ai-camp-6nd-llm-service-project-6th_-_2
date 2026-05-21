"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface CurrentUser {
  id: string;
  email: string | null;
}

// auth.users 기준의 현재 로그인 사용자.
// 도메인 프로필(profiles 테이블)이 필요할 땐 id로 별도 조회한다.
export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      const u = data.user;
      setUser(u ? { id: u.id, email: u.email ?? null } : null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      setUser(u ? { id: u.id, email: u.email ?? null } : null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

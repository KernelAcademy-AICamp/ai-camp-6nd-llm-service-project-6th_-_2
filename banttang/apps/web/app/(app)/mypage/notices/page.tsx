// 공지사항 — 정적 목록. 현재 출시 안내 1건. (UserBar 가 mypage 서브페이지에 ← 헤더 제공)
export const dynamic = "force-static";

type Notice = {
  id: string;
  title: string;
  date: string; // 표시용 (YYYY.MM.DD)
  body: string;
  badge?: string;
};

const NOTICES: Notice[] = [
  {
    id: "launch",
    title: "띵동 정식 출시 🎉",
    date: "2026.06.11",
    badge: "NEW",
    body: "오늘 띵동이 정식 출시되었어요! 같은 동네 이웃과 배달·장보기를 함께 나눠 합리적으로 소비해 보세요. 많은 관심 부탁드려요 🙌",
  },
];

export default function NoticesPage() {
  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="px-1 text-[16px] font-bold text-zinc-900">공지사항</h1>

      <ul className="flex flex-col gap-3">
        {NOTICES.map((n) => (
          <li key={n.id} className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              {n.badge && (
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold text-brand">
                  {n.badge}
                </span>
              )}
              <span className="text-[12px] text-zinc-400">{n.date}</span>
            </div>
            <h2 className="mt-1.5 text-[15px] font-bold text-zinc-900">{n.title}</h2>
            <p className="mt-2 whitespace-pre-line text-[14px] leading-relaxed text-zinc-600">
              {n.body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

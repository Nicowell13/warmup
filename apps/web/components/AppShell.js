'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { clearToken } from '../lib/auth';

const NAV = [
  { href: '/sessions', label: 'Sessions' },

  { href: '/campaigns', label: 'Campaigns' },
  { href: '/automations', label: 'Automations' },
  { href: '/groups', label: 'Groups' },
];

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

export default function AppShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-gray-900" />
            <div>
              <div className="text-sm font-semibold text-gray-900">WhatsApp Multi-Session</div>
              <div className="text-xs text-gray-500">Dashboard</div>
            </div>
          </div>

          <button
            className="rounded-md border px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            onClick={() => {
              clearToken();
              router.replace('/login');
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-[220px_1fr]">
        <aside className="rounded-xl border bg-white p-3">
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cx(
                    'rounded-lg px-3 py-2 text-sm font-medium',
                    active ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}

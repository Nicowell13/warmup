import RequireAuth from '../../components/RequireAuth';
import AppShell from '../../components/AppShell';

export default function AppLayout({ children }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

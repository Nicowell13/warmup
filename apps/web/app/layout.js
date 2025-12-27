export const metadata = {
  title: 'WAHA Multi-Session',
  description: 'Multi session + auto reply per session',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body style={{ fontFamily: 'system-ui, Arial', margin: 0, padding: 0 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: 16 }}>{children}</div>
      </body>
    </html>
  );
}

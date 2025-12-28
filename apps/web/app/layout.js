import './globals.css';

export const metadata = {
  title: 'WhatsApp Multi-Session',
  description: 'Multi session + auto reply per session',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="min-h-dvh bg-gray-50 text-gray-900">
        {children}
      </body>
    </html>
  );
}

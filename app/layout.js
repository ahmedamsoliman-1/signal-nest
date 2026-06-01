import "./globals.css";

export const metadata = {
  title: "SignalNest",
  description: "A branded monitoring platform for checking slow service portals on your behalf."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

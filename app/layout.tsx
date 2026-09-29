import "./globals.css";
import { getSession } from "@/lib/auth";
import Logout from "@/components/Logout";
import { Inter, Geist_Mono } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-mono", display: "swap" });

export const metadata = { title: "Salary Advance", description: "Salary advance request & approval workflow" };
export const viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession().catch(() => null);
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>
        <header className="topnav">
          <div className="inner">
            <a href="/" className="brand">
              <img src="/logo.png" alt="Autochek" width={32} height={32} />
              <span>Salary Advance</span>
            </a>
            {session ? (
              <div className="who">
                <a href="/staff" className="navlink">{session.name}</a>
                <span className="role">{session.role}</span>
                <Logout />
              </div>
            ) : <a href="/login" className="btn small">Staff sign in</a>}
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}

import {Inter} from "next/font/google";
import "./globals.css";

const inter = Inter({subsets: ["latin"]});

export const metadata = {
  title: "Ilysa - Chat Agent",
  description:
    "Integrated Chat Agent for personalized and efficient interactions.",
  icons: {
    icon: [{url: "/assets/favicon.ico", type: "image/x-icon"}],
  },
};

export default function RootLayout({children}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}

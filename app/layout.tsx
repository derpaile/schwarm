import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Schwarm — Ein Ozean. Kein Anführer.',
  description: 'Eine lebendige 2D-Unterwasserwelt. Beobachte Sardinenschwärme, Haie und Barrakudas, setze Fische aus und entdecke, wie aus einfachen Regeln gemeinsames Leben entsteht.',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}</body></html>;
}

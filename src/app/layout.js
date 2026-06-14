import { UserProvider } from '@/lib/contexts/UserContext'
import AppVersionWatcher from '@/components/AppVersionWatcher'
import './globals.css'

export const metadata = {
  title: 'Assessoria LP',
  description: 'Assessoria LP: dashboards, integrações e IA para leitura de performance de marketing.',
  icons: {
    icon: '/assessoria-lp-logo.png',
    apple: '/assessoria-lp-logo.png',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Cache-buster: runs before React, forces reload when build-version.txt changes */}
        <script dangerouslySetInnerHTML={{ __html: `
(function(){try{
  var v="a5fac07";
  var s=localStorage.getItem("_bv");
  if(!s){localStorage.setItem("_bv",v);}
  else if(s!==v){localStorage.setItem("_bv",v);window.location.reload(true);}
}catch(e){}}())
        `}} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap" rel="stylesheet" />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0"
          rel="stylesheet"
        />
        <link href='https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css' rel='stylesheet' />
      </head>
      <body className="font-sans antialiased">
        <UserProvider>
          <AppVersionWatcher />
          {children}
        </UserProvider>
      </body>
    </html>
  )
}

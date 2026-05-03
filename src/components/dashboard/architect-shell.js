import Link from 'next/link'
import styles from './architect-shell.module.css'

const NAV_ITEMS = [
  { key: 'search', label: 'Search', icon: 'search', href: '#' },
  { key: 'home', label: 'Home', icon: 'home', href: '/home' },
  { key: 'clientes', label: 'Clients', icon: 'domain', href: '/clientes' },
  { key: 'team', label: 'Team', icon: 'groups', href: '#' },
  { key: 'settings', label: 'Settings', icon: 'settings', href: '/?tab=settings' },
]

function NavLink({ item, active }) {
  const className = active ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink

  return (
    <Link href={item.href} className={className} aria-current={active ? 'page' : undefined}>
      <span className={`material-symbols-outlined ${styles.navIcon}`}>{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  )
}

export function ArchitectShell({
  activeNav,
  topTitle = 'Assessoria LP',
  topSubtitle,
  headerActions,
  userName = 'Master User',
  userRole = 'System Admin',
  children,
}) {
  return (
    <div className={styles.appShell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarBrand}>
          <div className={styles.sidebarLogo} aria-hidden="true"></div>
          <div>
            <h1>Assessoria LP</h1>
            <p>Performance Hub</p>
          </div>
        </div>

        <nav className={styles.sidebarNav} aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.key} item={item} active={item.key === activeNav} />
          ))}
        </nav>

        <div className={styles.sidebarProfile}>
          <div className={styles.avatarBadge}>{userName.slice(0, 2).toUpperCase()}</div>
          <div className={styles.sidebarProfileCopy}>
            <strong>{userName}</strong>
            <span>{userRole}</span>
          </div>
        </div>
      </aside>

      <main className={styles.mainContent}>
        <header className={styles.topbar}>
          <div className={styles.topbarTitleGroup}>
            <h2>{topTitle}</h2>
            {topSubtitle ? (
              <>
                <span className={styles.topbarDivider} />
                <p>{topSubtitle}</p>
              </>
            ) : null}
          </div>

          <div className={styles.topbarActions}>
            {headerActions}
            <button type="button" className={styles.iconButton} aria-label="Notifications">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button type="button" className={styles.iconButton} aria-label="Theme">
              <span className="material-symbols-outlined">contrast</span>
            </button>
            <Link href="/?tab=settings" className={styles.iconButton} aria-label="Settings">
              <span className="material-symbols-outlined">account_circle</span>
            </Link>
          </div>
        </header>

        <div className={styles.pageContent}>{children}</div>
      </main>

      <nav className={styles.mobileNav} aria-label="Mobile primary">
        {NAV_ITEMS.filter((item) => ['home', 'clientes', 'settings'].includes(item.key)).map((item) => {
          const active = item.key === activeNav
          return (
            <Link key={item.key} href={item.href} className={active ? `${styles.mobileNavLink} ${styles.mobileNavLinkActive}` : styles.mobileNavLink}>
              <span className="material-symbols-outlined">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

export function PageIntro({ kicker, title, description, badge }) {
  return (
    <section className={styles.pageIntro}>
      <div className={styles.pageIntroCopy}>
        {kicker ? <span className={styles.pageIntroKicker}>{kicker}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {badge ? <div className={styles.pageIntroBadge}>{badge}</div> : null}
    </section>
  )
}

export function StatCard({ label, value, meta, accent = 'primary', icon }) {
  return (
    <article className={`${styles.statCard} ${styles[`accent${accent[0].toUpperCase()}${accent.slice(1)}`]}`}>
      <div className={styles.statCardHeader}>
        <span>{label}</span>
        {icon ? <span className={`material-symbols-outlined ${styles.statCardIcon}`}>{icon}</span> : null}
      </div>
      <strong>{value}</strong>
      {meta ? <small>{meta}</small> : null}
    </article>
  )
}

export function SectionHeader({ title, action }) {
  return (
    <div className={styles.sectionHeader}>
      <div className={styles.sectionTitleWrap}>
        <span className={styles.sectionTitleBar} />
        <h3>{title}</h3>
      </div>
      {action ? <div className={styles.sectionAction}>{action}</div> : null}
    </div>
  )
}

export function InitialBadge({ label, tone = 'primary' }) {
  return <div className={`${styles.initialBadge} ${styles[`tone${tone[0].toUpperCase()}${tone.slice(1)}`]}`}>{label}</div>
}

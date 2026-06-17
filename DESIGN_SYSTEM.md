# Design System — Dash

Diretrizes visuais do app. Use como referência ao criar ou modificar componentes.

---

## Identidade Visual

O design é baseado no padrão estabelecido no checklist de onboarding: **dark, gradientes sutis, acento emerald (#26c281), nuvem radial no topo dos cards e bordas coloridas semi-transparentes.**

---

## Tokens de Cor

```css
--saas-primary:   #26c281   /* Emerald principal — botões, borders, kickers */
--saas-accent:    #4fdf9b   /* Emerald claro */
--accent-rgb:     38,194,129

/* Backgrounds */
--bg-dark:        #050506
--bg-panel:       #111113
--shell-sidebar:  rgba(8,8,10,0.95)

/* Texto */
--text-primary:   #f5f5f7
--text-secondary: rgba(245,245,247,0.72)
--text-muted:     rgba(245,245,247,0.44)

/* Bordas */
--border-color:   rgba(255,255,255,0.07)
--panel-radius:   20px
```

### Cores de estado
| Estado   | Cor principal | Fundo tintado          | Borda                   |
|----------|---------------|------------------------|-------------------------|
| Sucesso  | `#22c55e`     | `rgba(34,197,94,0.08)` | `rgba(34,197,94,0.25)`  |
| Atenção  | `#f59e0b`     | `rgba(245,158,11,0.08)`| `rgba(245,158,11,0.25)` |
| Perigo   | `#ef4444`     | `rgba(239,68,68,0.08)` | `rgba(239,68,68,0.25)`  |
| Info     | `#6366f1`     | `rgba(99,102,241,0.08)`| `rgba(99,102,241,0.2)`  |

---

## Gradientes de Fundo (Background Globals)

### Dashboard global (`.dashboard-container::before`)
```css
background:
  radial-gradient(ellipse 90% 55% at 55% -10%, rgba(38,194,129,0.13) 0%, transparent 65%),
  radial-gradient(circle at 18% 10%, rgba(255,255,255,0.025), transparent 22%),
  radial-gradient(circle at 84% 8%, rgba(255,255,255,0.018), transparent 18%),
  radial-gradient(circle at 55% 100%, rgba(255,255,255,0.03), transparent 30%);
```

### Sidebar (`.sidebar`)
```css
background:
  radial-gradient(ellipse 160% 40% at 50% 0%, rgba(38,194,129,0.12) 0%, transparent 60%),
  radial-gradient(circle at top left, rgba(255,255,255,0.03), transparent 28%),
  linear-gradient(180deg, rgba(255,255,255,0.026), rgba(255,255,255,0)),
  var(--shell-sidebar);
```

---

## Padrão de Hero Header (Seção / Aba)

Toda aba deve ter um bloco hero no topo com:
- Fundo com gradiente escuro + nuvem radial emerald no canto superior esquerdo
- Borda emerald semi-transparente
- Decoração radial absoluta no canto superior direito
- Kicker (label) uppercase emerald
- Título bold grande
- Subtítulo com opacidade reduzida

### CSS base
```css
.minha-hero {
  padding: 28px;
  border-radius: 24px;
  border: 1px solid rgba(38,194,129,0.2);
  background:
    radial-gradient(ellipse 100% 55% at 15% -10%, rgba(38,194,129,0.13) 0%, transparent 60%),
    linear-gradient(145deg, rgba(13,17,16,0.97), rgba(7,9,8,0.93));
  box-shadow: 0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(38,194,129,0.06);
  position: relative;
  overflow: hidden;
}

/* Decoração radial no canto direito */
.minha-hero::after {
  content: '';
  position: absolute;
  top: -60px; right: -60px;
  width: 220px; height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(38,194,129,0.08) 0%, transparent 70%);
  pointer-events: none;
}
```

### Kicker (label acima do título)
```css
.kicker {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.62rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--saas-primary);
  opacity: 0.9;
  margin-bottom: 6px;
}
```

### Classes prontas disponíveis (globals.css)
- `.management-hero` — hero com gradiente emerald (usado em Usuários)
- `.management-header-row` — header com título + botão de ação (usado em Clientes)
- `.management-card-kicker` — label kicker emerald uppercase

---

## Cards de Estatística

### Padrão emerald (`.management-stat-card`)
```css
.management-stat-card {
  padding: 12px 16px;
  border-radius: 12px;
  background: rgba(38,194,129,0.06);
  border: 1px solid rgba(38,194,129,0.14);
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: border-color 0.2s;
}
.management-stat-card:hover {
  border-color: rgba(38,194,129,0.28);
}
.management-stat-card small {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  opacity: 0.45;
}
.management-stat-card strong {
  font-size: 1.55rem;
  font-weight: 900;
  color: var(--saas-primary);
  line-height: 1;
}
```

### Card com nuvem radial (padrão completo)
```css
.stat-card-full {
  background:
    radial-gradient(ellipse 140% 65% at 50% -10%, rgba(38,194,129,0.12) 0%, transparent 65%),
    rgba(255,255,255,0.03);
  border: 1px solid rgba(38,194,129,0.18);
  border-radius: 16px;
  padding: 18px 20px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.stat-card-full:hover {
  border-color: rgba(38,194,129,0.32);
  box-shadow: 0 8px 28px rgba(38,194,129,0.09);
}
```

### Cards coloridos por estado (ex: saldos)
Adicione `danger`, `warning` ou `success` como classe extra:
```css
/* Perigo — vermelho */
.card.danger {
  background:
    radial-gradient(ellipse 140% 65% at 50% -10%, rgba(239,68,68,0.18) 0%, transparent 65%),
    rgba(239,68,68,0.05);
  border-color: rgba(239,68,68,0.28);
}
/* Atenção — laranja */
.card.warning {
  background:
    radial-gradient(ellipse 140% 65% at 50% -10%, rgba(245,158,11,0.18) 0%, transparent 65%),
    rgba(245,158,11,0.05);
  border-color: rgba(245,158,11,0.28);
}
/* Sucesso — verde */
.card.success {
  background:
    radial-gradient(ellipse 140% 65% at 50% -10%, rgba(38,194,129,0.18) 0%, transparent 65%),
    rgba(38,194,129,0.05);
  border-color: rgba(38,194,129,0.28);
}
```

---

## Glass Panel

O `.glass-panel` é o card genérico. No dark mode:
```css
background: var(--bg-panel);          /* #111113 */
border: 1px solid var(--border-color); /* rgba(255,255,255,0.07) */
border-radius: var(--panel-radius);    /* 20px */
```

Para dar identidade, adicione classes como `.management-directory-card`:
```css
.management-directory-card {
  border: 1px solid rgba(38,194,129,0.12) !important;
  background: linear-gradient(160deg, rgba(38,194,129,0.03) 0%, transparent 60%), var(--bg-panel) !important;
}
```

---

## Nuvem Radial — Receita

A "nuvem" é sempre um `radial-gradient` elíptico no topo do elemento:

```css
/* Topo centralizado (headers de seção) */
radial-gradient(ellipse 100% 55% at 50% -10%, rgba(38,194,129,0.13) 0%, transparent 60%)

/* Topo esquerdo (hero cards) */
radial-gradient(ellipse 100% 55% at 15% -10%, rgba(38,194,129,0.13) 0%, transparent 60%)

/* Decoração de canto (absoluta, via ::after) */
position: absolute; top: -60px; right: -60px;
width: 220px; height: 220px; border-radius: 50%;
background: radial-gradient(circle, rgba(38,194,129,0.08) 0%, transparent 70%);
```

**Intensidades:**
- Headers principais: `0.13–0.14` (mais visível)
- Cards de stat: `0.10–0.12` (médio)
- Shells / painéis grandes: `0.06–0.08` (sutil)

---

## Botões de Ação (Barra colorida no topo)

Para cards com indicador de estado visual, use `::before`:
```css
.card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
  border-radius: 16px 16px 0 0;
  background: transparent;
  transition: background 0.2s;
}
.card.danger::before  { background: rgba(248,113,113,0.9); }
.card.warning::before { background: rgba(245,158,11,0.9); }
.card.success::before { background: rgba(38,194,129,0.9); }
```

---

## Light Mode

Todas as classes com gradientes escuros têm override no light mode via:
```css
:root[data-ui-mode='light'] .minha-hero {
  background: linear-gradient(135deg, rgba(38,194,129,0.05) 0%, rgba(255,255,255,0.97) 100%) !important;
  border-color: rgba(38,194,129,0.2) !important;
}
```

Regra geral: no light mode, o fundo fica branco/quase-branco, a borda emerald fica levemente mais forte, e o gradiente escuro some.

---

## Hierarquia de Border Radius

| Elemento                  | Raio      |
|---------------------------|-----------|
| Modal / card principal    | `24px`    |
| Hero de seção             | `24–28px` |
| Stat card / glass-panel   | `16–20px` |
| Item de lista / input     | `10–12px` |
| Badge / chip / pill       | `999px`   |
| Barra de progresso        | `6px`     |

---

## Tipografia de Interface

| Elemento     | Tamanho        | Peso | Observação                        |
|--------------|----------------|------|-----------------------------------|
| Kicker       | `0.62rem`      | 800  | uppercase, `letter-spacing: 0.12em` |
| Título hero  | `1.4–1.9rem`   | 900  | `clamp()` responsivo              |
| Subtítulo    | `0.82–0.92rem` | 400  | `opacity: 0.48`                   |
| Label stat   | `0.65rem`      | 700  | uppercase, `opacity: 0.45`        |
| Número stat  | `1.55rem`      | 900  | `color: var(--saas-primary)`      |
| Body         | `0.85–0.9rem`  | 400  | —                                 |

---

## Abas e Onde Cada Padrão Foi Aplicado

| Aba                   | Arquivo                          | Classe principal                      |
|-----------------------|----------------------------------|---------------------------------------|
| Clientes              | `DashboardShell.js` + globals    | `.management-header-row`              |
| Usuários              | `DashboardShell.js` + globals    | `.management-hero`                    |
| Onboarding            | `DashboardShell.js`              | inline styles + `.management-stat-card` |
| Offboarding           | `DashboardShell.js`              | inline styles + `.management-stat-card` |
| Controle da Operação  | `globals.css`                    | `.weekly-command-center`, `.weekly-client-result-card` |
| Campanhas / Anúncios  | `DashboardShell.js` (embedded)   | `.ads-overview-hero`                  |
| Saldos                | `DashboardShell.js` (embedded)   | `.ad-balance-hero`, `.ad-balance-account-card` |
| Dash (cliente)        | `DashboardShell.js` (embedded)   | `.hero-panel`, `.hero-stat`           |
| Social Media          | `EditorialCalendar.js`           | `.editorial-header`, `.editorial-stat-card` |
| PAC                   | `PACCalendar.js`                 | `.pac-card`, `.pac-summary-card`      |
| G.R — Tarefas         | `DashboardShell.js`              | inline header (indigo theme)          |
| Configurações         | `settings/page.tsx`              | `.settings-block-hero`, `.settings-hero-kicker` |
| Notas                 | `ClientNotesPanel.js`            | `.ios-notes-shell`, `.ios-notes-list-header` |
| Busca                 | `assistant/page.tsx`             | `.assistant-shell`, `.assistant-empty` |

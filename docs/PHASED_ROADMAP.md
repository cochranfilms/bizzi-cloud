# Bizzi Cloud — Phased Enhancement Roadmap

A phased plan for UI/UX improvements, technical debt reduction, and beta readiness. Phases are ordered by dependency and risk; each phase builds on the previous.

---

## Phase 1: Foundation Utilities & Primitives

**Goal:** Extract shared utilities and introduce UI primitives so later phases can build on them without duplication.

**Scope:**

| Task | Location | Deliverables |
|------|----------|--------------|
| Extract shared utilities | New `src/lib/utils/` or `src/utils/` | `rectsIntersect`, `formatBytes`, `formatDate` (and any other duplicated helpers) in a single module |
| Update consumers | `FileGrid.tsx`, both trash pages, any other usages | Replace inline/copied logic with imports |
| Add UI primitives | `src/components/ui/` | `Button`, `Input`, `Modal` (base), `SearchInput` components |
| Document primitive usage | Inline JSDoc or README | When to use each, props, variants |

**Dependencies:** None  
**Risk:** Low  
**Estimated effort:** 2–3 days  

---

## Phase 2: Standardize Loading UX

**Goal:** Consistent loading patterns and copy across the app.

**Scope:**

| Task | Location | Deliverables |
|------|----------|--------------|
| Define loading patterns | Docs or `src/components/patterns/` | Decision: spinner vs skeleton by context (lists, cards, modals) |
| Add shared loading components | `src/components/ui/` or shared | `LoadingSpinner`, `LoadingSkeleton` variants (card, list, grid) |
| Consolidate loading copy | Constants or i18n prep | Single source for "Loading…", "Loading files…", etc. |
| Migrate key views | Dashboard, Enterprise, Admin | Apply patterns to high-traffic pages |

**Dependencies:** Phase 1 (can use new `Button` / layout primitives)  
**Risk:** Low  
**Estimated effort:** 1–2 days  

---

## Phase 3: Trash Page Refactor

**Goal:** Replace duplicated dashboard and enterprise trash pages with a shared component.

**Scope:**

| Task | Location | Deliverables |
|------|----------|--------------|
| Create shared `TrashPage` | `src/components/shared/TrashPage.tsx` (or similar) | Single component with `accent` / `variant` prop |
| Use shared utilities | TrashPage | `rectsIntersect`, `formatBytes`, `formatDate` from Phase 1 |
| Wire dashboard route | `src/app/dashboard/trash/page.tsx` | Thin wrapper with `accent="bizzi-blue"` |
| Wire enterprise route | `src/app/enterprise/trash/page.tsx` | Thin wrapper with `accent="--enterprise-primary"` |
| Remove duplication | Both trash pages | Delete ~700+ duplicated lines |

**Dependencies:** Phase 1 (utilities)  
**Risk:** Medium (trash is core UX)  
**Estimated effort:** 2–3 days  

---

## Phase 4: Internationalization (i18n)

**Goal:** Enable localization before more features ship.

**Scope:**

| Task | Location | Deliverables |
|------|----------|--------------|
| Add i18n library | `package.json` | `react-i18next` (or equivalent) |
| Add translation infra | `src/i18n/` | `i18n.ts`, `locales/en.json` (and any other locales) |
| Wrap app with provider | Root layout | `I18nextProvider` / `TranslationProvider` |
| Migrate strings | Incremental | Start with shared components (Button, Modal, TrashPage), then layouts, then pages |
| Centralize loading copy | `locales/en.json` | Single keys for loading states |

**Dependencies:** Phases 1–3 (better to translate shared components than duplicated ones)  
**Risk:** Low–medium (touches many files; incremental migration reduces risk)  
**Estimated effort:** 3–5 days (incremental over time)  

---

## Phase 5: Electron UI Alignment

**Goal:** Make the desktop Electron app match the web app visually and use shared design tokens.

**Scope:**

| Task | Location | Deliverables |
|------|----------|--------------|
| Share design tokens | Monorepo | Tailwind preset or shared config for `bizzi-*` colors, Geist |
| Align Electron styles | `desktop/` | Use shared tokens; replace `bg-zinc-950` with Bizzi palette |
| Match component styling | `desktop/src/` | AuthPanel, MountPanel, etc. use Bizzi branding |
| Mount flow UX | `mount-service.ts`, desktop UI | Polish mount status, errors, success states |
| NLE integration (if applicable) | Mount + docs | Verify FUSE/mount behavior with NLEs; document limitations |

**Dependencies:** None (can run in parallel with 2–4)  
**Risk:** Medium (Electron-specific quirks)  
**Estimated effort:** 3–4 days  

---

## Phase 6: Admin & Backend Polish

**Goal:** Remove TODOs and wire real backend behavior for admin and locale/currency.

**Scope:**

| Task | Location | Deliverables |
|------|----------|--------------|
| Implement admin auth | `AdminAuthGuard.tsx`, backend | Role check and validation instead of TODOs |
| Locale/currency settings | Admin settings, `formatCurrency.ts` | Connect to real locale/currency config |
| System status / sync (if used) | Admin layout | Replace hardcoded `systemStatus`, `lastSync`, `unreadAlerts` with real data or remove |
| Support / newsletter (optional) | Footer, admin support | Wire newsletter API; clarify support ticket flow |

**Dependencies:** Phase 4 (i18n) helps with locale; can start auth/formatCurrency before i18n  
**Risk:** Medium (auth is sensitive)  
**Estimated effort:** 2–3 days  

---

## Phase 7: Product Polish & Beta Readiness

**Goal:** Audit and harden shared galleries, transfers, mobile, and cross-account flows before wider beta.

**Scope:**

| Task | Area | Deliverables |
|------|------|--------------|
| **Shared galleries & transfers** | Public links, transfer views | Verify public links; transfer expiration; share-by-token behavior |
| **Mobile responsiveness** | Dashboard, Enterprise | Audit sm/md breakpoints; touch targets; modals on small screens |
| **Cross-account flows** | Enterprise, invites | Seat management, invite acceptance, permissions, edge cases |

**Dependencies:** Phases 1–6 (foundation in place)  
**Risk:** Low (mostly audit and polish)  
**Estimated effort:** 3–5 days (varies with findings)  

---

## Summary Table

| Phase | Name | Depends on | Effort |
|-------|------|------------|--------|
| 1 | Foundation Utilities & Primitives | — | 2–3 days |
| 2 | Standardize Loading UX | 1 | 1–2 days |
| 3 | Trash Page Refactor | 1 | 2–3 days |
| 4 | Internationalization (i18n) | 1, 2, 3 | 3–5 days |
| 5 | Electron UI Alignment | — | 3–4 days |
| 6 | Admin & Backend Polish | 4 (partial) | 2–3 days |
| 7 | Product Polish & Beta Readiness | 1–6 | 3–5 days |

---

## Suggested Execution Order

```
Phase 1 ────────────────────────────────────────────────►
Phase 2 ◄── Phase 1
Phase 3 ◄── Phase 1
Phase 5 ────────────────────────────────────────────────► (parallel with 2, 3)
Phase 4 ◄── Phases 1, 2, 3
Phase 6 ◄── Phase 4 (partial)
Phase 7 ◄── Phases 1–6
```

- **Week 1:** Phase 1 + start Phase 5 (Electron) in parallel  
- **Week 2:** Phase 2, Phase 3, continue Phase 5  
- **Week 3:** Phase 4 (i18n), Phase 6  
- **Week 4:** Phase 7 (beta polish)  

---

## Beta Focus Checklist

Use this during Phase 7 (and ongoing beta):

- [ ] Desktop Electron: Mount flow, NLE integration, visual consistency
- [ ] Admin panel: Auth flows, role checks, real system status
- [ ] Shared galleries: Public links, favorites, proofing
- [ ] Transfers: Creation, expiration, preview, download
- [ ] Mobile: Dashboard and Enterprise on small screens
- [ ] Enterprise: Seat management, invites, permissions

---

---

## Week 1 Progress (Started)

| Phase | Status | Notes |
|-------|--------|-------|
| **1** | ✅ Done | Utilities extracted, UI primitives added, consumers updated |
| **5** | ✅ Done | Shared preset, Electron UI aligned with Bizzi branding |

### Phase 1 deliverables
- `src/lib/utils/geometry.ts` – rectsIntersect
- `src/lib/utils/format.ts` – formatDate, re-exports formatBytes
- `src/lib/utils/index.ts` – barrel
- `src/components/ui/Button.tsx` – primary, secondary, ghost, danger
- `src/components/ui/Input.tsx`
- `src/components/ui/Modal.tsx`
- `src/components/ui/SearchInput.tsx`
- Updated: FileGrid, HomeStorageView, dashboard/trash, enterprise/trash

### Phase 5 deliverables
- `tailwind.bizzi.preset.js` – shared Bizzi tokens
- Desktop tailwind uses preset
- App.tsx, AuthPanel, MountPanel, LocalStorePanel, StreamCachePanel – Bizzi colors

---

## Completion Log

| Week | Completed |
|------|-----------|
| Week 1 | Phase 1 (utilities, primitives) + Phase 5 (Electron UI alignment) |
| Week 2 | Phase 2 (loading UX) + Phase 3 (trash refactor) |
| Week 3 | Phase 4 (i18n) + Phase 6 (admin auth, locale/currency) |
| Week 4 | Phase 7 (product polish & beta readiness) |

### Phase 7 deliverables (Week 4)
- **Shared galleries & transfers:** ShareView, SharedFolderContent, TransferView – "Back to home" links on expired/not-found states
- **Mobile responsiveness:** TransferFileRow, ShareFileRow – `flex-col sm:flex-row` layout; `min-h-[44px]` touch targets on Download buttons; ConfirmModal – 44px touch targets on action buttons
- **Enterprise cross-account flows:** PendingInvitesBanner – dismiss button, min-h-[44px] on Accept buttons

*Last updated: March 2025*

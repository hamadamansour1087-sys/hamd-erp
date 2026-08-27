'use client'

/**
 * Customers directory (Task 2-b).
 * Stats · debounced search (?q=) · desktop table / mobile cards · CRUD ·
 * account-statement sheet · quick RECEIPT voucher — read-only for cashiers.
 */

import * as React from 'react'
import {
  BookUser,
  FileText,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  UsersRound,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'

import PageHeader from '@/components/shared/page-header'
import StatCard from '@/components/shared/stat-card'
import EmptyState from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useI18n } from '@/lib/i18n'
import { useSession } from '@/stores/session'
import { ApiError, requestJson } from '@/hooks/use-api'
import type { SessionUser } from '@/lib/types'
import {
  BalanceChip,
  BalanceLegend,
  DeletePartyDialog,
  type PartyBase,
  PartyAvatar,
  PartyFormDialog,
  PeopleToolbar,
  PhoneLink,
  SignedMoney,
  StatementSheet,
  VoucherDialog,
  partyCollection,
  round2,
  usePeopleData,
} from './party-utils'

interface VoucherTarget {
  id: string
  name: string
  owed: number
}

/** Staff (ADMIN/MANAGER) may mutate; CASHIER is strictly read-only here. */
function isStaff(user: SessionUser | null): boolean {
  return user?.role === 'ADMIN' || user?.role === 'MANAGER'
}

export default function CustomersView() {
  const { t, num, money } = useI18n()
  const user = useSession((s) => s.user)
  const staff = isStaff(user)

  // ---------------- data ----------------
  const [q, setQ] = React.useState('')
  const { filtered, all, balances } = usePeopleData('customer', q)

  const owedMap = React.useMemo(
    () => new Map((balances.data?.customers ?? []).map((b) => [b.id, b.owed])),
    [balances.data]
  )
  const debtorsCount = React.useMemo(
    () => (balances.data?.customers ?? []).filter((b) => b.owed > 0.009).length,
    [balances.data]
  )
  const rows = React.useMemo(
    () =>
      (filtered.data ?? []).map((r) => ({ ...r, owed: round2(owedMap.get(r.id) ?? 0) })),
    [filtered.data, owedMap]
  )

  const searching = q.trim().length > 0
  const statsReady = !all.loading || !!all.data

  // ---------------- dialog state ----------------
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<PartyBase | null>(null)
  const [statementId, setStatementId] = React.useState<string | null>(null)
  const [voucherFor, setVoucherFor] = React.useState<VoucherTarget | null>(null)
  const [deleting, setDeleting] = React.useState<PartyBase | null>(null)
  const [delBusy, setDelBusy] = React.useState(false)
  const [detailSig, setDetailSig] = React.useState(0)

  function afterMutation() {
    void all.refetch()
    void filtered.refetch()
    void balances.refetch()
    setDetailSig((s) => s + 1)
  }

  async function confirmDelete(party: PartyBase | null) {
    if (!party) return
    setDelBusy(true)
    try {
      await requestJson(`${partyCollection('customer')}/${party.id}`, { method: 'DELETE' })
      toast.success(t('common.deleted'))
      setDeleting(null)
      if (statementId === party.id) setStatementId(null)
      afterMutation()
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.message === 'in-use') {
          toast.error(t('people.deleteBlockedCust'))
          setDeleting(null)
        } else if (e.queued) toast.info(t('common.savedOffline'))
        else toast.error(t('common.error'))
      } else toast.error(t('common.error'))
    } finally {
      setDelBusy(false)
    }
  }

  // ---------------- render ----------------
  return (
    <div>
      <PageHeader
        icon={<UsersRound className="size-5" aria-hidden />}
        title={t('nav.customers')}
        subtitle={t('people.customersSub')}
      />

      {/* stats */}
      {!statsReady ? (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[92px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label={t('people.statTotalCustomers')}
            value={num(all.data?.length ?? 0, 0)}
            icon={UsersRound}
            tone="default"
          />
          <StatCard
            label={t('people.statReceivables')}
            value={money(balances.data?.totals.receivables ?? 0)}
            icon={Wallet}
            tone="danger"
          />
          <StatCard
            label={t('people.statDebtors')}
            value={num(debtorsCount, 0)}
            icon={BookUser}
            tone="warn"
          />
        </div>
      )}

      {/* sticky toolbar */}
      <PeopleToolbar
        value={q}
        onChange={setQ}
        placeholder={t('people.searchCustomers')}
        addAction={
          staff ? (
            <Button
              size="sm"
              className="min-h-9 shrink-0"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="size-4" aria-hidden />
              {t('people.addCustomer')}
            </Button>
          ) : undefined
        }
      />

      {/* list */}
      {filtered.loading && !filtered.data ? (
        <ListSkeleton />
      ) : rows.length === 0 ? (
        searching ? (
          <EmptyState icon={Search} title={t('people.noResults')} hint={t('people.noResultsHint')} />
        ) : (
          <EmptyState
            icon={UsersRound}
            title={t('people.emptyCustomers')}
            hint={t('people.emptyCustomersHint')}
            action={
              staff ? (
                <Button
                  onClick={() => {
                    setEditing(null)
                    setFormOpen(true)
                  }}
                >
                  <Plus className="size-4" aria-hidden />
                  {t('people.addCustomer')}
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          {/* desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border scrollbar-thin md:block">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="whitespace-nowrap">{t('common.name')}</TableHead>
                  <TableHead className="whitespace-nowrap">{t('common.phone')}</TableHead>
                  <TableHead className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      {t('people.colBalance')}
                      <BalanceLegend tip={t('people.legendOwedYou')} />
                    </span>
                  </TableHead>
                  <TableHead className="w-px whitespace-nowrap text-end">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setStatementId(r.id)
                    }}
                    aria-label={`${r.name} — ${t('people.statementTitle')}`}
                    className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                    onClick={() => setStatementId(r.id)}
                  >
                    <td className="max-w-[24ch] px-3 py-2.5 align-middle">
                      <p className="truncate font-semibold leading-tight">{r.name}</p>
                      {r.address ? (
                        <p className="truncate text-xs text-muted-foreground">{r.address}</p>
                      ) : r.notes ? (
                        <p className="truncate text-xs italic text-muted-foreground">{r.notes}</p>
                      ) : null}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2.5 align-middle text-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {r.phone ? (
                        <PhoneLink phone={r.phone} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td
                      className="whitespace-nowrap px-3 py-2.5 align-middle"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex flex-col items-start gap-1">
                        <SignedMoney owed={r.owed} kind="customer" />
                        <BalanceChip owed={r.owed} kind="customer" />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
                      <RowActions
                        staff={staff}
                        statementLabel={t('people.statementTitle')}
                        voucherLabel={t('people.receiptTitle')}
                        editLabel={t('common.edit')}
                        deleteLabel={t('common.delete')}
                        onStatement={() => setStatementId(r.id)}
                        onVoucher={() => setVoucherFor({ id: r.id, name: r.name, owed: r.owed })}
                        onEdit={() => {
                          setEditing(r)
                          setFormOpen(true)
                        }}
                        onDelete={() => setDeleting(r)}
                      />
                    </td>
                  </tr>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* mobile cards */}
          <div className="space-y-2.5 md:hidden">
            {rows.map((r) => (
              <Card
                key={r.id}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setStatementId(r.id)
                }}
                onClick={() => setStatementId(r.id)}
                className="cursor-pointer py-0 shadow-sm transition-shadow hover:shadow-md"
              >
                <CardContent className="space-y-2.5 px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <PartyAvatar name={r.name} className="size-10" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold leading-tight">{r.name}</p>
                      {r.phone ? (
                        <p
                          dir="ltr"
                          className="num-ltr mt-0.5 flex items-center gap-1 text-start text-xs text-muted-foreground"
                        >
                          <Phone className="size-3 shrink-0" aria-hidden />
                          {r.phone}
                        </p>
                      ) : null}
                    </div>
                    <FileText className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
                  </div>

                  <div className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2">
                    <span className="text-xs text-muted-foreground">{t('people.colBalance')}</span>
                    <span className="flex items-center gap-2">
                      <SignedMoney owed={r.owed} kind="customer" className="text-sm" />
                      <BalanceChip owed={r.owed} kind="customer" />
                    </span>
                  </div>

                  <RowActionsMobile
                    staff={staff}
                    voucherLabel={t('people.receiptTitle')}
                    editLabel={t('common.edit')}
                    deleteLabel={t('common.delete')}
                    onEdit={() => {
                      setEditing(r)
                      setFormOpen(true)
                    }}
                    onVoucher={() => setVoucherFor({ id: r.id, name: r.name, owed: r.owed })}
                    onDelete={() => setDeleting(r)}
                  />
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            {t('people.statTotalCustomers')}: {num(rows.length, 0)}
            {filtered.loading ? ' …' : ''}
          </p>
        </>
      )}

      {/* dialogs */}
      <PartyFormDialog
        kind="customer"
        open={formOpen}
        editing={editing}
        onOpenChange={setFormOpen}
        onSaved={afterMutation}
      />

      <StatementSheet
        kind="customer"
        open={statementId !== null}
        partyId={statementId}
        voucherAllowed={staff}
        reloadSignal={detailSig}
        onOpenChange={(o) => !o && setStatementId(null)}
        onRequestVoucher={(s) => setVoucherFor({ id: s.id, name: s.name, owed: s.owed })}
      />

      {voucherFor ? (
        <VoucherDialog
          kind="customer"
          open={!!voucherFor}
          partyId={voucherFor.id}
          partyName={voucherFor.name}
          partyOwed={voucherFor.owed}
          onOpenChange={(o) => !o && setVoucherFor(null)}
          onDone={afterMutation}
        />
      ) : null}

      <DeletePartyDialog
        kind="customer"
        target={deleting}
        busy={delBusy}
        onConfirm={() => void confirmDelete(deleting)}
        onClose={() => setDeleting(null)}
      />
    </div>
  )
}

// ---------------------------------------------------------------- action cells

function RowActions({
  staff,
  statementLabel,
  voucherLabel,
  editLabel,
  deleteLabel,
  onStatement,
  onVoucher,
  onEdit,
  onDelete,
}: {
  staff: boolean
  statementLabel: string
  voucherLabel: string
  editLabel: string
  deleteLabel: string
  onStatement: () => void
  onVoucher: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  if (!staff) {
    return (
      <Button variant="ghost" size="icon" className="size-8" aria-label={statementLabel} title={statementLabel} onClick={onStatement}>
        <FileText className="size-4" aria-hidden />
      </Button>
    )
  }
  return (
    <div className="flex items-center justify-end gap-0.5">
      <Button variant="ghost" size="icon" className="size-8" aria-label={statementLabel} title={statementLabel} onClick={onStatement}>
        <FileText className="size-4" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
        aria-label={voucherLabel}
        title={voucherLabel}
        onClick={onVoucher}
      >
        <ReceiptText className="size-4" aria-hidden />
      </Button>
      <Button variant="ghost" size="icon" className="size-8" aria-label={editLabel} title={editLabel} onClick={onEdit}>
        <Pencil className="size-4" aria-hidden />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-destructive hover:text-destructive"
        aria-label={deleteLabel}
        title={deleteLabel}
        onClick={onDelete}
      >
        <Trash2 className="size-4" aria-hidden />
      </Button>
    </div>
  )
}

function RowActionsMobile({
  staff,
  voucherLabel,
  editLabel,
  deleteLabel,
  onEdit,
  onVoucher,
  onDelete,
}: {
  staff: boolean
  voucherLabel: string
  editLabel: string
  deleteLabel: string
  onEdit: () => void
  onVoucher: () => void
  onDelete: () => void
}) {
  if (!staff) return null
  return (
    <div className="grid grid-cols-3 gap-2 pt-0.5" onClick={(e) => e.stopPropagation()}>
      <Button variant="outline" size="sm" className="min-h-9" onClick={onVoucher}>
        <ReceiptText className="size-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
        {voucherLabel}
      </Button>
      <Button variant="outline" size="sm" className="min-h-9" onClick={onEdit}>
        <Pencil className="size-3.5" aria-hidden />
        {editLabel}
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="min-h-9 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" aria-hidden />
        {deleteLabel}
      </Button>
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-14 w-full rounded-lg" />
      ))}
    </div>
  )
}

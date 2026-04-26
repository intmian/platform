export type MoneyBook = {
    schemaVersion: number
    id: string
    name: string
    primaryBalanceAccountId: string
    enabled: boolean
    deleted: boolean
    viewerUsers: string[]
    createdAt: string
    updatedAt: string
}

export type MoneyBookArchive = {
    schemaVersion: number
    exportedAt: string
    book: MoneyBook
    items: MoneyItem[]
    records: ReconciliationRecord[]
}

export type MoneyItem = {
    id: string
    bookId: string
    name: string
    type: string
    enabled: boolean
    sort: number
    includeInReconcile: boolean
    includeInCash: boolean
    includeInInvestmentProfit: boolean
    includeInNetAsset: boolean
    includeInLiability: boolean
    note: string
}

export type ReconciliationEntry = {
    itemId: string
    itemNameSnapshot: string
    itemTypeSnapshot: string
    includeInReconcileSnapshot: boolean
    includeInLiabilitySnapshot: boolean
    previousValueCents: number
    currentValueCents: number
    bookValueCents: number
    actualValueCents: number
    changeCents: number
    annualizedRate: number
    note: string
}

export type MoneySummary = {
    cashCents: number
    netAssetCents: number
    liabilityCents: number
    totalAssetCents: number
    netAssetChangeCents: number
    investmentProfitCents: number
    netAssetLiabilityRate: number
    assetLiabilityRate: number
    positiveAssetCents: number
    calculationWarningMessages: string[]
}

export type MoneyEvent = {
    id: string
    date: string
    content: string
}

export type ReconciliationRecord = {
    schemaVersion: number
    id: string
    bookId: string
    date: string
    status: string
    intervalDays: number
    entries: ReconciliationEntry[]
    events: MoneyEvent[]
    source: string
    sourceRef: string
    createdBy: string
    confirmedBy: string
    createdAt: string
    updatedAt: string
    confirmedAt: string
}

export type MoneyRecordIndexItem = {
    id: string
    bookId: string
    date: string
    status: string
    createdBy: string
    confirmedBy: string
    createdAt: string
    confirmedAt: string
    source: string
    sourceRef: string
}

export type MoneyDashboardTrendItem = {
    date: string
    cashCents: number
    netAssetCents: number
    liabilityCents: number
    totalAssetCents: number
    investmentProfitCents: number
    assetLiabilityRate: number
}

export type MoneyDashboard = {
    book: MoneyBook
    items: MoneyItem[]
    latestRecordId: string
    latestDate: string
    records: ReconciliationRecord[]
    events: MoneyEvent[]
}

export type MoneyImportPreviewSheet = {
    sheetName: string
    date: string
    valid: boolean
    warnings: string[]
    summary: MoneySummary
    events: MoneyEvent[]
    rowsRead: number
}

export type MoneyImportPreview = {
    id: string
    bookId: string
    fileName: string
    sheets: MoneyImportPreviewSheet[]
    warnings: string[]
    createdAt: string
}
